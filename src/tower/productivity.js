const text=(v,n=2000)=>typeof v==='string'?v.trim().slice(0,n):'';
export function briefOf(value={}) {
  return Object.fromEntries(['outcome','audience','files','constraints','finished','preferences','checklist'].map(k=>[k,text(value?.[k])]).concat([['budget',Number.isFinite(value?.budget)?Math.max(.05,Math.min(100,value.budget)):null]]));
}
export function briefGaps(brief) {
  return ['outcome','audience','files','constraints','finished'].filter(k=>!brief[k]).map(k=>({outcome:'the outcome',audience:'who this is for',files:'the files or sources (or “none needed”)',constraints:'the constraints (or “none”)',finished:'what finished means'}[k]));
}
export function briefText(b) {
  return Object.entries(b||{}).filter(([,v])=>v!==null&&v!=='').map(([k,v])=>`${k.toUpperCase()}: ${v}`).join('\n');
}
export function reviewOf(raw,steps=[]) {
  const s=String(raw||'').trim(),m=/^VERDICT: *(APPROVED|CHANGES)\s*\r?\nNOTES: *([\s\S]*?)\r?\n---\s*\r?\n([\s\S]+)$/i.exec(s);
  const approved=!!m&&m[1].toUpperCase()==='APPROVED'&&!!m[2].trim()&&!!m[3].trim()&&steps.length>0&&steps.every(x=>x.status==='done');
  return {verdict:approved?'APPROVED':'CHANGES',notes:(!m?'The reviewer did not provide a valid sign-off.':steps.some(x=>x.status!=='done')?'Some assigned work failed and must be corrected. '+m[2]:m[2]).trim().slice(0,1600),body:m?.[3].trim()||''};
}
export function usefulness(runs) {
  const real=runs.filter(r=>!r.rehearsal&&!(r.status==='needs_brief'&&!r.calls)),accepted=real.filter(r=>r.status==='done'&&r.verdict==='APPROVED'&&r.feedback?.good===true);
  const cost=real.reduce((s,r)=>s+(Number(r.cost)||0),0),rework=real.filter(r=>(r.rework||0)>0||r.feedback?.good===false||r.status==='needs_changes').length;
  return {runs:real.length,accepted:accepted.length,rework,cost,costPerAccepted:accepted.length?cost/accepted.length:null,
    completionMs:accepted.length?accepted.reduce((s,r)=>s+Math.max(0,r.endedAt-r.startedAt),0)/accepted.length:null,
    awaitingAcceptance:real.filter(r=>r.status==='done'&&!r.feedback).length};
}
