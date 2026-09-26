/* Theme-specific name plates. The existing button keeps its name, focus and live progress. */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const marks = {
  ironman: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="8"/><path d="M16 9 22 20H10Z"/><path d="M16 2v3M28 9l-3 2M28 23l-3-2M16 30v-3M4 23l3-2M4 9l3 2"/>',
  batcave: '<path fill="currentColor" stroke="none" d="m2 9 7 3 4-1 2-5 1 3 1-3 2 5 4 1 7-3-3 9-5-2-4 3-2 5-2-5-4-3-5 2Z"/>',
  spiderman: '<path d="m13 12-4-3-1-5m11 8 4-3 1-5M12 15l-7-2-3-5m18 7 7-2 3-5M12 18l-7 3-3 6m18-9 7 3 3 6M13 21l-4 5v4m10-9 4 5v4"/><ellipse cx="16" cy="17" rx="4" ry="7"/><path d="m14 10-1-4m5 4 1-4"/>',
};
export function hallLabel(suit) {
  const family = /^bc/.test(suit.id) ? 'batcave' : /^sm/.test(suit.id) ? 'spiderman' : 'ironman';
  const index = Number.isInteger(suit.index) && suit.index >= 0 ? String(suit.index).padStart(2, '0') : '—';
  const series = suit.isVehicle ? 'CORE' : ({ ironman: 'MARK', batcave: 'VAULT', spiderman: 'LAB' }[family] + ' / ' + index);
  return '<div class="hq-label hq-' + family + '"><div class="hq-crest" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + marks[family] + '</svg></div><div class="hq-copy"><small aria-hidden="true">' + series + '</small><b>' + esc(suit.name) + '</b></div><i class="hq-light" aria-hidden="true"></i></div>';
}
