/**
 * A meeting's write-up, wherever JARVIS's brain runs: the accurate transcript (AssemblyAI, when its key is there),
 * the notes from Claude, and the document that goes in the meeting's folder. The app uses it for meetings it keeps
 * itself (src/main/main.js); JARVIS Server uses it for the meetings the ZenBook records and sends over.
 */
import fs from 'node:fs';
import {cloudTranscript, transcriptText} from './cloud-transcript.js';
import {MEETING_PROMPT, meetingNotes} from './followups.js';
import {meetingWorkPrompt} from './work.js';
import {clock} from './manager.js';
import {extractJson} from '../brain/util.js';

/**
 * m: the finished meeting ({suitName, hallName, startedAt, duration, transcript, recording, sources, warnings}); it
 * gains `accurate`, and `transcript` becomes the accurate one when there is one.
 * summarise({system, prompt}) → the reply text, or null when there is no way to ask Claude (noEngine says why).
 * Returns {markdown, notes, workPlan}: notes is null when there is no summary.
 */
export async function writeUp(m, {assemblyKey = '', summarise = async () => null, noEngine = 'No summary: add a Claude API key.', catalog, status = () => {}, log = () => {}, spend = () => {}}) {
  m.accurate = false;
  if (assemblyKey && m.recording && fs.existsSync(m.recording) && fs.statSync(m.recording).size > 2000) {   // who said what, when you have added the key
    try {
      const r = await cloudTranscript({bytes: fs.readFileSync(m.recording), key: assemblyKey, onStatus: status});
      if (r.utterances.length) { m.transcript = transcriptText(r.utterances); m.accurate = true; }
      try { spend(r.cost, 'meeting transcript'); } catch {}
    } catch (e) { m.warnings.push('The accurate transcript did not work, so this is the offline one. ' + e.message); log(e.message); }
  }
  const when = new Date(m.startedAt);
  const date = when.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}), time = when.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
  status('Writing the summary…');
  let summary = '', notes = null, workPlan = [];
  if (!m.transcript.trim()) m.warnings.push('Nothing was transcribed. Check the microphone and that an English Windows speech recognizer is installed.');
  else {
    const system = 'You write concise British English meeting notes ' + (m.accurate ? 'from an accurate transcript in which the speakers are labelled Speaker A, Speaker B and so on: use a person\'s name only where the transcript makes clear who they are. ' : 'from imperfect offline transcription. ') + MEETING_PROMPT + ' ' + meetingWorkPrompt(catalog || {suits: [], floors: []});
    const prompt = `Meeting for the "${m.suitName}" workstation (${m.hallName}), ${date} at ${time}, ${clock(m.duration)} long.\n\nExtract the decisions, action owners and deadlines. ${MEETING_PROMPT}\n\nTRANSCRIPT:\n${m.transcript.slice(0, 150000)}`;
    try {
      summary = await summarise({system, prompt});
      if (summary == null) { summary = ''; m.warnings.push(noEngine); }
      if (summary) { const data = extractJson(summary); notes = meetingNotes(data, m.transcript); workPlan = data.work; summary = notes.markdown; }
    } catch (e) { summary = ''; m.warnings.push('No summary this time: ' + e.message); }
  }
  const sources = m.sources.includes('system') ? 'your microphone and the call audio' : 'your microphone only';
  const markdown = [`# Meeting notes: ${m.suitName}`, '', `**${m.hallName}** · ${date}, ${time} · ${clock(m.duration)} · recorded ${sources}`, '',
    ...m.warnings.map(w => '> ' + w), m.warnings.length ? '' : null, summary || null, summary ? '' : null, '## Full transcript', '', m.accurate ? '_Transcribed by AssemblyAI, with the speakers labelled A, B and so on._' : '_Transcribed offline by Windows speech recognition, so expect some mistakes._', '',
    m.transcript || '(Nothing was transcribed.)', '', `Recording: ${m.recording && fs.existsSync(m.recording) ? m.recording : 'not saved'}`, ''].filter(x => x !== null).join('\n');
  return {markdown, notes, workPlan};
}
