/* Suit entry choreography. Times fit inside the existing three-second selection state. */
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const REST = Object.freeze({ door: 0, eyes: 0, scan: 0, pulse: 0, yaw: 0, lean: 0, roll: 0, lift: 0, forward: 0, stance: 0 });
export const PROFILES = Object.freeze({
  ironman: { yaw: -.14, lean: -.008, roll: 0, lift: .008, forward: .055 },
  batcave: { yaw: .16, lean: -.010, roll: 0, lift: 0, forward: .04 },
  spiderman: { yaw: -.18, lean: .012, roll: -.008, lift: .003, forward: .05 },
});
export function entryFrame(theme, seconds, reduced = false) {
  if (reduced) return { ...REST, door: 1, eyes: 1 };
  const t = Math.max(0, seconds), p = PROFILES[theme] || PROFILES.ironman;
  const stance = smooth((t - .85) / 1.1), scan = clamp((t - .18) / 1.1);
  return { door: smooth((t - .12) / .95), eyes: smooth((t - .68) / .55), scan,
    pulse: t < .35 || t > 1.7 ? 0 : Math.sin(clamp((t - .35) / 1.35) * Math.PI),
    yaw: p.yaw * stance, lean: p.lean * stance, roll: p.roll * stance,
    lift: p.lift * stance, forward: p.forward * stance, stance };
}
export function createEntryMotion(theme, id) {
  let active = false, start = 0, closing = null, last = { ...REST };
  return {
    update(snapshot, now, reduced = false, elapsed = null) {
      const wanted = snapshot?.selected === id && ['SUIT_SELECTED', 'MODULE'].includes(snapshot.state);
      if (wanted && !active) { active = true; closing = null; start = now - (snapshot.state === 'MODULE' ? 3000 : Math.max(0, Math.min(3000, elapsed || 0))); }
      if (!wanted && active) { active = false; closing = { at: now, from: { ...last } }; }
      if (active) last = entryFrame(theme, (now - start) / 1000, reduced);
      else if (closing && !reduced) {
        const k = 1 - smooth((now - closing.at) / 700);
        last = Object.fromEntries(Object.keys(REST).map(key => [key, key === 'scan' || key === 'pulse' ? 0 : closing.from[key] * k]));
        if (!k) closing = null;
      } else { last = { ...REST }; closing = null; }
      return { ...last, seconds: active ? (now - start) / 1000 : 0, engaged: active || !!closing };
    },
  };
}

// Keep the zoomed artwork covering the window when selecting an end pod.
export function entryZoom(r, fill, max = 3.2) {
  const scale = Math.max(1.3, Math.min(max, r.H * fill / r.h));
  const axis = (centre, viewport, low, high) => {
    const min = viewport / 2 - (high - viewport / 2) * scale;
    const max = -viewport / 2 - (low - viewport / 2) * scale;
    return min > max ? 0 : Math.max(min, Math.min(max, (viewport / 2 - centre) * scale));
  };
  return { scale, x: axis(r.x + r.w / 2, r.W, r.imageLeft, r.imageRight),
    y: axis(r.y + r.h * .47, r.H, r.imageTop, r.imageBottom) };
}

export function makeDoors(T, texture, accent) {
  const root = new T.Group(), leaves = [], lights = [], latches = [];
  for (const side of [-1, 1]) {
    const leaf = new T.Group(); root.add(leaf); leaves.push({ leaf, side });
    const pane = new T.Mesh(new T.PlaneGeometry(.5, 1), new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: .85, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
    pane.renderOrder = 10; leaf.add(pane);
    // Bright edges and latch plates make the moving glass legible against the static architecture.
    for (const x of [-.25, .25]) {
      const rail = new T.Mesh(new T.PlaneGeometry(.012, 1), new T.MeshBasicMaterial({ color: '#243645', transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
      rail.position.set(x, 0, .002); rail.renderOrder = 11; leaf.add(rail);
      const light = new T.Mesh(new T.PlaneGeometry(.003, .92), new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: .7, depthWrite: false, toneMapped: false }));
      light.position.set(x, 0, .004); light.renderOrder = 12; leaf.add(light); lights.push(light);
    }
    for (const y of [-.493, .493]) {
      const edge = new T.Mesh(new T.PlaneGeometry(.5, .014), new T.MeshBasicMaterial({ color: '#718696', transparent: true, opacity: .85, depthWrite: false, toneMapped: false }));
      edge.position.set(0, y, .003); edge.renderOrder = 11; leaf.add(edge);
    }
    const latch = new T.Mesh(new T.PlaneGeometry(.035, .032), new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    latch.position.set(-side * .228, -.02, .006); latch.renderOrder = 12; leaf.add(latch); latches.push(latch);
  }
  return { root, leaves, lights, latches };
}
export function placeDoors(doors, amount, width, height, centreY, depth, visible) {
  doors.root.visible = visible;
  doors.root.position.set(0, centreY, depth); doors.root.scale.set(width, height, 1);
  for (const { leaf, side } of doors.leaves) { leaf.position.set(side * (.25 + .57 * amount), 0, 0); leaf.rotation.y = side * amount * .48; }
  for (const light of doors.lights) light.material.opacity = .45 + .5 * amount;
  for (const latch of doors.latches) latch.material.opacity = .8 * (1 - amount);
}

// Vertices are picked on each normalised GLB's actual eye surfaces, not inferred from the screen.
export function makeEyes(T, pivot, polygons, colour) {
  const eyes = [];
  for (const positions of polygons || []) {
    if (positions.length < 9 || positions.length % 9) continue;
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const material = new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthTest: true, depthWrite: false, toneMapped: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const eye = new T.Mesh(geometry, material); eye.renderOrder = 6; eye.visible = false; pivot.add(eye); eyes.push(eye);
  }
  return eyes;
}
