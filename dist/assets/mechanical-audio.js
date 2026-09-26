/* Procedural servo, latch and charge cues; no downloaded media or extra audio dependency. */
export function mechanicalCues(theme,closing=false){
  const pitch={ironman:1,batcave:.67,spiderman:1.3}[theme]||1;
  return closing?[{kind:'servo',at:0,duration:.58,pitch,level:.09},{kind:'latch',at:.57,duration:.12,pitch,level:.13}]:[
    {kind:'latch',at:.1,duration:.11,pitch,level:.10},{kind:'servo',at:.16,duration:.87,pitch,level:.09},{kind:'charge',at:.72,duration:.65,pitch,level:.055}];
}
export function mechanicalGain(settings={}){return Math.max(0,Math.min(1,Number(settings.master)||0))*Math.max(0,Math.min(1,Number(settings.mechanical)||0));}
if(typeof window!=='undefined'&&window.jarvis&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
  const J=window.jarvis;let settings={},context=null,gain=null,nodes=new Set(),last='',selected=null,armed=false;
  function stop(){for(const n of nodes)try{n.stop();}catch{}nodes.clear();}
  function volume(){if(gain)gain.gain.setTargetAtTime(mechanicalGain(settings),context.currentTime,.02);if(!mechanicalGain(settings))stop();}
  async function unlock(){armed=true;if(!mechanicalGain(settings))return;if(!context){context=new AudioContext();gain=context.createGain();gain.connect(context.destination);volume();}if(context.state==='suspended')await context.resume().catch(()=>{});}
  function play(theme,closing=false){if(!armed||!context||context.state!=='running'||!mechanicalGain(settings)||document.hidden)return;stop();const start=context.currentTime;
    for(const cue of mechanicalCues(theme,closing)){const envelope=context.createGain(),filter=context.createBiquadFilter();envelope.connect(gain);filter.connect(envelope);let source;
      if(cue.kind==='charge'){source=context.createOscillator();source.type='sine';source.frequency.setValueAtTime(180*cue.pitch,start+cue.at);source.frequency.exponentialRampToValueAtTime(520*cue.pitch,start+cue.at+cue.duration);filter.type='lowpass';filter.frequency.value=1800;}
      else{source=context.createBufferSource();const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*cue.duration),context.sampleRate),data=buffer.getChannelData(0);let seed=8171;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*(cue.kind==='servo'?.6+.4*Math.sin(i/context.sampleRate*75):1);}source.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime((cue.kind==='latch'?1350:420)*cue.pitch,start+cue.at);filter.frequency.linearRampToValueAtTime(180*cue.pitch,start+cue.at+cue.duration);filter.Q.value=cue.kind==='latch'?.65:1.8;}
      source.connect(filter);const at=start+cue.at;envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(cue.level,at+.015);envelope.gain.exponentialRampToValueAtTime(.0001,at+cue.duration);nodes.add(source);source.onended=()=>{nodes.delete(source);source.disconnect();filter.disconnect();envelope.disconnect();};source.start(at);source.stop(at+cue.duration+.03);
    }
  }
  const unsubs=[J.on('settings',s=>{settings=s;volume();}),J.on('snapshot',s=>{if(s.state==='SUIT_SELECTED'&&(last!==s.state||selected!==s.selected))play(document.body.dataset.theme);else if(last==='MODULE'&&s.state==='RETURNING'||last==='SUIT_SELECTED'&&['RETURNING','ARMOR_HALL'].includes(s.state))play(document.body.dataset.theme,true);if(['IDLE','SHUTDOWN'].includes(s.state))stop();last=s.state;selected=s.selected;})];
  J.call('bootstrap').then(b=>{settings=b.settings;volume();}).catch(()=>{});
  const preview=async e=>{await unlock();play(e.detail?.theme||document.body.dataset.theme);},hidden=()=>{if(document.hidden)stop();};
  addEventListener('pointerdown',unlock,{capture:true});addEventListener('keydown',unlock,{capture:true});addEventListener('jarvis-mechanical-preview',preview);document.addEventListener('visibilitychange',hidden);
  addEventListener('pagehide',()=>{stop();for(const off of unsubs)off?.();context?.close();removeEventListener('pointerdown',unlock,true);removeEventListener('keydown',unlock,true);removeEventListener('jarvis-mechanical-preview',preview);document.removeEventListener('visibilitychange',hidden);});
}
