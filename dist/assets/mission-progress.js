/* Live mission progress on the original suit buttons; no invented percentages. */
export function missionProgress(bay={}){
  const status=['planned','running','blocked','done'].includes(bay.status)?bay.status:'idle';
  const pct=Math.max(0,Math.min(100,Math.round(Number(bay.progress)||0))),indeterminate=status==='running'&&pct===0;
  const title={idle:'',planned:'Queued',running:'Working',blocked:'Needs attention',done:'Done'}[status];
  return{status,pct,indeterminate,visible:status!=='idle',text:title+(status==='running'&&!indeterminate?' · '+pct+'%':'')};
}
export function applyMissionProgress(root,bays){
  const rows=new Map((bays||[]).filter(b=>b&&!b.isVehicle).map(b=>[b.id,b]));
  for(const label of root.querySelectorAll('.bay-label[data-suit]')){
    const p=missionProgress(rows.get(label.dataset.suit));let card=label.querySelector('.mission-progress');
    if(!p.visible){card?.remove();continue;}
    if(!card){card=document.createElement('span');card.className='mission-progress';card.innerHTML='<span class="mission-state"><i></i><b></b></span><span class="mission-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span>';label.append(card);}
    const key=p.status+':'+p.pct;if(card.dataset.progressKey===key)continue;card.dataset.progressKey=key;
    card.dataset.status=p.status;card.classList.toggle('indeterminate',p.indeterminate);card.querySelector('b').textContent=p.text;
    const track=card.querySelector('.mission-track');track.setAttribute('aria-label',p.text);track.setAttribute('aria-valuetext',p.indeterminate?'Working; waiting for reported progress':p.text);
    if(p.indeterminate)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(p.pct));
    card.style.setProperty('--mission-progress',p.pct+'%');
  }
}
