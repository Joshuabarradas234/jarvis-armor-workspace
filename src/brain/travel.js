import {clip, parseWhen, dayKey, hhmm} from './util.js';

export function zonedParts(at, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, day: new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()};
}
const isoDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function wallTime(date, time, zone) {
  if (!isoDay(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Use a full date and a 24-hour time.');
  const wall = Date.parse(`${date}T${time}:00Z`); let at = wall;
  for (let i = 0; i < 4; i++) { const p = zonedParts(at, zone); const correction = wall - Date.parse(`${p.date}T${p.time}:00Z`); if (!correction) return at; at += correction; }
  throw Error('That local time does not exist because the clocks change. Choose another time.');
}
export function cleanTrip(p) {
  const city = clip(String(p.city || '').trim(), 100), zone = String(p.zone || ''); zonedParts(Date.now(), zone);
  if (!city || !isoDay(p.start) || !isoDay(p.end) || p.end < p.start || Date.parse(p.end) - Date.parse(p.start) > 366 * 864e5) throw Error('Confirm the destination and full arrival/return dates, including month and year (up to one year).');
  const latitude = Number(p.latitude), longitude = Number(p.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw Error('Choose the destination from the location search.');
  const flights = String(p.flights || '').toUpperCase().split(/[,\s]+/).filter(Boolean);
  if (flights.length > 8 || flights.some(f => !/^[A-Z0-9]{2,3}\d{1,4}$/.test(f))) throw Error('Use flight numbers such as BA57, separated by commas.');
  return {city, zone, start: p.start, end: p.end, latitude, longitude, flights, homeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, confirmedAt: Date.now()};
}
export class Travel {
  constructor(core) { this.core = core; this.lastCheck = 0; }
  get() { return this.core.store.state.trip || null; }
  active(at = Date.now()) { const t = this.get(); if (!t) return null; const d = zonedParts(at, t.zone).date; return d >= t.start && d <= t.end ? t : null; }
  zone(at = Date.now()) { return this.active(at)?.zone || Intl.DateTimeFormat().resolvedOptions().timeZone; }
  hour(at, zone = this.zone(at)) { return Number(zonedParts(at, zone).time.slice(0, 2)); }
  describe(at, zone = this.zone(at)) { return (this.get() ? zone + ' · ' : '') + new Date(at).toLocaleString('en-GB', {timeZone:zone, weekday:'long', hour:'2-digit', minute:'2-digit'}); }
  isWake(job) { return job.actions?.deliver === 'call' && job.actions?.content === 'wake'; }
  parseWhen(text, now = Date.now()) {
    // "in 10 minutes" is the same anywhere; clock times ("7 in the morning") follow the trip's time zone
    const plain = parseWhen(text, new Date(now));
    if (!plain || /^in /.test(plain.words)) return plain;
    const p = zonedParts(now, this.zone(now)), fake = new Date(`${p.date}T${p.time}:00`), result = parseWhen(text, fake);
    if (!result) return null;
    const d = new Date(result.at), date = dayKey(d), t = this.get(), zone = t && date >= t.start && date <= t.end ? t.zone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {...result, at: wallTime(date, hhmm(d), zone), zone};
  }
  proposal(p) {
    const t = cleanTrip(p), zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const alarms = this.core.store.alarms.filter(a => a.status === 'armed' && a.kind === 'call' && a.report && !['retry', 'snooze'].includes(a.note)).map(a => {
      const local = zonedParts(a.travelOriginalAt || a.at, a.travelOriginalZone || a.zone || zone);
      return {id: a.id, before: a.at, at: wallTime(local.date, local.time, local.date >= t.start && local.date <= t.end ? t.zone : zone), originalZone: a.travelOriginalZone || a.zone || zone};
    }).filter(a => a.at !== a.before);
    return {...t, flights: t.flights.join(','), alarms};
  }
  review(p) { return this.core.api('travel-plan', this.proposal(p)); }
  clockFor(job, at = Date.now()) { return zonedParts(at, this.isWake(job) ? this.zone(at) : Intl.DateTimeFormat().resolvedOptions().timeZone); }
  next(job, from = Date.now()) {
    const base = this.clockFor(job, from).date;
    for (let i = -1; i < 10; i++) {
      const day = new Date(Date.parse(base) + i * 864e5).toISOString().slice(0, 10), t = this.get();
      const zone = this.isWake(job) && t && day >= t.start && day <= t.end ? t.zone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!job.days.includes(new Date(day).getUTCDay())) continue;
      let at; try { at = wallTime(day, job.time, zone); } catch { continue; }
      if (at > +from) return at;
    }
    return 0;
  }
  detail(p) { const t = cleanTrip(p); const wake = this.core.orders.parse().jobs.filter(j => this.isWake(j)); return `${t.city}: ${t.start} to ${t.end}, inclusive.\nWake-up calls use ${t.zone} during these dates, then return to this computer’s local time.\n${wake.map(j => `${j.time} — ${j.text}`).join('\n') || 'No recurring wake-up calls are configured yet.'}\nOne-off wake-up calls to move: ${(p.alarms || []).map(a => `${a.id}: ${new Date(a.before).toISOString()} → ${new Date(a.at).toISOString()}`).join('; ') || 'none'}. Other reminders and appointments keep their absolute times.\nFlight email watch: ${t.flights.join(', ') || 'add flight numbers to enable'}. Weather comes from Open-Meteo.`; }
  apply(p) {
    const trip = cleanTrip(p); if (trip.end < zonedParts(Date.now(), trip.zone).date) throw Error('Those travel dates have already passed.');
    const expected = this.proposal(p).alarms;
    if (JSON.stringify(p.alarms || []) !== JSON.stringify(expected)) throw Error('Your wake-up calls changed after this travel plan was prepared. Review a fresh plan.');
    for (const move of expected) { const a = this.core.store.alarms.find(a => a.id === move.id); a.at = move.at; a.travelOriginalAt ||= move.before; a.travelOriginalZone = move.originalZone; }
    if (expected.length) this.core.store.flushAlarms();
    this.core.store.setState({trip, tripWeather: null, flightAlerts: []}); this.core.push(); return this.detail(p);
  }
  stop() {
    for (const a of this.core.store.alarms) if(a.status==='armed'&&a.travelOriginalAt){a.at=a.travelOriginalAt;delete a.travelOriginalAt;delete a.travelOriginalZone;if(a.at<Date.now())a.status='cancelled';}
    this.core.store.flushAlarms();this.core.store.setState({trip:null,tripWeather:null});this.core.push();return 'Travel mode ended. Adjusted wake-up calls returned to their original times; any that would now be in the past were cancelled.';
  }
  async locations(name) {
    const res = await (this.core.deps.fetch || fetch)(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name: String(name).trim().slice(0, 100), count: '6', language: 'en', format: 'json'})}`, {redirect: 'error', signal: AbortSignal.timeout(12000)});
    if (!res.ok) throw Error('The location search is unavailable. Try again shortly.');
    return (await res.json()).results?.filter(r => r.timezone).map(r => ({city: `${r.name}, ${r.country || ''}`, zone: r.timezone, latitude: r.latitude, longitude: r.longitude})) || [];
  }
  async weather() {
    const t = this.get(); if (!t) throw Error('Confirm a trip first.');
    const res = await (this.core.deps.fetch || fetch)(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({latitude: t.latitude, longitude: t.longitude, timezone: t.zone, current: 'temperature_2m,weather_code,wind_speed_10m', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: '7'})}`, {redirect: 'error', signal: AbortSignal.timeout(12000)});
    if (!res.ok) throw Error('Destination weather is unavailable.');
    const d = await res.json(), out = {city: t.city, at: Date.now(), current: d.current, daily: d.daily, source: 'Open-Meteo', zone: t.zone};
    this.core.store.setState({tripWeather: out}); return out;
  }
  async onMail(rows) {
    const t = this.get(); if (!t?.flights?.length || Date.now() > wallTime(t.end, '23:59', t.zone)) return;
    const seen = new Set(this.core.store.state.flightSeen || []);
    for (const m of rows) {
      const key = m.messageId || `${this.core.mail.st().uidValidity}:${m.uid}`;
      if (seen.has(key) || !/gate|terminal|delay|cancel|boarding/i.test(`${m.subject} ${m.summary}`)) continue;
      // Match actual selected flight numbers, not every email mentioning travel. The email remains untrusted source material.
      const mail = await this.core.mail.read(m.uid), text = `${mail.subject} ${mail.text}`;
      if (!t.flights.some(f => new RegExp(`\\b${f.replace(/(\D)(\d)/, '$1[ -]?$2')}\\b`, 'i').test(text))) continue;
      seen.add(key); const alert = {id: key, at: Date.now(), subject: m.subject, from: m.from, summary: m.summary, uid: m.uid};
      this.core.store.setState({flightSeen: [...seen].slice(-150), flightAlerts: [...(this.core.store.state.flightAlerts || []), alert].slice(-20)});
      await this.core.message(`Flight email for ${t.city}: ${m.subject}\n${m.summary}\nCheck the airline or airport display before acting; this is an email alert, not live airport data.`, {kind: 'travel'});
      this.core.deps.notify('JARVIS: flight update', String(m.subject).slice(0, 180));
    }
  }
  async tick(now = Date.now()) {
    const t = this.get(); if (!t || !this.active(now) && (Date.parse(t.start) - now > 7 * 864e5 || Date.parse(t.end) + 2 * 864e5 < now)) return;
    if (now - this.lastCheck < 15 * 60000) return; this.lastCheck = now;
    if (now - (this.core.store.state.tripWeather?.at || 0) > 3 * 3600e3) await this.weather();
    if (this.core.mail.ready()) await this.core.checkMail('travel');
  }
}
