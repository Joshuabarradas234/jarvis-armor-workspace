const reactions = new Map();
export function reactionFrame(kind, age, quiet = false) {
  if (!['customer-angry', 'build-passed'].includes(kind) || age < 0 || age >= 120000) return null;
  return {colour: kind === 'customer-angry' ? '#ff3f35' : '#a3ffd1', strength: quiet ? .72 : .70 + .16 * Math.sin(age / 1100), label: kind === 'customer-angry' ? 'Customer email needs attention' : 'Build completed successfully'};
}
export function suitReaction(id, quiet = false, now = Date.now()) {
  const r = reactions.get(id); if (!r) return null;
  const frame = reactionFrame(r.kind, now - r.at, quiet); if (!frame) reactions.delete(id); return frame;
}
export function reactSuit(message, now = Date.now()) {
  const id = message.kind === 'customer-angry' ? 'im7' : message.kind === 'build-passed' ? 'im1' : null;
  if (!id || !Number.isFinite(message.at) || now - message.at > 120000 || message.at > now + 5000) return false;
  reactions.set(id, {kind: message.kind, at: message.at}); return true;
}
if (typeof window !== 'undefined' && window.jarvis) {
  window.jarvis.on('core', m => { if (m.type === 'reaction') reactSuit(m); });
  setInterval(() => {
    for (const id of ['im1', 'im7']) {
      const node = document.querySelector(`.hotspot[data-suit="${id}"]`); if (!node) continue;
      const r = suitReaction(id, true); let badge = node.querySelector('[data-suit-reaction]');
      if (!r) { badge?.remove(); continue; }
      if (!badge) { badge = document.createElement('span'); badge.dataset.suitReaction = '1'; badge.style.cssText = 'display:block;font:10px/1.4 Segoe UI,sans-serif;background:#081218e8;padding:3px 5px;border-radius:4px;white-space:normal;pointer-events:none'; node.append(badge); }
      badge.textContent = r.label; badge.style.color = r.colour;
    }
  }, 1500);
}
