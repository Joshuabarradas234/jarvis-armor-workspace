/** Executed only after the owner selects a tab for a brief. Never reads field values. */
export function visiblePageExcerpt() {
  const parts = []; let length = 0, visited = 0;
  const walk = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  while (walk.nextNode() && length < 12000 && visited++ < 30000) {
    const node = walk.currentNode, el = node.parentElement;
    if (!el || el.closest('script,style,noscript,template,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]')) continue;
    const css = getComputedStyle(el);
    if (css.visibility !== 'visible' || css.display === 'none' || !el.getClientRects().length) continue;
    const value = node.textContent.replace(/\s+/g, ' ').trim().slice(0, 12000 - length);
    if (value) { parts.push(value); length += value.length + 1; }
  }
  return {url: location.href, title: document.title, text: parts.join('\n').slice(0, 12000)};
}
