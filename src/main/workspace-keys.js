/** Match only deliberate browser shortcuts, without stealing typing or AltGr. */
export function workspaceKey(i){
  if(i.type==='keyDown'&&i.key==='F5'&&!i.control&&!i.alt&&!i.meta&&!i.shift)return 'reload';
  if(i.type!=='keyDown'||i.isComposing||i.alt||i.meta||!i.control)return null;
  const k=String(i.key).toLowerCase();
  if(i.shift)return k==='t'?'reopen':k==='tab'?'previous':null;
  return {k:'menu',l:'address',t:'new',w:'close',tab:'next',r:'reload'}[k]||null;
}
