/**
 * The weekly review, every Sunday evening (and "Jarvis, weekly review" any time): the last seven days told in scenes on
 * the same full-screen film as the morning briefing (dist/assets/briefing-cinema.js). What you got done, the meetings
 * you had, what the Tower agents finished, how far your projects moved, what the AI cost, and what next week holds.
 * weekFacts() gathers plain facts from the app's stores; buildWeekScenes() turns them into scenes.
 */
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const DAY = 864e5;
export const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayName = ms => new Date(ms).toLocaleDateString('en-GB', {day: 'numeric', month: 'long'});
export function minutesText(min) {
  min = Math.round(min); if (min < 60) return plural(min, 'minute');
  const h = Math.floor(min / 60), m = min % 60; return m ? `${plural(h, 'hour')} ${plural(m, 'minute')}` : plural(h, 'hour');
}
export const money = usd => usd < 0.01 ? 'under a penny' : `$${usd.toFixed(2)}`;

/** Plain facts about the last seven days and the next seven, from the stores main.js already has. */
export function weekFacts({now = Date.now(), todos = [], meetings = [], runs = [], ideas = [], spendHistory = {}, events = [], dates = [], emails = null}) {
  const since = now - 7 * DAY, ahead = now + 7 * DAY;
  const done = todos.filter(t => t?.done && (t.doneAt || 0) >= since).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const met = meetings.filter(h => (h?.startedAt || 0) >= since);
  const finished = runs.filter(r => r?.status === 'done' && !r.rehearsal && (r.endedAt || 0) >= since);
  const projects = ideas.filter(i => i?.project?.phases?.length).map(i => {
    const steps = i.project.phases.flatMap(p => p.steps || []), doneNow = steps.filter(s => s.done).length, week = steps.filter(s => s.done && (s.doneAt || 0) >= since).length;
    const progress = Math.round(100 * doneNow / Math.max(1, steps.length)), before = Math.round(100 * (doneNow - week) / Math.max(1, steps.length));
    return {title: i.title, progress, before, week, next: steps.find(s => !s.done)?.title || ''};
  });
  let ai = 0; const kinds = {};
  for (let t = since; t <= now + DAY / 2; t += DAY) { const d = spendHistory[dayKey(t)]; if (!d) continue; ai += d.usd || 0; for (const [k, v] of Object.entries(d.byKind || {})) kinds[k] = (kinds[k] || 0) + v; }
  const towerCost = finished.reduce((n, r) => n + (Number(r.cost) || 0), 0);
  return {
    from: since, to: now,
    done: {count: done.length, top: done.slice(0, 3).map(t => clip(t.text, 70))},
    meetings: {count: met.length, minutes: met.reduce((n, h) => n + Math.max(0, ((h.endedAt || h.startedAt) - h.startedAt) / 60000), 0), names: [...new Set(met.map(h => h.suitName).filter(Boolean))].slice(0, 3)},
    agents: {count: finished.length, top: finished.slice(-3).reverse().map(r => clip(r.title, 70))},
    projects: projects.filter(p => p.week > 0).sort((a, b) => b.week - a.week).slice(0, 3), next: projects.filter(p => p.progress < 100).sort((a, b) => b.progress - a.progress)[0] || null,
    ideasAdded: ideas.filter(i => (i?.created || 0) >= since).length,
    spend: {usd: Math.round((ai + towerCost) * 100) / 100, top: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k)},
    emails,
    coming: {events: events.filter(e => { const t = Date.parse(e?.start); return t >= now && t <= ahead; }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 4).map(e => ({title: clip(e.title, 60), at: Date.parse(e.start)})),
      dates: dates.filter(d => d?.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= 7).slice(0, 3).map(d => ({name: clip(d.name, 50), kind: d.kind, daysLeft: d.daysLeft}))},
  };
}

/** Scenes like the morning briefing's: {id, title, line, data}. Parts with nothing to say are left out. */
export function buildWeekScenes(f, {who = 'sir', part = 'evening'} = {}) {
  const out = [], add = (id, title, line, data = {}) => out.push({id, title, line: clip(line, 420), data});
  add('week-open', 'YOUR WEEK', `Good ${part}, ${who}. Here's your week, ${dayName(f.from)} to ${dayName(f.to)}.`, {from: f.from, to: f.to});
  add('week-done', 'DONE', f.done.count ? `You ticked off ${plural(f.done.count, 'task')}${f.done.top.length ? `, including ${list(f.done.top.slice(0, 2))}` : ''}.` : 'No tasks were ticked off this week.', f.done);
  if (f.meetings.count) add('week-meetings', 'MEETINGS', `You had ${plural(f.meetings.count, 'meeting')}, ${minutesText(f.meetings.minutes)} in all.`, f.meetings);
  if (f.agents.count) add('week-agents', 'THE TOWER', `The Tower finished ${plural(f.agents.count, 'job')}${f.agents.top[0] ? `, including ${f.agents.top[0]}` : ''}.`, f.agents);
  if (f.projects.length) add('week-projects', 'PROJECTS', f.projects.map(p => `${p.title} moved from ${p.before} to ${p.progress} percent`).slice(0, 2).join(', and ') + '.', {projects: f.projects});
  if (f.spend.usd > 0) add('week-spend', 'AI COST', `The AI cost ${money(f.spend.usd)} this week${f.spend.top.length ? `, mostly ${list(f.spend.top)}` : ''}.`, f.spend);
  const parts = [];
  if (f.coming.events.length) parts.push(`${plural(f.coming.events.length, 'thing')} on the calendar${f.coming.events.length < 4 ? '' : ' or more'}, starting with ${f.coming.events[0].title}`);
  for (const d of f.coming.dates.slice(0, 2)) parts.push(d.kind === 'birthday' && !/birthday/i.test(d.name) ? `${d.name}'s birthday` : d.kind === 'bill' ? `${d.name} due` : d.name);
  if (f.next?.next) parts.push(`next on ${f.next.title}: ${f.next.next}`);
  add('next-week', 'NEXT WEEK', parts.length ? `Next week: ${list(parts)}.` : 'Next week is clear so far.', {coming: f.coming, next: f.next});
  add('close', 'READY', `That's your week, ${who}. Rest well tonight.`, {});
  return out;
}
/** Is it time for this week's review? Sunday from 17:00, once a week (keyed by the date of that Sunday). */
export function reviewDue(now = new Date(), lastSunday = '') { return now.getDay() === 0 && now.getHours() >= 17 && lastSunday !== dayKey(+now); }
