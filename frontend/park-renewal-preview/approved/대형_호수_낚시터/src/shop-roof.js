import { THREE } from './primitives.js';

export function roofHeight(x, z, width = 5.88, depth = 3.1, ridgeY = 3.8, rise = .83) {
  const t = Math.min(1.06, Math.abs(z) / (depth / 2));
  return ridgeY - rise * Math.pow(t, .72) + .22 * t ** 5 + .16 * (x / (width / 2)) ** 6 * t;
}

function closedGrid(nx, nz, sample, thickness, sign) {
  const p = [], index = [], stride = nx + 1, count = stride * (nz + 1);
  for (let layer = 0; layer < 2; layer++) for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const v = sample(i / nx, j / nz); p.push(v[0], v[1] - layer * thickness, v[2]);
  }
  const tri = (a, b, c, outward = true) => index.push(...((sign === 1) === outward ? [a, c, b] : [a, b, c]));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * stride + i, c = a + stride;
    tri(a, a + 1, c); tri(a + 1, c + 1, c);
    tri(a + count, a + 1 + count, c + count, false); tri(a + 1 + count, c + 1 + count, c + count, false);
  }
  const edge = [];
  for (let i = 0; i <= nx; i++) edge.push(i);
  for (let j = 1; j <= nz; j++) edge.push(j * stride + nx);
  for (let i = nx - 1; i >= 0; i--) edge.push(nz * stride + i);
  for (let j = nz - 1; j > 0; j--) edge.push(j * stride);
  for (let i = 0; i < edge.length; i++) { const a = edge[i], b = edge[(i + 1) % edge.length]; tri(a, a + count, b); tri(b, a + count, b + count); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(index); g.computeVertexNormals(); return g;
}
export function createRoofSkin(width, depth, ridgeY, rise, sign = 1) {
  return closedGrid(12, 6, (u, v) => { const x = (u - .5) * width, z = sign * v * depth / 2; return [x, roofHeight(x, z, width, depth, ridgeY, rise) - .05, z]; }, .065, sign);
}
export const PAN_COURSES = Object.freeze([[0, .35], [.31, .69], [.65, 1.045]]);
export function createPanTile(x0, x1, course, sign = 1, width = 5.88, depth = 3.1, ridgeY = 3.8, rise = .83) {
  const [t0, t1] = PAN_COURSES[course], lift = [.032, .019, .007][course];
  return closedGrid(4, 2, (u, v) => {
    const x = x0 + (x1 - x0) * u, z = sign * (t0 + (t1 - t0) * v) * depth / 2;
    return [x, roofHeight(x, z, width, depth, ridgeY, rise) + lift + .04 * (2 * u - 1) ** 2, z];
  }, .022, sign);
}

function facesGeometry(faces, targetNormal) {
  const positions = [];
  for (const [a, b, c, normal] of faces) {
    const target = normal ?? targetNormal;
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const points = target && n.dot(target) < 0 ? [a, c, b] : [a, b, c];
    positions.push(...points.flatMap(p => p.toArray()));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g;
}

/** Caps reuse the tube's actual end rings, avoiding a separately rotated polygon phase. */
export function createRollParts(points, radius, steps, sides) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), tube = new THREE.TubeGeometry(path, steps, radius, sides, false), p = tube.attributes.position;
  const start = path.getPoint(0), end = path.getPoint(1), tangent = path.getTangent(1).normalize(), outwardStart = path.getTangent(0).negate().normalize();
  const first = [], last = [];
  for (let i = 0; i < sides; i++) { first.push(new THREE.Vector3().fromBufferAttribute(p, i)); last.push(new THREE.Vector3().fromBufferAttribute(p, steps * (sides + 1) + i)); }
  const lipCenter = end.clone().addScaledVector(tangent, .012);
  const inner = last.map(v => lipCenter.clone().add(v.clone().sub(end).multiplyScalar(.94)));
  const startFaces = [], bevelFaces = [], endFaces = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, radial = last[i].clone().add(last[j]).multiplyScalar(.5).sub(end);
    startFaces.push([start, first[i], first[j]]);
    bevelFaces.push([last[i], last[j], inner[i], radial], [last[j], inner[j], inner[i], radial]);
    endFaces.push([lipCenter, inner[i], inner[j]]);
  }
  return { tube, start: facesGeometry(startFaces, outwardStart), bevel: facesGeometry(bevelFaces), end: facesGeometry(endFaces, tangent) };
}
function roll(b, kind, color, points, radius, steps, sides, endKind = kind, endColor = color, startKind = kind, startColor = color) {
  const g = createRollParts(points, radius, steps, sides);
  b.add(kind, g.tube, color); b.add(startKind, g.start, startColor); b.add(kind, g.bevel, color); b.add(endKind, g.end, endColor);
}

export function roofRows(width = 5.88, light = false) {
  const span = width - .38, count = Math.ceil(span / (light ? .4 : .31));
  return Array.from({ length: count + 1 }, (_, i) => (i / count - .5) * span);
}

export function tiledRoof(b, width, depth, ridgeY, rise = .83) {
  const half = depth / 2, light = b.quality === 'light', rows = roofRows(width, light), rim = width / 2 + .018;
  const height = (x, t) => roofHeight(x, t * half, width, depth, ridgeY, rise);
  const bounds = [-rim, ...rows, rim];
  for (const sign of [-1, 1]) {
    b.add('tile', createRoofSkin(width, depth, ridgeY, rise, sign), '#464651');
    // Three overlapping courses of concave pans completely cover the gaps between rolls.
    for (let i = 0; i < bounds.length - 1; i++) for (let course = 0; course < 3; course++) {
      b.add('tile', createPanTile(bounds[i], bounds[i + 1], course, sign, width, depth, ridgeY, rise), ['#555562', '#585864', '#53535f'][course]);
    }
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i], points = Array.from({ length: 14 }, (_, j) => { const t = j / 13 * 1.045; return [x, height(x, t) + .035, sign * t * half]; });
      roll(b, 'tile', i % 3 ? '#55545f' : '#62616d', points, .073, light ? 7 : 8, light ? 8 : 10, 'stone', '#e2d3b8');
    }
    const eave = Array.from({ length: 17 }, (_, i) => { const x = (i / 16 - .5) * (width - .06); return [x, height(x, 1) - .17, sign * (half - .025)]; });
    roll(b, 'wood', '#8c5e35', eave, .12, 20, 10);
    for (let i = 0; i <= 12; i++) { const x = (i / 12 - .5) * (width - .48), t = (half - .2) / half; b.beam('wood', '#9d7246', [x, ridgeY - .37, 0], [x, height(x, t) - .25, sign * (half - .2)], .09, .11); }
  }
  const endX = width / 2 + .035, ridgeYAt = x => ridgeY + .06 + .18 * (Math.abs(x) / endX) ** 6;
  // A continuous pedestal fills the space below the raised ridge ends.
  const base = new THREE.Shape(); base.moveTo(-endX, ridgeY - .035); base.lineTo(endX, ridgeY - .035);
  for (let i = 0; i <= 24; i++) { const x = endX - i / 24 * endX * 2; base.lineTo(x, ridgeYAt(x) - .045); } base.closePath();
  const pedestal = new THREE.ExtrudeGeometry(base, { depth: .19, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 1, steps: 1, curveSegments: 1 }); pedestal.translate(0, 0, -.095); b.add('tile', pedestal, '#4b4a56');
  const ridge = Array.from({ length: 25 }, (_, i) => { const x = (i / 24 - .5) * endX * 2; return [x, ridgeYAt(x), 0]; });
  roll(b, 'tile', '#4b4a56', ridge, .12, 28, 12, 'gold', '#c4934a', 'gold', '#c4934a');
  for (const side of [-1, 1]) for (const sign of [-1, 1]) {
    const x = side * rim, points = Array.from({ length: 14 }, (_, j) => { const t = j / 13 * 1.045; return [x, height(x, t) + .03, sign * t * half]; });
    roll(b, 'tile', '#51505c', points, .086, light ? 9 : 14, 10, 'stone', '#e2d3b8');
  }
}
