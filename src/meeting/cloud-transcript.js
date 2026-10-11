/**
 * Accurate meeting transcripts with who said what, from AssemblyAI on its European servers: the audio stays in the EU
 * and is not used to train their models. After a meeting the recording is uploaded, transcribed in British English
 * with speaker labels, and the transcript is deleted from their servers as soon as it is back (their copy of the
 * upload is removed within 48 hours). Only when you have added your AssemblyAI key in Settings, JARVIS Core;
 * otherwise, or if anything fails, the offline Windows transcript is used as before.
 */
export const BASE = 'https://api.eu.assemblyai.com';
export const RATE = 0.23;   // dollars per hour of audio: Universal-3.5 Pro ($0.21) and speaker labels ($0.02)
const MODELS = ['universal-3-5-pro', 'universal-2'];   // the better model, falling back to the cheaper one
export const costOf = seconds => Math.max(0, Number(seconds) || 0) / 3600 * RATE;
const clock = sec => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
async function why(res, step) {
  let msg = ''; try { const j = await res.json(); msg = j.error || j.message || ''; } catch {}
  if (res.status === 401) return 'AssemblyAI did not accept the key. Check it in Settings, JARVIS Core.';
  return `AssemblyAI could not ${step} the recording (${res.status}${msg ? `: ${String(msg).slice(0, 160)}` : ''}).`;
}
/** "[1:05] Speaker A: …" lines, one per turn. */
export function transcriptText(utterances) { return utterances.map(u => `[${clock(u.start)}] Speaker ${u.speaker}: ${String(u.text || '').replace(/\s+/g, ' ').trim()}`).join('\n'); }

/**
 * Upload, transcribe and fetch. bytes: the recording (a Buffer). Returns {utterances: [{speaker, start, end, text}],
 * text, duration, cost}. onStatus(text) reports progress for the screen.
 */
export async function cloudTranscript({bytes, key, fetchImpl = fetch, onStatus = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)), timeout = 30 * 60e3, now = () => Date.now()}) {
  if (!key) throw Error('No AssemblyAI key.');
  if (!bytes?.length) throw Error('The meeting has no recording to send.');
  const auth = {authorization: key};
  onStatus('Sending the recording for an accurate transcript…');
  const up = await fetchImpl(`${BASE}/v2/upload`, {method: 'POST', headers: {...auth, 'content-type': 'application/octet-stream'}, body: bytes});
  if (!up.ok) throw Error(await why(up, 'take'));
  const {upload_url: audio} = await up.json();
  const start = body => fetchImpl(`${BASE}/v2/transcript`, {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  const body = {audio_url: audio, speaker_labels: true, language_code: 'en_uk', speech_models: MODELS};
  let res = await start(body);
  if (res.status === 400) { const {speech_models, ...plain} = body; res = await start(plain); }   // a model or field name it no longer knows: its default model
  if (!res.ok) throw Error(await why(res, 'transcribe'));
  let t = await res.json(); const id = t.id;
  try {
    const t0 = now();
    while (t.status !== 'completed') {
      if (t.status === 'error') throw Error(`AssemblyAI could not transcribe the recording: ${String(t.error || 'unknown error').slice(0, 160)}`);
      if (now() - t0 > timeout) throw Error('AssemblyAI took too long; the offline transcript is used instead.');
      onStatus('Writing an accurate transcript, with who said what…');
      await sleep(3000);
      const g = await fetchImpl(`${BASE}/v2/transcript/${id}`, {headers: auth});
      if (!g.ok) throw Error(await why(g, 'check'));
      t = await g.json();
    }
    const utterances = (t.utterances || []).map(u => ({speaker: String(u.speaker || '?'), start: (Number(u.start) || 0) / 1000, end: (Number(u.end) || 0) / 1000, text: String(u.text || '')})).filter(u => u.text.trim());
    const duration = Number(t.audio_duration) || (utterances.length ? utterances[utterances.length - 1].end : 0);
    return {utterances, text: String(t.text || ''), duration, cost: costOf(duration)};
  } finally {
    if (id) Promise.resolve(fetchImpl(`${BASE}/v2/transcript/${id}`, {method: 'DELETE', headers: auth})).catch(() => {});   // off their servers as soon as we have it
  }
}
