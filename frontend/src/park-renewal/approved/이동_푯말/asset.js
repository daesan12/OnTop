import { THREE, Builder } from './src/primitives.js';

export const SIGN_VARIANTS = Object.freeze([
  { id: 'wood-arrow', name: '목재 화살표형', description: '작은 갈림길에 세우는 기본 목재 푯말' },
  { id: 'crossroads', name: '다중 방향형', description: '세 곳의 목적지를 함께 안내하는 갈림길 푯말' },
  { id: 'hanging', name: '매달림형', description: '나무 가로대에 밧줄로 매단 둥근 모서리 푯말' }
]);

const C = Object.freeze({ wood: '#91603b', edge: '#b17c47', darkWood: '#67472f', jade: '#365b47', paper: '#f4e5bf', gold: '#bc9452', rope: '#c3a97a' });
function extrude(s, depth, bevel = .015) {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, bevelThickness: bevel, bevelSize: bevel, curveSegments: 7, steps: 1 });
  g.translate(0, 0, -depth / 2); return g;
}
function polygon(points) { const s = new THREE.Shape(); points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; }
function rounded(w, h, depth, r = .05) {
  const x = w / 2, y = h / 2, s = new THREE.Shape();
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  return extrude(s, depth, Math.min(depth * .2, .018));
}
const part = (b, kind, g, color, p, scale = [1, 1, 1], rot = [0, 0, 0]) => b.add(kind, g, color, p, scale, rot);
function box(b, kind, color, p, dimensions, r = .035) { part(b, kind, rounded(...dimensions, r), color, p); }
function ropeCollar(b, x, y, z, turns = 3, radius = .115) {
  for (let i = 0; i < turns; i++) b.ring('cloth', C.rope, [x, y + i * .04, z], radius, .022, [Math.PI / 2, 0, 0], 12);
}
function grain(b, x, y, z, w, h, color = '#a67342') {
  for (const sign of [-1, 1]) for (const side of [-1, 1]) {
    b.curve('wood', color, [[x - w / 2, y + sign * h * .39, side * z], [x - w * .15, y + sign * h * .36, side * (z + .001)], [x + w * .3, y + sign * h * .4, side * z]], .0055, 6, 3);
  }
}
function arrow(b, direction, p, size = .2, color = C.paper) {
  const s = polygon([[-.6, -.12], [.05, -.12], [.05, -.38], [.6, 0], [.05, .38], [.05, .12], [-.6, .12]].map(([x, y]) => [x * direction, y]));
  part(b, 'cloth', extrude(s, .015, .006), color, p, [size, size, 1]);
}

/** A label is a texture so Korean remains editable independently of geometry. */
function textTexture(text, color) {
  if (!text || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 288;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas2D is required for sign labels');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 205px "WayfindingMyeongjo", "Malgun Gothic", sans-serif';
  ctx.fillStyle = color; ctx.fillText(text, 512, 147, 970);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; texture.name = `wayfinding-label:${text}`; return texture;
}
function label(group, ownedTextures, text, p, width, height, color, bothSides = true) {
  const texture = textTexture(text, color); if (!texture) return;
  ownedTextures.push(texture);
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .03, roughness: 1, depthWrite: false });
  for (const side of bothSides ? [1, -1] : [1]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(p[0], p[1], p[2] * side); mesh.rotation.y = side === 1 ? 0 : Math.PI;
    mesh.name = `label-${ownedTextures.length}-${side === 1 ? 'front' : 'back'}`; mesh.userData.text = text; group.add(mesh);
  }
}
function board(b, slots, y, direction, text, width = 1.65) {
  const s = polygon([[-.79, -.19], [.34, -.19], [.34, -.28], [.86, 0], [.34, .28], [.34, .19], [-.79, .19]].map(([x, y]) => [x * direction, y]));
  part(b, 'wood', extrude(s, .11, .022), C.wood, [0, y, 0], [width / 1.65, 1, 1]);
  grain(b, -.14 * direction, y, .08, 1.08, .37);
  for (const sy of [-1, 1]) for (const side of [-1, 1]) b.ball('gold', C.gold, [-.65 * direction, y + sy * .12, side * .082], [.02, .02, .012]);
  slots.push({ text, p: [-.14 * direction, y, .082], w: .93, h: .28, color: C.paper });
}
function woodArrow(b, slots, entries) {
  // The shaft is recessed into the board sockets, leaving the rear text face clear.
  for (const [lo, hi] of [[-.07, 1.43], [1.77, 2.27]]) b.cylinder('wood', C.darkWood, [0, (lo + hi) / 2, -.13], .08, .105, hi - lo, [0, 0, 0], 12);
  b.ball('wood', C.jade, [0, 2.31, -.13], [.13, .13, .13]); b.cylinder('gold', C.gold, [0, 2.15, -.13], .1, .1, .07, [0, 0, 0], 12);
  board(b, slots, 1.6, entries[0].direction, entries[0].text); ropeCollar(b, 0, .55, -.13);
}
function crossroads(b, slots, entries) {
  for (const [lo, hi] of [[-.07, .85], [1.19, 1.44], [1.78, 2.03], [2.37, 2.55]]) b.cylinder('wood', C.darkWood, [0, (lo + hi) / 2, -.13], .095, .12, hi - lo, [0, 0, 0], 12);
  b.ball('wood', C.jade, [0, 2.65, -.13], [.15, .12, .15]); b.cylinder('gold', C.gold, [0, 2.51, -.13], .115, .115, .08, [0, 0, 0], 12);
  entries.forEach((e, i) => board(b, slots, 2.2 - i * .59, e.direction, e.text));
  ropeCollar(b, 0, .42, -.13, 4, .13);
}
function hanging(b, slots, entries) {
  b.cylinder('wood', C.darkWood, [-.65, 1.19, 0], .09, .12, 2.54, [0, 0, 0], 12);
  box(b, 'wood', C.wood, [.12, 2.31, 0], [1.84, .17, .2], .05);
  b.beam('wood', C.wood, [-.62, 1.95, 0], [-.14, 2.29, 0], .09);
  for (const x of [-.18, .79]) {
    b.curve('cloth', C.rope, [[x, 2.29, -.1], [x, 2.39, 0], [x, 2.29, .1], [x, 1.87, .09]], .025, 12, 6);
    b.ring('gold', C.gold, [x, 1.87, .035], .055, .014, [0, 0, 0], 10);
  }
  // Shifted board hangs clear of the supporting post.
  box(b, 'wood', C.edge, [.3, 1.58, 0], [1.43, .62, .13], .105);
  box(b, 'wood', C.jade, [.3, 1.58, 0], [1.27, .45, .16], .075);
  const d = entries[0].direction;
  slots.push({ text: entries[0].text, p: [.3 - d * .14, 1.58, .111], w: .78, h: .27, color: C.paper });
  for (const side of [-1, 1]) arrow(b, d, [.3 + d * .46, 1.58, side * .11], .15);
  ropeCollar(b, -.65, .53, 0, 4, .13);
}

/**
 * Independent visual asset; no movement/teleport/map/physics behavior.
 * direction is world-local +/-X, as seen from the +Z front. Rear labels stay readable.
 * All label textures/materials belong to the returned handle.
 */
export function createWayfindingSign({ variant = 'wood-arrow', label: text = '목적지', direction = 'right', destinations, showText = true, scale = 1 } = {}) {
  if (!SIGN_VARIANTS.some(v => v.id === variant)) throw new RangeError(`Unknown sign variant: ${variant}`);
  if (!['left', 'right'].includes(direction)) throw new RangeError('direction must be left or right');
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale must be positive and finite');
  if (destinations !== undefined && (!Array.isArray(destinations) || destinations.length !== 3)) throw new RangeError('destinations must contain exactly 3 entries');
  const clean = value => { if (typeof value !== 'string' || [...value].length > 24) throw new RangeError('label must be a string of at most 24 characters'); return value.normalize('NFC').trim(); };
  const raw = destinations ?? [{ label: text, direction }, { label: '목적지', direction: 'left' }, { label: '목적지', direction: 'right' }];
  const entries = raw.map(e => {
    if (!e || !['left', 'right'].includes(e.direction)) throw new RangeError('destination direction must be left or right');
    return { text: showText ? clean(e.label) : '', direction: e.direction === 'left' ? -1 : 1 };
  });
  const b = new Builder('balanced'), slots = [];
  ({ 'wood-arrow': woodArrow, crossroads, hanging })[variant](b, slots, entries);
  const group = b.finish(`wayfinding-${variant}`), textures = [];
  slots.forEach(s => label(group, textures, s.text, s.p, s.w, s.h, s.color));
  group.scale.setScalar(scale); group.userData = { assetId: `park/wayfinding/${variant}`, version: '2.0.0', visualOnly: true, labels: entries.map(e => e.text), front: '+Z', directionFromFront: entries.map(e => e.direction === 1 ? 'right' : 'left') };
  group.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3());
  let triangles = 0, meshes = 0; const materials = new Set();
  group.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; materials.add(o.material); } });
  let disposed = false;
  return {
    group, bounds, size, stats: { triangles, meshes, materials: materials.size },
    dispose() { if (disposed) return; disposed = true; group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }
  };
}
