/**
 * JARVIS Core — the thinking part: Claude, with tools.
 * One call to `runAgent` is one piece of thinking: Claude may call tools (read the inbox, set an alarm,
 * message you…) as many times as it needs, and every tool call runs here in the app, never on Anthropic's side
 * (except web search, which Anthropic runs).
 */
const API = () => process.env.JARVIS_ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages';
/** US dollars per million tokens (input, output), for the spend meter. An estimate; your Anthropic console is the truth. */
const PRICES = {haiku: [1, 5], sonnet: [3, 15], opus: [5, 25], fable: [15, 75], mythos: [15, 75]};
export const priceFor = model => PRICES[Object.keys(PRICES).find(k => String(model).includes(k))] || PRICES.sonnet;
export function costOf(model, usage = {}) {
  const [pi, po] = priceFor(model);
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  return (input * pi + (usage.output_tokens || 0) * po) / 1e6 + (usage.server_tool_use?.web_search_requests || 0) * 0.01;
}
const wait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener?.('abort', () => { clearTimeout(t); rej(Error('Stopped.')); }, {once: true}); });

/** One request to the Messages API, with retries for "busy" answers. */
export async function claude({key, model, system, messages, tools, maxTokens = 2000, signal, toolChoice, fetchImpl}) {
  if (!key) throw Error('No Claude API key yet. Add it in Settings → JARVIS Core (it is shared with the tower).');
  const body = {model, max_tokens: maxTokens, messages};
  if (system) body.system = typeof system === 'string' ? [{type: 'text', text: system, cache_control: {type: 'ephemeral'}}] : system;
  if (tools?.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  const f = fetchImpl || fetch;
  for (let tries = 0; ; tries++) {
    let res;
    try {
      res = await f(API(), {method: 'POST', signal: signal || AbortSignal.timeout(180000),
        headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'}, body: JSON.stringify(body)});
    } catch (e) {
      if (signal?.aborted) throw Error('Stopped.');
      if (tries < 2) { await wait(3000 * (tries + 1), signal); continue; }
      throw Error(`Could not reach Claude: ${e.message}`);
    }
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && tries < 3) {
      const after = Number(res.headers.get('retry-after')) || 0;
      await wait(Math.min(30000, Math.max(after * 1000, 4000 * (tries + 1))), signal); continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      if (res.status === 401) throw Error('Claude turned the API key down (401). Check the key in Settings.');
      if (res.status === 404 && /model/i.test(msg)) throw Error(`Claude does not know the model "${model}". Pick another in Settings → JARVIS Core.`);
      throw Error(`Claude API ${res.status}: ${msg}`);
    }
    data.cost = costOf(model, data.usage);
    return data;
  }
}

/**
 * Think with tools. `tools` = [{name, description, input_schema, run(input, ctx) -> any}].
 * `serverTools` are Anthropic-run tools such as web search. Returns the final words plus a record of every tool call.
 */
export async function runAgent({key, model, system, prompt, messages: history, tools = [], serverTools = [], maxSteps = 12, maxTokens = 2500, signal, onEvent, ctx = {}, budget = Infinity, fetchImpl}) {
  const messages = history ? [...history] : [];
  if (prompt) messages.push({role: 'user', content: prompt});
  const defs = [...tools.map(t => ({name: t.name, description: t.description, input_schema: t.input_schema || {type: 'object', properties: {}}})), ...serverTools];
  const byName = new Map(tools.map(t => [t.name, t]));
  let cost = 0, steps = 0, text = '';
  const calls = [];
  for (;;) {
    if (signal?.aborted) throw Error('Stopped.');
    const res = await claude({key, model, system, messages, tools: defs, maxTokens, signal, fetchImpl});
    cost += res.cost; steps++;
    const content = res.content || [];
    messages.push({role: 'assistant', content});
    if (content.some(b => /tool_result$/.test(b.type) && b.type !== 'tool_result')) ctx.tainted = true;   // web search results are outside content too
    const said = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (said) { text = said; onEvent?.({kind: 'text', text: said}); }
    const uses = content.filter(b => b.type === 'tool_use');
    if (res.stop_reason === 'pause_turn') { if (steps >= maxSteps) break; continue; }   // a long web search: let it carry on
    if (res.stop_reason !== 'tool_use' || !uses.length) break;
    if (steps >= maxSteps || cost >= budget) {
      // out of room: tell Claude so it can wrap up in words
      messages.push({role: 'user', content: uses.map(u => ({type: 'tool_result', tool_use_id: u.id, content: 'Not run: the step or spending limit for this job was reached. Summarise where things stand.', is_error: true}))});
      const last = await claude({key, model, system, messages, tools: defs, maxTokens: 800, signal, fetchImpl, toolChoice: {type: 'none'}}).catch(() => null);
      if (last) { cost += last.cost; messages.push({role: 'assistant', content: last.content || []}); const t2 = (last.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim(); if (t2) text = t2; }
      break;
    }
    const results = [];
    for (const u of uses) {
      const tool = byName.get(u.name);
      let out, isError = false;
      onEvent?.({kind: 'tool', name: u.name, input: u.input});
      try {
        if (!tool) throw Error(`There is no tool called ${u.name}.`);
        out = await tool.run(u.input || {}, ctx);
      } catch (e) { out = `Error: ${e.message}`; isError = true; }
      const str = typeof out === 'string' ? out : JSON.stringify(out ?? null);
      calls.push({name: u.name, input: u.input, result: str.slice(0, 2000), error: isError});
      results.push({type: 'tool_result', tool_use_id: u.id, content: str.length > 16000 ? str.slice(0, 16000) + '\n…(cut short)' : str, ...(isError ? {is_error: true} : {})});
    }
    messages.push({role: 'user', content: results});
  }
  return {text, messages, cost, steps, calls};
}

/** A single answer, no tools: for sorting email, writing a report, checking facts. */
export async function ask({key, model, system, prompt, maxTokens = 1500, signal, fetchImpl}) {
  const res = await claude({key, model, system, messages: [{role: 'user', content: prompt}], maxTokens, signal, fetchImpl});
  return {text: (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), cost: res.cost, usage: res.usage};
}
