import {dayKey} from './util.js';

const MAX_BYTES = 4 * 1024 * 1024, MAX_SECONDS = 300, RESERVE = 0.03;
/** WhatsApp sends Ogg Opus. Refuse unknown containers rather than guess their duration. */
export function opusSeconds(data) {
  let pos = 0, serial, end = 0n, skip = 0, head = false, eos = false;
  while (pos < data.length) {
    if (pos + 27 > data.length || data.toString('ascii', pos, pos + 4) !== 'OggS' || data[pos + 4] !== 0) throw Error('The voice note is not a complete Ogg recording.');
    const count = data[pos + 26], start = pos + 27 + count;
    if (start > data.length) throw Error('The voice note is incomplete.');
    let size = 0; for (let i = pos + 27; i < start; i++) size += data[i];
    if (start + size > data.length) throw Error('The voice note is incomplete.');
    const s = data.readUInt32LE(pos + 14); if (serial !== undefined && s !== serial) throw Error('Send one voice note at a time.'); serial = s;
    if (!head) { if (size < 19 || data.toString('ascii', start, start + 8) !== 'OpusHead') throw Error('Send a WhatsApp voice note in Ogg Opus format.'); skip = data.readUInt16LE(start + 10); head = true; }
    const g = data.readBigUInt64LE(pos + 6); if (g !== 0xffffffffffffffffn) end = g;
    eos = !!(data[pos + 5] & 4); pos = start + size;
  }
  const seconds = (Number(end) - skip) / 48000;
  if (!head || !eos || !(seconds > 0 && seconds <= MAX_SECONDS)) throw Error('Please send a voice note shorter than five minutes.');
  return seconds;
}
export async function boundedAudio(response) {
  if (!response.ok) throw Error(`Could not download the voice note (${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('The voice note is too large (maximum 4 MB).');
  const reader = response.body?.getReader(); if (!reader) throw Error('The audio download is empty.');
  let size = 0; const chunks = [];
  try { for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw Error('The voice note is too large (maximum 4 MB).'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
export class VoiceNotes {
  constructor({store, phone, fetchImpl = fetch}) { Object.assign(this, {store, phone, f: fetchImpl}); this.busy = false; }
  async transcribe(message) {
    if (this.busy) throw Error('Another voice note is being transcribed. Please send this one again shortly.');
    this.busy = true;
    try {
      const config = this.store.get().voiceNotes || {};
      if (!config.enabled || !this.store.secret('openaiKey')) throw Error('Enable voice notes and add your OpenAI API key in Settings → JARVIS Core → Voice notes.');
      if (message.via !== 'whatsapp' || !/^SM[0-9a-f]{32}$/i.test(message.sid) || message.media !== 1) throw Error('Send one WhatsApp audio note at a time.');
      if (Date.now() - message.at > 15 * 60000) throw Error('This voice note arrived while I was away. Please send it again if you still want me to act on it.');
      const p = this.phone, record = await p.twilio('GET', `/Messages/${message.sid}.json`), c = p.config();
      if (record.direction !== 'inbound' || record.from !== `whatsapp:${p.to()}` || record.to !== `whatsapp:${c.whatsappFrom}` || record.sid !== message.sid) throw Error('The voice note could not be verified as yours.');
      const list = await p.twilio('GET', `/Messages/${message.sid}/Media.json`);
      const media = list.media_list;
      if (!Array.isArray(media) || media.length !== 1 || !/^ME[0-9a-f]{32}$/i.test(media[0].sid) || !/^audio\/(ogg|opus)(;|$)/i.test(media[0].content_type || '')) throw Error('I can transcribe WhatsApp voice notes in Ogg Opus format. Please type other attachments.');
      const daily = this.store.state.voiceSpend?.day === dayKey() ? this.store.state.voiceSpend : {day: dayKey(), usd: 0};
      if (daily.usd + RESERVE > config.dailyLimit + 1e-8 || this.store.budgetLeft() < RESERVE) throw Error('Today’s voice-note or JARVIS budget is used up. Please type this message.');
      // Construct the URL ourselves. Never send Twilio credentials to a URL contained in a message.
      let url = `https://api.twilio.com/2010-04-01/Accounts/${p.sid()}/Messages/${message.sid}/Media/${media[0].sid}`;
      let response;
      for (let i = 0; i < 4; i++) {
        response = await this.f(url, {redirect: 'manual', signal: AbortSignal.timeout(30000), headers: i === 0 ? {Authorization: 'Basic ' + Buffer.from(`${p.sid()}:${p.secret('twilioToken')}`).toString('base64')} : {}});
        if (response.status < 300 || response.status >= 400) break;
        const next = new URL(response.headers.get('location') || '', url);
        if (next.protocol !== 'https:' || next.username || next.password || next.port || !/(^|\.)(twiliocdn\.com|amazonaws\.com|twilio\.com)$/.test(next.hostname)) throw Error('Twilio returned an unexpected audio location.');
        await response.body?.cancel(); url = next.href;
      }
      const bytes = await boundedAudio(response); opusSeconds(bytes);
      // Reserve the whole five-minute allowance before sending. Keep it on ambiguous failures; never retry a paid request automatically.
      this.store.setState({voiceSpend: {day: daily.day, usd: +(daily.usd + RESERVE).toFixed(4)}});
      this.store.addSpend(RESERVE, 'voice-note allowance');
      const body = new FormData(); body.append('model', 'whisper-1'); body.append('response_format', 'verbose_json'); body.append('file', new Blob([bytes], {type: 'audio/ogg'}), 'voice-note.ogg');
      const res = await this.f('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${this.store.secret('openaiKey')}`}, body, signal: AbortSignal.timeout(60000)});
      if (!res.ok) throw Error(`OpenAI could not transcribe this note (${res.status}). Check your key and credit; the reserved allowance is kept to avoid overspending.`);
      const out = await res.json(); const text = String(out.text || '').trim().slice(0, 8000);
      if (!text) throw Error('I could not hear clear words. Please type the message.');
      return text;
    } finally { this.busy = false; }
  }
}
