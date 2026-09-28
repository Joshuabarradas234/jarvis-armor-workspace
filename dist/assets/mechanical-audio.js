/* Soft latch, glass slide, a falling-pressure air release and an icy chime. */
export function mechanicalCues(theme,closing=false){
  const pitch={ironman:1,batcave:.82,spiderman:1.12}[theme]||1;
  return closing?[{kind:'servo',at:0,duration:.58,pitch,level:.26},{kind:'latch',at:.57,duration:.12,pitch,level:.20}]:[
    {kind:'latch',at:.1,duration:.11,pitch,level:.20},{kind:'servo',at:.16,duration:.87,pitch,level:.26},{kind:'pressure',at:.18,duration:1.65,pitch,level:.42},{kind:'charge',at:.72,duration:.65,pitch,level:.065}];
}
export function mechanicalGain(settings={}){return Math.max(0,Math.min(1,Number(settings.master)||0))*Math.max(0,Math.min(1,Number(settings.mechanical)||0));}
if(typeof window!=='undefined'&&window.jarvis&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
  const J=window.jarvis;let settings={},context=null,gain=null,nodes=new Set(),last='',selected=null,generation=0,disposed=false;
  function stop(){generation++;for(const n of nodes)try{const t=context.currentTime;n.envelope?.gain.cancelAndHoldAtTime?.(t);n.envelope?.gain.linearRampToValueAtTime(0,t+.035);n.stop(t+.04);}catch{}nodes.clear();}
  function volume(){if(gain)gain.gain.setTargetAtTime(mechanicalGain(settings),context.currentTime,.02);if(!mechanicalGain(settings))stop();}
  async function unlock(){
    if(disposed||!mechanicalGain(settings))return false;
    try{if(!context){context=new AudioContext();gain=context.createGain();gain.connect(context.destination);volume();}if(context.state!=='running')await context.resume();return context.state==='running';}catch{return false;}
  }
  const ready=J.call('bootstrap').then(b=>{settings=b.settings;volume();}).catch(()=>{});
  async function play(theme,closing=false){
    stop();const ticket=generation;
    await ready;
    // Native/voice entry has no pointer event. Electron allows audio here; await its first resume.
    if(ticket!==generation||document.hidden||!await unlock()||ticket!==generation||disposed||document.hidden||!mechanicalGain(settings))return;
    const start=context.currentTime;
    for(const cue of mechanicalCues(theme,closing)){const envelope=context.createGain(),filter=context.createBiquadFilter();envelope.connect(gain);filter.connect(envelope);let source;
      const at=start+cue.at;
      if(cue.kind==='servo'||cue.kind==='pressure'){
        source=context.createBufferSource();const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*cue.duration),context.sampleRate),data=buffer.getChannelData(0);let seed=8171,soft=0;
        for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;const white=seed/4294967296*2-1;soft=.82*soft+.18*white;data[i]=cue.kind==='pressure'?(white*.35+soft*1.35):white;}
        source.buffer=buffer;const pressure=cue.kind==='pressure';filter.type=pressure?'bandpass':'lowpass';filter.frequency.setValueAtTime((pressure?2200:1800)*cue.pitch,at);filter.frequency.exponentialRampToValueAtTime((pressure?650:450)*cue.pitch,at+cue.duration);filter.Q.value=pressure?.48:.4;
      }else{
        source=context.createOscillator();source.type='sine';const frequency=(cue.kind==='charge'?1480:270)*cue.pitch;source.frequency.setValueAtTime(frequency,at);source.frequency.exponentialRampToValueAtTime(frequency*(cue.kind==='charge'?.985:.65),at+cue.duration);filter.type='lowpass';filter.frequency.value=2600;filter.Q.value=.4;
      }
      source.connect(filter);envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(cue.level,at+(cue.kind==='pressure'?.065:cue.kind==='servo'?.14:.025));
      if(cue.kind==='pressure'){envelope.gain.linearRampToValueAtTime(cue.level*.72,at+.28);envelope.gain.exponentialRampToValueAtTime(cue.level*.22,at+.9);}else if(cue.kind==='servo')envelope.gain.linearRampToValueAtTime(cue.level*.7,at+cue.duration*.68);
      envelope.gain.exponentialRampToValueAtTime(.0001,at+cue.duration);nodes.add(source);source.envelope=envelope;
      source.onended=()=>{nodes.delete(source);source.disconnect();filter.disconnect();envelope.disconnect();};source.start(at);source.stop(at+cue.duration+.03);
    }
  }
  const unsubs=[J.on('settings',s=>{settings=s;volume();}),J.on('snapshot',s=>{if(s.state==='SUIT_SELECTED'&&(last!==s.state||selected!==s.selected))play(document.body.dataset.theme);else if(last==='MODULE'&&s.state==='RETURNING'||last==='SUIT_SELECTED'&&['RETURNING','ARMOR_HALL'].includes(s.state))play(document.body.dataset.theme,true);if(['IDLE','SHUTDOWN'].includes(s.state))stop();last=s.state;selected=s.selected;})];
  const preview=e=>play(e.detail?.theme||document.body.dataset.theme),hidden=()=>{if(document.hidden)stop();};
  addEventListener('pointerdown',unlock,{capture:true});addEventListener('keydown',unlock,{capture:true});addEventListener('jarvis-mechanical-preview',preview);document.addEventListener('visibilitychange',hidden);
  addEventListener('pagehide',()=>{disposed=true;stop();for(const off of unsubs)off?.();context?.close();removeEventListener('pointerdown',unlock,true);removeEventListener('keydown',unlock,true);removeEventListener('jarvis-mechanical-preview',preview);document.removeEventListener('visibilitychange',hidden);});
}
