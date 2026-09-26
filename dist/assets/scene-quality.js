/* Shared image loading and graphics cleanup. */
export const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A ticket starts before any IPC or fetch. A late image can never replace a newer hall.
export function imagePresenter(host) {
  let generation = 0, previous = null, timer = 0;
  const invalidate = () => ++generation;
  const current = ticket => ticket === generation;
  async function show(url, ticket) {
    if (!url || !current(ticket)) return false;
    const img = new Image();
    const loaded = await new Promise(resolve => {
      const finish = ok => { clearTimeout(timeout); img.onload = img.onerror = null; resolve(ok); };
      const timeout = setTimeout(() => finish(false), 15000);
      img.onload = () => finish(true); img.onerror = () => finish(false); img.src = url;
    });
    if (!loaded || !current(ticket)) return false;
    const next = 'url(' + JSON.stringify(url) + ')';
    if (host.style.backgroundImage === next) return true;
    previous?.remove(); clearTimeout(timer); previous = null;
    if (host.style.backgroundImage && !reducedMotion()) {
      previous = document.createElement('div'); previous.className = 'scene-previous';
      previous.style.backgroundImage = host.style.backgroundImage; previous.setAttribute('aria-hidden', 'true');
      host.appendChild(previous); void previous.offsetWidth; previous.classList.add('out');
      const old = previous; timer = setTimeout(() => { old.remove(); if (previous === old) previous = null; }, 650);
    }
    host.style.backgroundImage = next; host.classList.add('in'); return true;
  }
  return { invalidate, current, show, dispose() { invalidate(); clearTimeout(timer); previous?.remove(); previous = null; } };
}

// GLTF meshes often share textures, materials and geometry; dispose each resource only once.
export function disposeObject(root, shared = new Set(), seen = new Set()) {
  const release = value => { if (!value?.dispose || shared.has(value) || seen.has(value)) return; seen.add(value); value.dispose(); };
  root?.traverse(o => { release(o.geometry); for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) release(v); release(m); } });
  return seen;
}
