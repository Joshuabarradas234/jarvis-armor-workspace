export const cleanSpeech=t=>String(t).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const clean=cleanSpeech;
/* ---------- how suit names are actually said: "Mark I" is "mark one", "Bay 03" is "bay three" ---------- */
const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const numWords=n=>n<20?ONES[n]:n<100?TENS[Math.floor(n/10)]+(n%10?' '+ONES[n%10]:''):n<1000?ONES[Math.floor(n/100)]+' hundred'+(n%100?' and '+numWords(n%100):''):String(n);
// any proper Roman numeral (Mark XXXIX, Mark LXXXV...), read as a number
const ROMAN=new Proxy({},{get:(_t,w)=>{if(typeof w!=='string'||!/^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(w))return undefined;const v={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};let n=0;for(let k=0;k<w.length;k++){const a=v[w[k]],b=v[w[k+1]]||0;n+=a<b?-a:a;}return n>0&&n<=100?n:undefined;}});
/** Every way a suit name might be spoken, e.g. "Mark II" -> ["mark ii","mark two","mark 2"]. */
export function spokenForms(name){
  const base=String(name||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();if(!base)return [];
  const words=base.split(' ');const out=new Set([base]);
  const variants=words.map((w,i)=>{
    const v=new Set([w]);
    if(/^\d+$/.test(w)){const n=Number(w);v.add(String(n));v.add(numWords(n));if(w.length>1&&w.startsWith('0'))v.add('zero '+numWords(n));}
    else if(i>0&&ROMAN[w]){v.add(numWords(ROMAN[w]));v.add(String(ROMAN[w]));}
    if(w==='mk')v.add('mark');
    return [...v];
  });
  const walk=(i,acc)=>{if(out.size>6)return;if(i===variants.length){out.add(acc.join(' '));return;}for(const v of variants[i])walk(i+1,[...acc,v]);};
  walk(0,[]);
  return [...out];
}
/** Sound-alike spellings the Windows engine tends to produce for names it does not know. */
export const NAME_ALIASES={jarvis:['jar vis','jarvus','jarviss','jervis','javis','jarves','jarvas','jarvey','jarvi'],alfred:['alfrid','alfie','al fred','alfredo'],karen:['karin','caren','karren','carin']};
const canonicalName=(n)=>{for(const [k,v] of Object.entries(NAME_ALIASES))if(k===n||v.includes(n))return k;return n;};
/**
 * Parse a spoken command. `context` = {theme, themes, modules}.
 * Any assistant name (Jarvis / Alfred / Karen) is accepted as the wake word, so
 * "Jarvis, going dark" switches to the Batcave and "Alfred, show Spider-Man"
 * switches to the Web Lab. Suit commands only match the active theme's suits.
 */
const WAKE=['lets get to work','lets go to work','get to work','start','wake up','im home','were online','activate','boot up','power up'];
const FILLER=/^(?:hey|hi|hello|ok|okay|yo|oi|right) /;
const GREET=/^(?:(?:good )?(?:morning|afternoon|evening)|hello|hi|hey|hiya|yo|whats up|how are you|you there|are you there)$/;
const THANKS=['thank you','thanks','thank you very much','thanks a lot','cheers','nice one','nice','perfect','great job','good job','well done','appreciate it'];
const BRIEFING=['tell me what we got on the calendar today','tell me what weve got on the calendar today','tell me whats on the calendar today',
  'whats on the calendar today','whats on the calendar','whats on my calendar','whats on my calendar today','what have we got today','what have i got today',
  'what do we have today','what do i have today','whats the plan today','whats the plan for today','whats on today','whats happening today',
  'morning briefing','daily briefing','brief me','give me a briefing','give me the briefing','run me through today','run me through the day','what does my day look like','whats my day look like','whats my day looking like','how does my day look','how is my day looking','hows my day looking','whats my day like','what have i got on today','whats on for today'];
const STATUS=['status','status report','progress report','how are we doing','where are we','give me a status report','give me a status report on the app',
  'report','progress','how is everything going','sitrep','give me an update','whats the status','how are things'];
const EARTH=['show me the earth','show the earth','open the earth','the earth','earth','show me earth','show me the planet','show me the world','show me the globe','open the globe','the globe','world map','open the world map','open the global map','global map','open global map','open the map','open a map','show me the map','back to the globe','back to the earth','show me the whole earth','zoom all the way out'];
/** The words JARVIS listens for as its own name, for the side listener that handles claps and "map of ..." dictation. */
export function spokenNames(context){
  const out=new Set();
  for(const t of context.themes||[]){const n=clean(t.assistant||'');if(!n)continue;for(const v of [n,...(GRAMMAR_ALIASES[n]||[])]){out.add(v);out.add('hey '+v);}}
  return [...out];
}
/**
 * Parse a spoken command. `context` = {theme, themes, modules, idle, follow}.
 * The assistant's name can start or end the sentence ("Jarvis, status report" / "Thank you, Jarvis").
 * Right after JARVIS answers you (`follow`), the name can be left off altogether, like a conversation.
 */
export function parseCommand(text,context){
  const ctx=Array.isArray(context)?{modules:context,themes:[],theme:{assistant:'Jarvis'}}:context;
  // "hello Jarvis" is a greeting: keep the hello when the rest is only the name
  const full=clean(text);const normal=GREET.test(full.split(' ')[0])&&full.split(' ').length===2?full:full.replace(FILLER,'');
  const names=[...new Set([ctx.theme?.assistant].filter(Boolean).map(n=>clean(n)))];   // strict: this hall's name only
  const spoken=[...names,...names.flatMap(n=>NAME_ALIASES[n]||[])].sort((a,b)=>b.length-a.length);
  let heard=spoken.find(n=>normal===n||normal.startsWith(n+' '));
  let rest=heard?normal.slice(heard.length).trim():null;
  if(!heard){const tail=spoken.find(n=>normal.endsWith(' '+n));if(tail){heard=tail;rest=normal.slice(0,-tail.length).trim();}}
  if(ctx.idle){
    // Closed to the tray: any assistant can wake JARVIS, and opens its own hall.
    for(const t of ctx.themes||[]){
      const own=clean(t.assistant||'');if(!own)continue;
      for(const n of [own,...(NAME_ALIASES[own]||[])].sort((a,b)=>b.length-a.length)){
        let r=null;
        if(normal===n)r='';else if(normal.startsWith(n+' '))r=normal.slice(n.length).trim();else if(normal.endsWith(' '+n))r=normal.slice(0,-n.length).trim();
        if(r===null)continue;
        if(WAKE.includes(r)||GREET.test(r))return {action:'wake',theme:t.id};
      }
    }
    return null;
  }
  if(!heard&&ctx.follow){heard='(follow)';rest=normal;}
  if(!heard)return null;
  if(!rest)return {action:'attention'};   // "Hey Jarvis." -> "Yes, sir?" and he listens without the name for a moment
  if(WAKE.includes(rest))return {action:'wake'};
  if(STATUS.includes(rest))return {action:'status'};
  if(BRIEFING.includes(rest))return {action:'briefing'};
  if(GREET.test(rest)){const m=/morning|afternoon|evening/.exec(rest);return {action:'greet',part:m?m[0]:''};}
  if(THANKS.includes(rest))return {action:'thanks'};
  // "open a map of New York", "where is Leeds", "search for arc reactors"
  const MAP=/^(?:open|show me|show|pull up|bring up|get me|give me|can you show me|can i see)?\s*(?:a |the )?(?:street |satellite |live )?map (?:of|for) (.+)$|^where is (.+)$|^(?:open |show me |show |pull up |find )?(.+?) on the map$/;
  const mm=MAP.exec(rest);if(mm){const q=(mm[1]||mm[2]||mm[3]||'').trim();if(q)return /satellite/.test(rest)?{action:'map',query:q,style:'satellite'}:{action:'map',query:q};}
  const SEARCH=/^(?:search for|search|look up|google|find me) (.+)$/;
  const sm=SEARCH.exec(rest);if(sm&&sm[1].trim())return {action:'search',query:sm[1].trim()};
  // the tower
  if(['open the tower','show me the tower','the tower','tower','open the building','take me to the tower','go to the tower','open stark tower','open wayne enterprises','open the daily bugle','open the bugle'].includes(rest))return {action:'tower-open'};
  if(['hows the tower','how is the tower','tower report','tower status','how are the floors','hows the tower doing','how is the tower doing','whats the tower doing','any updates from the tower'].includes(rest))return {action:'tower-report'};
  const TT=/^(?:tell the tower to|ask the tower to|give the tower|send to the tower|tower) (.+)$/.exec(rest);if(TT&&TT[1].trim()&&!/^(report|status)$/.test(TT[1]))return {action:'tower-task',text:TT[1].trim()};
  if(EARTH.includes(rest))return {action:'globe'};
  if(['calibrate hands','calibrate my hands','calibrate the hands','hand calibration','calibrate my reach','calibrate'].includes(rest))return {action:'hands-calibrate'};
  if(['satellite view','satellite','satellite mode','switch to satellite','show me the satellite view','go to satellite view','satellite map'].includes(rest))return {action:'globe-view',view:'satellite'};
  if(['hologram view','holo view','hologram','map view','normal view','default view','back to hologram','hologram mode','street map'].includes(rest))return {action:'globe-view',view:'holo'};
  if(['night view','night mode','earth at night','show me the earth at night','night lights'].includes(rest))return {action:'globe-view',view:'night'};
  if(['zoom in','zoom in more','closer','get closer','zoom in a bit','enhance'].includes(rest))return {action:'globe-zoom',dir:1};
  if(['zoom out','zoom out more','further out','back out','zoom out a bit'].includes(rest))return {action:'globe-zoom',dir:-1};
  if(['spin the globe','spin the earth','spin it','rotate the globe','start spinning'].includes(rest))return {action:'globe-spin',on:true};
  if(['stop spinning','stop the globe','hold still','stop rotating'].includes(rest))return {action:'globe-spin',on:false};
  // quick capture: "note that I need to call the bank" -> to-do; "new idea: hologram keyboard" -> idea card
  const IDEA=/^(?:new idea|idea|i have an idea|ive got an idea|save an idea|save idea|add an idea)(?: that| for| about)? (.+)$/;
  const im=IDEA.exec(rest);if(im&&im[1].trim())return {action:'note',kind:'idea',text:im[1].trim()};
  const NOTE=/^(?:note that|make a note that|make a note to|make a note|take a note|note|remember that|remember to|remind me to|add to my list|add to my to do list|add to the list|put on my list|to do) (.+)$/;
  const nm=NOTE.exec(rest);if(nm&&nm[1].trim())return {action:'note',kind:'todo',text:nm[1].trim()};
  // focus mode
  if(['stop focus','end focus','stop focus mode','end focus mode','focus off','cancel focus','im done focusing','stop focusing'].includes(rest))return {action:'focus-stop'};
  const FOCUS=/^(?:focus mode|start focus|start focus mode|start a focus session|focus|focus time|lets focus|time to focus)(?: for (.+?) minutes?| for an hour| for half an hour)?$/;
  const fm=FOCUS.exec(rest);if(fm){const w={five:5,ten:10,fifteen:15,twenty:20,'twenty five':25,thirty:30,forty:40,'forty five':45,fifty:50,sixty:60,ninety:90};
    let mins=/for an hour$/.test(rest)?60:/for half an hour$/.test(rest)?30:fm[1]?(Number(fm[1])||w[fm[1].trim()]||25):25;return {action:'focus',minutes:mins};}
  if(['close all the tabs','close all tabs','close all the pages','close all pages','close everything','clear the screen','close all the windows','close all windows'].includes(rest))return {action:'panel-close-all'};
  if(['close the map','close map','close that','close it','close the window','close the panel','hide the map','get rid of that','close the search','close this','close the page','close this page','close the tab'].includes(rest))return {action:'panel-close'};
  // "run mark 1", "start bay 3", "get to work on cowl 02"
  const RUN=/^(?:run|start|launch|execute|begin|get to work on|kick off)\s+(.+)$/;
  const rm=RUN.exec(rest);
  if(rm){
    const want=clean(rm[1]);
    for(const m of context.modules||[]){
      const n=clean(m.name);
      if(n===want||n.replace(/\b0+(\d)/g,'$1')===want.replace(/\b0+(\d)/g,'$1')||spokenForms(m.name).includes(want))return {action:'run',id:m.id};
    }
  }
  if(['return to the armor hall','return to the armour hall','go home','back to the hall','home','go back to the hall','return to the hall','take me back','take me home','get me out of here','exit','exit the suit','leave the suit','out of here'].includes(rest))return {action:'home'};
  if(['stand down','close system','go to sleep','power down'].includes(rest))return {action:'standdown'};
  if(['back','go back','close this suit','close suit'].includes(rest))return {action:'back'};
  // "go back to the batcave", "take me back to the web lab" -> strip the lead-in, then match the hall
  const LEAD=['go back to the ','go back to ','back to the ','back to ','take me back to the ','take me back to ',
              'return to the ','return to ','go to the ','go to ','take me to the ','take me to '];
  let hallPart=rest;
  for(const p of LEAD)if(rest.startsWith(p)){hallPart=rest.slice(p.length);break;}
  for(const theme of ctx.themes||[]){
    if(!theme.switchPhrases?.some(p=>clean(p)===rest||clean(p)===hallPart))continue;
    // asking for the hall you are already in means "take me out to the hall"
    return theme.id===ctx.theme?.id ? {action:'home'} : {action:'theme',id:theme.id};
  }
  for(const m of context.modules||[])for(const n of spokenForms(m.name)){if([`open ${n}`,`open this suit ${n}`,`activate ${n}`,`show ${n}`,`suit ${n}`,`open the ${n}`,`open up ${n}`].includes(rest))return {action:'select',id:m.id};}
  if(rest==='open this suit')return {action:'select-hover'};
  // "show me Mark 39", "let me see the hulk buster": fly up to that case, without opening it
  for(const m of context.modules||[])for(const n of spokenForms(m.name)){if([`show me ${n}`,`show me the ${n}`,`let me see ${n}`,`let me see the ${n}`,`look at ${n}`,`look at the ${n}`,`zoom in on ${n}`,`zoom in on the ${n}`,`take me to ${n}`,`take me to the ${n}`].includes(rest))return {action:'suit-show',id:m.id};}
  // "take me to Tokyo", "fly to London", "zoom in on Manhattan": anywhere else is a place on the map
  const FLY=/^(?:take me to|fly me to|fly to|fly over|zoom in on|zoom into|zoom to|show me where|go to|show me) (.+)$/.exec(rest);
  if(FLY&&FLY[1].trim()&&!/^(?:the )?(?:tower|suit|hall|folder|files|tab|page|status|briefing|calendar)\b/.test(FLY[1]))return {action:'map',query:FLY[1].trim()};
  // --- workstation controls, usable while a suit is open ---
  if(['next tab','next page','switch tab'].includes(rest))return {action:'tab-next'};
  if(['previous tab','last tab','go back a tab'].includes(rest))return {action:'tab-prev'};
  if(['close tab','close this tab','close this page'].includes(rest))return {action:'tab-close'};
  if(['reload','refresh','refresh the page','reload the page'].includes(rest))return {action:'tab-reload'};
  if(['open my folder','open the folder','show my files','open my files'].includes(rest))return {action:'open-folder'};
  if(['launch everything','open everything','set up my workspace','launch all'].includes(rest))return {action:'launch-all'};
  if(['arrange my screens','arrange my windows','set up my displays','arrange my displays','sort out my windows','position my windows','fix my windows'].includes(rest))return {action:'layout-apply'};
  if(['forget this session','start fresh','clear my session','start clean'].includes(rest))return {action:'session-clear'};
  return null;
}
/**
 * Sound-alikes worth telling the engine about. Deliberately shorter than
 * NAME_ALIASES: every extra name multiplies the whole phrase list, and a
 * bloated list makes the recogniser worse, not better.
 */
export const GRAMMAR_ALIASES={jarvis:['jarvus','jervis','javis'],alfred:['alfie','alfrid'],karen:['karin','caren']};
const CORE=['status','status report','progress report','where are we','report','sitrep',
  'lets get to work','get to work','wake up','activate','power up','boot up',
  'return to the armor hall','go home','home','go back to the hall','return to the hall','take me back','exit','exit the suit','leave the suit','stand down','close system','go back','back','open this suit',
  'next tab','previous tab','close tab','reload','refresh the page',
  'open my folder','show my files','launch everything','set up my workspace',
  'forget this session','start fresh',
  'arrange my screens','arrange my windows','set up my displays','position my windows'];
/** Phrases another hall's assistant still answers to, so you can switch halls by name. */
const CROSS=['wake up','get to work','go home','stand down'];
const LEADINS=['go back to the ','back to the ','take me back to the ','return to the '];
export function buildGrammar(context){
  const active=clean(context.theme.assistant);
  const switches=(context.themes||[]).flatMap(t=>t.switchPhrases||[]);
  const phrases=[];
  // the hall you are standing in: everything, plus its close sound-alikes
  for(const n of [context.theme.assistant,...(GRAMMAR_ALIASES[active]||[])]){
    for(const c of CORE)phrases.push(`${n} ${c}`);
    for(const m of context.modules||[])for(const f of spokenForms(m.name))phrases.push(`${n} open ${f}`,`${n} show ${f}`,`${n} open the ${f}`,`${n} show me ${f}`,`${n} show me the ${f}`,`${n} let me see the ${f}`);
    for(const p of switches){phrases.push(`${n} ${p}`);for(const L of LEADINS)phrases.push(`${n} ${L}${p}`);}
    for(const m of context.modules||[])for(const f of spokenForms(m.name))for(const v of ['run','start','launch'])phrases.push(`${n} ${v} ${f}`);
  }
  // conversation: greetings, thanks, briefings and status, with the name at either end
  const GREETS=['good morning','good afternoon','good evening','morning','hello','hey'];
  const THX=['thank you','thanks','cheers','nice one','well done','thank you very much'];
  const TOWERP=['open the tower','show me the tower','hows the tower','tower report','tower status','open the global map','global map','open the globe','world map','open the map','show me the earth','show me the world','the earth','satellite view','hologram view','night view','zoom in','zoom out','spin the globe','stop spinning','back to the globe','calibrate hands','close all the tabs','close everything','close this page'];
  const FOCUSP=['focus mode','start focus','stop focus','end focus',...[15,20,25,30,45,60,90].map(n=>`focus for ${n} minutes`),'focus for an hour','focus for half an hour'];
  const TALK=[...STATUS,...BRIEFING,...FOCUSP,...TOWERP,'close the map','close that','close the window','hide the map'];
  for(const n of [context.theme.assistant,...(GRAMMAR_ALIASES[active]||[])]){
    phrases.push(n,`hey ${n}`,`ok ${n}`,`hey ${n} wake up`,`hey ${n} lets get to work`);
    for(const g of GREETS)phrases.push(`${g} ${n}`);
    for(const t of THX)phrases.push(`${t} ${n}`,`${n} ${t}`);
    for(const t of TALK)phrases.push(`${n} ${t}`);
    for(const t of STATUS.slice(0,6))phrases.push(`hey ${n} ${t}`);
  }
  // follow-up: right after he answers, the same things without the name (ignored at any other time)
  phrases.push(...TALK,...THX,...GREETS.slice(0,3));
  for(const c of ['go home','take me back','exit','stand down','next tab','previous tab','close tab','reload','launch everything','set up my workspace','open my folder','arrange my screens'])phrases.push(c);
  for(const m of context.modules||[])for(const f of spokenForms(m.name))phrases.push(`open ${f}`,`show ${f}`,`show me ${f}`,`show me the ${f}`);
  // Other halls' assistants: only their wake phrases, which only count while JARVIS is closed
  for(const t of context.themes||[]){
    const own=clean(t.assistant||'');if(!own||own===active)continue;
    for(const n of [t.assistant,...(GRAMMAR_ALIASES[own]||[])]){for(const w of ['lets get to work','get to work','wake up'])phrases.push(`${n} ${w}`);phrases.push(`hey ${n} wake up`,`good morning ${n}`,`good evening ${n}`,`good afternoon ${n}`);}
  }
  // Decoys: everyday speech lands on one of these instead of being force-fitted onto a command.
  const DECOYS=['okay','yes','no','hello','hi','thank you','thanks','what','why','how','when','where','the','and','so','right','sure','fine','good','great','cool','nice','sorry','please','stop','wait','hold on','one second','never mind','I dont know','I think so','let me see','come on','oh no','oh yeah','you know','I mean','like','actually','basically','anyway','whatever','alright','okay then','see you','bye','morning','evening','hey','hey there','what is that','look at this','check this out','that is fine','not now','later','maybe','probably','definitely','exactly','of course','no way','really','seriously','tell me','show me','open it','close it','turn it off','turn it on','play','pause','next','back','up','down','left','right','music','video','game','work','home','food','coffee','tea','water','phone','laptop','screen','window','door','car','bus','train','today','tomorrow','yesterday','tonight','weekend','monday','friday','one','two','three','four','five','ten','twenty','hundred','get to work','lets get to work','wake up','going dark','suit up','stand down','open','show','activate'];
  // A decoy must never be the tail of a real command. "lets get to work", "going dark"
  // and "stand down" were all sitting in this list, so whenever the assistant's name at
  // the start of an utterance was quiet or clipped — which is most of the time — the
  // recogniser matched the bare decoy and the command was thrown away. Anything that is
  // also a command tail is dropped here, and the rest still soak up everyday speech.
  const tails=new Set([
    ...CORE,...STATUS,...BRIEFING,...THANKS,'hello','hi','hey','morning','good morning','good afternoon','good evening','close the map','close that',
    ...switches,
    ...switches.flatMap(p=>LEADINS.map(L=>L+p)),
    ...(context.modules||[]).flatMap(m=>spokenForms(m.name).flatMap(f=>['open','show','show me','show me the','run','start','launch'].map(v=>`${v} ${f}`))),
  ].map(clean));
  const decoys=DECOYS.filter(d=>!tails.has(clean(d)));
  return [...new Set([...phrases,...decoys])];
}
