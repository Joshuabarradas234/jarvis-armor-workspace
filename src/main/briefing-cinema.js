/**
 * The cinematic morning briefing: your day told in short scenes (the date, the weather, what happened overnight,
 * email, today's calendar, bills and birthdays coming up, your work), each shown full screen as JARVIS says its line.
 * buildScenes() turns plain facts into scenes; main.js gathers the facts, speaks the lines with a bookmark before
 * each (speak.ps1) and tells the screen as each one starts (dist/assets/briefing-cinema.js).
 */
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "today", "tomorrow", "on Friday" or "in 9 days". */
export function whenIn(daysLeft, now = Date.now()) {
  if (daysLeft <= 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft < 7) { const d = new Date(now); d.setDate(d.getDate() + daysLeft); return `on ${DAYS[d.getDay()]}`; }
  return `in ${daysLeft} days`;
}
/** One bill or birthday, as a phrase: "council tax is due tomorrow", "it's Mum's birthday on Friday". */
export function datePhrase(d, now = Date.now()) {
  const when = whenIn(d.daysLeft, now), name = clip(d.name, 60);
  if (d.kind === 'birthday') return /birthday/i.test(name) ? `${name} is ${when}` : `it's ${name}${/s$/i.test(name) ? "'" : "'s"} birthday ${when}`;
  if (d.kind === 'bill') return `${name}${d.amount ? `, ${clip(d.amount, 30)},` : ''} is due ${when}`;
  return `${name} is ${when}`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * f: {who, part, date, time, weather, night: {done, waiting}, mail: {count, reply, unhappy} | null, events, dates,
 *     todos: {count, first}, projects: [{title, progress, next}], blocked, now}
 * Returns [{id, title, line, data}]; empty parts of the day are left out, so a quiet day is a short briefing.
 */
export function buildScenes(f) {
  const out = [], add = (id, title, line, data = {}) => out.push({id, title, line: clip(line, 420), data});
  add('open', 'GOOD ' + String(f.part || 'day').toUpperCase(), `Good ${f.part || 'day'}, ${f.who}. It's ${f.date}. Here's your day.`, {date: f.date, time: f.time});
  const w = f.weather;
  if (w && Number.isFinite(w.temp)) add('weather', 'WEATHER', `It's ${w.temp} degrees${w.words ? ` with ${w.words}` : ''}${w.place ? ` in ${w.place}` : ''}.${w.wind >= 35 ? ' It is windy out there.' : ''}`, w);
  const done = f.night?.done || [], waiting = f.night?.waiting || [];
  if (done.length || waiting.length) {
    const parts = [];
    if (done.length === 1) parts.push(`While you were away, ${done[0].floor ? `the ${done[0].floor} floor` : 'the tower'} finished ${clip(done[0].title, 80)}.`);
    else if (done.length) parts.push(`While you were away, ${plural(done.length, 'Tower job')} finished, including ${clip(done[0].title, 70)}.`);
    if (waiting.length) parts.push(`${waiting.length === 1 ? 'One thing is' : `${waiting.length} things are`} waiting for your OK.`);
    add('night', 'OVERNIGHT', parts.join(' '), {done: done.slice(0, 4), waiting: waiting.slice(0, 4)});
  }
  const m = f.mail;
  if (m) {
    const parts = [m.count ? `${plural(m.count, 'email')} came in since last night.` : 'No new email since last night.'];
    if (m.reply?.length) parts.push(`${m.reply.length === 1 ? 'One needs' : `${m.reply.length} need`} a reply${m.reply[0].from ? `, including ${clip(m.reply[0].from, 40)}${m.reply[0].subject ? ` about ${clip(m.reply[0].subject, 60)}` : ''}` : ''}.`);
    if (m.unhappy) parts.push(`${m.unhappy === 1 ? 'One sounds' : `${m.unhappy} sound`} unhappy.`);
    add('mail', 'EMAIL', parts.join(' '), m);
  }
  const ahead = (f.events || []).filter(e => !e.past);
  add('today', 'TODAY', !f.events?.length ? 'Your calendar is clear today.' : !ahead.length ? "Today's calendar is done." :
    `You have ${plural(ahead.length, 'thing')} on today. ${ahead.slice(0, 4).map(e => `At ${e.time}, ${clip(e.title, 60)}.`).join(' ')}${ahead.length > 4 ? ' And more after that.' : ''}`, {events: f.events || []});
  if (f.dates?.length) add('dates', 'COMING UP', `${cap(list(f.dates.slice(0, 3).map(d => datePhrase(d, f.now))))}.`, {dates: f.dates});
  const parts = [], todo = f.todos || {count: 0, first: []}, p = (f.projects || [])[0];
  if (todo.count) parts.push(`${plural(todo.count, 'task')} on your list. First up: ${clip(todo.first[0], 80)}.`);
  if (p) parts.push(`${clip(p.title, 60)} is ${p.progress} percent there${p.next ? `. Next step: ${clip(p.next, 80)}` : ''}.`);
  if (f.blocked?.length) parts.push(`${list(f.blocked.slice(0, 2))} ${f.blocked.length === 1 ? 'needs' : 'need'} you.`);
  if (parts.length) add('work', 'YOUR WORK', parts.join(' '), {todos: todo, projects: f.projects || [], blocked: f.blocked || []});
  add('close', 'READY', `That's your day, ${f.who}. I'll be here when you need me.`, {});
  return out;
}
