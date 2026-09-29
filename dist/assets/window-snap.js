export function snapRect(area, bounds) {
  const {x, y, width, height} = bounds, w = Math.floor(width / 2), h = Math.floor(height / 2);
  if (!['full', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(area)) return null;
  if (area === 'full') return {x, y, width, height};
  const right = area.endsWith('right'), quarter = area.includes('-'), bottom = area.startsWith('bottom');
  return {x: x + (right ? w : 0), y: y + (bottom ? h : 0), width: right ? width - w : w, height: quarter ? (bottom ? height - h : h) : height};
}
export function snapTarget(x, y, bounds, edge = 28) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || bounds.width < 640 || bounds.height < 440) return null;
  const left = x <= bounds.x + edge, right = x >= bounds.x + bounds.width - edge;
  if (!left && !right) return null;
  const side = left ? 'left' : 'right';
  return snapRect((y < bounds.y + bounds.height * .22 ? 'top-' : y > bounds.y + bounds.height * .78 ? 'bottom-' : '') + side, bounds);
}
const J = globalThis.window?.jarvis;
if (J) {
  let preview, rect;
  const clear = () => { preview?.remove(); preview = null; rect = null; };
  const move = (x, y) => {
    rect = snapTarget(x, y, {x: 6, y: 6, width: innerWidth - 12, height: innerHeight - 12});
    if (!rect) { clear(); return; }
    if (!preview) { preview = document.createElement('div'); preview.className = 'wb-snap'; preview.setAttribute('role', 'status'); preview.textContent = 'Release to snap'; document.body.append(preview); }
    Object.assign(preview.style, {left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px'});
  };
  window.__jarvisSnap = {move, clear, take() { const r = rect; clear(); return r; }};
  addEventListener('pagehide', clear);
}
