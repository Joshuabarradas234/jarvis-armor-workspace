export const DURATIONS = Object.freeze({ WAKE: 1000, BOOT: 1700, HUD: 1700, HELMET_INTERIOR: 1300, HELMET_OPENING: 3300, SUIT_SELECTED: 3000, RETURNING: 2200, SHUTDOWN: 2000 });
/** Stretch or shrink the five startup stages so the whole intro lasts `seconds` (media-synchronised startup). */
export function introDurations(seconds){const total=Math.max(6,Math.min(90,Number(seconds)||9));const base=['WAKE','BOOT','HUD','HELMET_INTERIOR','HELMET_OPENING'];const sum=base.reduce((n,k)=>n+DURATIONS[k],0);const out={...DURATIONS};for(const k of base)out[k]=Math.round(DURATIONS[k]*total*1000/sum);return out;}
export const STATES = Object.freeze(['IDLE','WAKE','BOOT','HUD','HELMET_INTERIOR','HELMET_OPENING','ARMOR_HALL','SUIT_HOVER','SUIT_SELECTED','MODULE','RETURNING','SHUTDOWN']);
const NEXT = { WAKE:'BOOT', BOOT:'HUD', HUD:'HELMET_INTERIOR', HELMET_INTERIOR:'HELMET_OPENING', HELMET_OPENING:'ARMOR_HALL', SUIT_SELECTED:'MODULE', RETURNING:'ARMOR_HALL', SHUTDOWN:'IDLE' };
export class WorkspaceMachine {
  constructor({modules, onChange = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
    this.modules = modules; this.onChange = onChange; this.now = now; this.schedule = schedule; this.cancel = cancel;
    this.timer = null; this.shutdownPending = false; this.durations = {...DURATIONS};
    this.value = { state:'IDLE', since:now(), revision:0, selected:null, hover:null };
  }
  snapshot() { return {...this.value}; }
  set(state, data = {}) {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.value = {...this.value, ...data, state, since:this.now(), revision:this.value.revision + 1};
    this.onChange(this.snapshot());
    if (NEXT[state]) this.timer = this.schedule(() => {
      this.timer = null;
      if (state === 'RETURNING' && this.shutdownPending) this.set('SHUTDOWN', {hover:null});
      else this.set(NEXT[state], NEXT[state] === 'ARMOR_HALL' || NEXT[state] === 'IDLE' ? {selected:null,hover:null} : {});
    }, this.durations[state]);
    return true;
  }
  dispatch(action, id) {
    const s = this.value.state;
    if (action === 'skip') {                       // jump straight to where the transition was heading
      if (['WAKE','BOOT','HUD','HELMET_INTERIOR','HELMET_OPENING'].includes(s)) return this.set('ARMOR_HALL', {selected:null,hover:null});
      if (s === 'SUIT_SELECTED') return this.set('MODULE');
      if (s === 'RETURNING') return this.shutdownPending ? this.set('SHUTDOWN', {hover:null}) : this.set('ARMOR_HALL', {selected:null,hover:null});
      return false;
    }
    if (action === 'wake' && s === 'IDLE') { this.shutdownPending=false; return this.set('WAKE', {selected:null,hover:null}); }
    if (action === 'hover' && ['ARMOR_HALL','SUIT_HOVER'].includes(s)) {
      if (id != null && !this.modules.some(m=>m.id===id)) return false;
      if (this.value.hover === id) return false;
      return this.set(id ? 'SUIT_HOVER':'ARMOR_HALL', {hover:id});
    }
    if (action === 'select' && ['ARMOR_HALL','SUIT_HOVER'].includes(s) && this.modules.some(m=>m.id===id)) return this.set('SUIT_SELECTED', {selected:id,hover:null});
    if (['home','back'].includes(action)) {
      if (['MODULE','SUIT_SELECTED'].includes(s)) return this.set('RETURNING', {hover:null});
      if (s === 'RETURNING' || s === 'SHUTDOWN' || s === 'IDLE') return false;
      if (['ARMOR_HALL','SUIT_HOVER'].includes(s)) return action === 'back' ? this.set('SHUTDOWN', {hover:null}) : false;
      return this.set('ARMOR_HALL', {selected:null,hover:null});
    }
    if (action === 'standdown' && !['IDLE','SHUTDOWN'].includes(s)) {
      this.shutdownPending = true;
      return this.set(['MODULE','SUIT_SELECTED','RETURNING'].includes(s) ? 'RETURNING':'SHUTDOWN', {hover:null});
    }
    if (action === 'debug-hall') { this.shutdownPending=false; return this.set('ARMOR_HALL',{selected:null,hover:null}); }
    if (action === 'debug-helmet') { this.shutdownPending=false; return this.set('HELMET_INTERIOR',{selected:null,hover:null}); }
    return false;
  }
  dispose() { if(this.timer!==null)this.cancel(this.timer); this.timer=null; }
}
