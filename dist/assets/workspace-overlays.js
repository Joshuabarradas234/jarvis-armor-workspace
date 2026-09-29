const J=globalThis.window?.jarvis;
if(J&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
 let last=null,pending=false;
 const sync=()=>{pending=false;const covered=!!document.querySelector('[aria-modal="true"],.jc,.tw.in,.ix-room.in,.gx.in');if(covered!==last){last=covered;J.call('tabs-occluded',covered).catch(()=>{last=null;});}};
 const observer=new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(sync);}});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-modal']});sync();addEventListener('pagehide',()=>observer.disconnect());
}
