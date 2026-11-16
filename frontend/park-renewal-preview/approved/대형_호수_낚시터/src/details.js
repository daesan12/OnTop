import { THREE } from './primitives.js';
export function extrude(s, depth, bevel = .02, curveSegments = 8, bevelSegments = 2) {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments, curveSegments, steps: 1 }); g.translate(0, 0, -depth / 2); return g;
}
export function roundBox(w, h, d, r = .04) {
  r = Math.min(r, Math.min(w, h) * .45);
  const x = w / 2, y = h / 2, s = new THREE.Shape();
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  const smooth = Math.min(w, h) > .18 && Math.max(w, h) > .4;
  return extrude(s, d, Math.min(d * .15, r * .35, .022), 3, 1);
}
export function box(b, kind, color, p, size, r = .035, rotation = [0, 0, 0]) { b.add(kind, roundBox(...size, r), color, p, [1, 1, 1], rotation); }
export function fishShape() {
  const s = new THREE.Shape(); s.moveTo(-.52, -.025);
  s.bezierCurveTo(-.56, .15, -.36, .3, -.12, .3); s.quadraticCurveTo(-.02, .43, .12, .31);
  s.quadraticCurveTo(.25, .29, .3, .19); s.lineTo(.51, .29); s.quadraticCurveTo(.59, .3, .55, .16);
  s.lineTo(.49, .01); s.lineTo(.56, -.18); s.quadraticCurveTo(.58, -.3, .45, -.24); s.lineTo(.27, -.15);
  s.quadraticCurveTo(.1, -.32, -.05, -.25); s.quadraticCurveTo(-.35, -.27, -.52, -.025); s.closePath(); return s;
}
export function fish(b, position, size = 1, rotation = [0, 0, 0], color = '#f4ae43') {
  const detail = size > .8 ? 9 : b.quality === 'light' ? 4 : 6;
  b.at(position, rotation, () => {
    b.add('food', extrude(fishShape(), .1, .025, size > .8 ? 8 : size < .25 ? 4 : 6), color, [0, 0, 0], [size, size, size]);
    b.ball('ink', '#864611', [-.35 * size, .105 * size, .08 * size], [.036 * size, .036 * size, .012 * size]);
    const curves = [
      [[-.23, .23], [-.16, .1], [-.16, -.04], [-.22, -.18]],
      [[-.48, -.025], [-.4, -.045], [-.32, -.035]],
      [[.38, .13], [.48, .19]], [[.37, .035], [.49, .045]], [[.38, -.06], [.48, -.15]]
    ];
    for (const x of [-.03, .14]) for (const y of [-.12, .065, .23]) curves.push([[x - .035, y], [x + .03, y - .02], [x + .05, y - .07], [x + .015, y - .11]]);
    for (const points of curves) b.curve('food', '#c77a21', points.map(([x, y]) => [x * size, y * size, .08 * size]), .009 * size, detail, 4);
  });
}
export function cloudShape() {
  const s = new THREE.Shape(); s.moveTo(-.5, -.07); s.bezierCurveTo(-.7, -.02, -.58, .29, -.36, .22); s.bezierCurveTo(-.39, .62, .2, .6, .23, .24); s.bezierCurveTo(.5, .35, .68, .06, .48, -.1); s.bezierCurveTo(.33, -.26, .1, -.22, .02, -.13); s.bezierCurveTo(-.15, -.3, -.4, -.27, -.5, -.07); return s;
}
export function cloud(b, p, size = .3, color = '#f8dc95') {
  b.add('food', extrude(cloudShape(), .05, .015), color, p, [size, size, 1]);
  const pts = Array.from({ length: 13 }, (_, i) => { const a = -.7 * Math.PI + i / 12 * 1.9 * Math.PI, r = .14 * (1 - i / 18); return [p[0] - .1 * size + Math.cos(a) * r * size, p[1] + .18 * size + Math.sin(a) * r * size, p[2] + .046]; });
  b.curve('food', '#d59035', pts, .009 * size, 12, 4);
}
export function lantern(b, p, size = 1) {
  b.at(p, [0, 0, 0], () => {
    box(b, 'glow', '#ffcc6b', [0, 0, 0], [.29 * size, .45 * size, .27 * size], .03 * size);
    for (const x of [-.18, .18]) for (const z of [-.165, .165]) box(b, 'gold', '#9f7339', [x * size, 0, z * size], [.035 * size, .55 * size, .035 * size], .006);
    for (const y of [-.28, .28]) box(b, 'gold', '#a77938', [0, y * size, 0], [.44 * size, .065 * size, .4 * size], .02);
    b.cylinder('gold', '#9e6b31', [0, .345 * size, 0], .12 * size, .2 * size, .08 * size, [0, 0, 0], 12);
    b.ring('iron', '#554430', [0, .435 * size, 0], .075 * size, .015 * size, [0, 0, 0], 12);
    // Thin horizontal lattice makes the bright panel legible as a lantern.
    for (const y of [-.15, .15]) for (const z of [-1, 1]) box(b, 'gold', '#9f7339', [0, y * size, z * .17 * size], [.36 * size, .023 * size, .026 * size], .006);
  });
}
export function pagoda(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size); ctx.fillStyle = color;
  ctx.beginPath(); for (const [i, p] of [[-.35, -.32], [-.35, -.22], [-.2, -.15], [-.2, -.03], [-.42, .05], [-.42, .15], [-.25, .15], [-.25, .32], [-.5, .4], [-.5, .52], [.5, .52], [.5, .4], [.25, .32], [.25, .15], [.42, .15], [.42, .05], [.2, -.03], [.2, -.15], [.35, -.22], [.35, -.32], [.1, -.4], [0, -.62], [-.1, -.4]].entries()) { i ? ctx.lineTo(...p) : ctx.moveTo(...p); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f6e7c1'; for (const yy of [-.2, .05, .28]) ctx.fillRect(-.055, yy, .11, .1); ctx.restore();
}
