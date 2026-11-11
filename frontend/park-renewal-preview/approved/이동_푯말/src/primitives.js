import * as THREE from 'three';

export { THREE };
export const TAU = Math.PI * 2;
export const V = (p) => new THREE.Vector3(...p);
export const radial = (angle, radius, y = 0) => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
const finishes = {
  wood: { roughness: 0.87 },
  cloth: { roughness: 1, side: THREE.DoubleSide },
  stone: { roughness: 0.95 },
  tile: { roughness: 0.78, side: THREE.DoubleSide },
  gold: { roughness: 0.5, metalness: 0.32 },
  glow: { roughness: 0.8, emissive: '#ffbb56', emissiveIntensity: 0.65 },
};

/** Owns all construction geometry; final meshes are merged by finish. */
export class Builder {
  constructor(quality = 'balanced') {
    this.quality = quality;
    this.parts = {};
    this.matrix = new THREE.Matrix4();
  }
  at(position, rotation, callback) {
    const old = this.matrix;
    const next = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
    next.setPosition(...position);
    this.matrix = old.clone().multiply(next);
    try { callback(); } finally { this.matrix = old; }
  }
  add(kind, geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    const m = new THREE.Matrix4().compose(V(position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), V(scale));
    geo.applyMatrix4(this.matrix.clone().multiply(m));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const c = new THREE.Color(color), colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (this.parts[kind] ??= []).push(geo);
  }
  box(kind, color, p, s, r = [0, 0, 0]) { this.add(kind, new THREE.BoxGeometry(1, 1, 1), color, p, s, r); }
  ball(kind, color, p, s) { this.add(kind, new THREE.SphereGeometry(1, this.quality === 'light' ? 8 : 12, 7), color, p, s); }
  cylinder(kind, color, p, rt, rb, h, r = [0, 0, 0], sides = 12) {
    this.add(kind, new THREE.CylinderGeometry(rt, rb, h, sides), color, p, [1, 1, 1], r);
  }
  ring(kind, color, p, radius, tube, r = [Math.PI / 2, 0, 0], segments = 48) {
    this.add(kind, new THREE.TorusGeometry(radius, tube, 5, segments), color, p, [1, 1, 1], r);
  }
  beam(kind, color, a, z, width, depth = width) {
    const av = V(a), bv = V(z), length = av.distanceTo(bv);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.clone().sub(av).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    this.box(kind, color, av.add(bv).multiplyScalar(0.5).toArray(), [width, length, depth], [e.x, e.y, e.z]);
  }
  curve(kind, color, points, radius, steps = 12, sides = 4) {
    const path = new THREE.CatmullRomCurve3(points.map(V));
    this.add(kind, new THREE.TubeGeometry(path, steps, radius, sides, false), color);
  }
  finish(name, castShadow = true) {
    const group = new THREE.Group(); group.name = name;
    for (const [kind, parts] of Object.entries(this.parts)) {
      const counts = parts.map(p => p.attributes.position.count);
      const count = counts.reduce((a, b) => a + b, 0);
      const combined = new THREE.BufferGeometry();
      for (const key of ['position', 'normal', 'color']) {
        const data = new Float32Array(count * 3); let at = 0;
        for (const part of parts) { data.set(part.attributes[key].array, at); at += part.attributes[key].array.length; }
        combined.setAttribute(key, new THREE.BufferAttribute(data, 3));
      }
      combined.computeBoundingBox(); combined.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...finishes[kind] });
      const mesh = new THREE.Mesh(combined, material); mesh.name = `${name}-${kind}`;
      mesh.castShadow = castShadow && kind !== 'glow'; mesh.receiveShadow = kind !== 'glow';
      group.add(mesh); parts.forEach(p => p.dispose());
    }
    this.parts = {};
    return group;
  }
}

export function assertOptions({ scale = 1, quality = 'balanced' }) {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale must be finite and positive');
  if (!['balanced', 'light'].includes(quality)) throw new RangeError('quality must be balanced or light');
}

export function anchor(parent, name, position) {
  const point = new THREE.Object3D(); point.name = name; point.position.set(...position); parent.add(point); return point;
}

export function assetHandle(group, anchors, animate = () => {}) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  let triangles = 0, drawCalls = 0;
  const geometries = new Set(), materials = new Set();
  group.traverse(o => {
    if (!o.isMesh) return;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    drawCalls++; geometries.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  });
  let disposed = false;
  const textures = new Set();
  materials.forEach(m => { if (m.map) textures.add(m.map); });
  return {
    group, anchors, bounds,
    stats: Object.freeze({ triangles, drawCalls, materials: materials.size, textures: textures.size, dimensions: bounds.getSize(new THREE.Vector3()).toArray() }),
    update(seconds) {
      if (!Number.isFinite(seconds)) throw new RangeError('seconds must be finite');
      if (!disposed) animate(seconds);
    },
    setLanternIntensity(value) {
      if (!Number.isFinite(value) || value < 0 || value > 8) throw new RangeError('intensity must be between 0 and 8');
      materials.forEach(m => { if (m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = value; });
    },
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      // Texture inputs are caller-owned, so they can be shared across assets.
    },
  };
}

/** Coordinates are flat XY, raised towards +Z; optional projector hugs the envelope. */
export function relief(b, kind, color, shape, position, scale = 1, rotation = [0, 0, 0], project) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.028, bevelEnabled: false, curveSegments: b.quality === 'light' ? 5 : 10 });
  if (project) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const mapped = project(p.getX(i) * scale, p.getY(i) * scale, p.getZ(i)); p.setXYZ(i, ...mapped);
    }
    g.computeVertexNormals();
    b.add(kind, g, color);
  } else b.add(kind, g, color, position, [scale, scale, scale], rotation);
}

export function cloudShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.85, -0.14); s.bezierCurveTo(-1.1, -0.1, -1.05, 0.22, -0.78, 0.21);
  s.bezierCurveTo(-0.82, 0.65, -0.26, 0.82, -0.04, 0.44);
  s.bezierCurveTo(0.18, 0.57, 0.4, 0.41, 0.38, 0.23);
  s.bezierCurveTo(0.83, 0.36, 1.08, -0.05, 0.78, -0.14);
  s.lineTo(-0.85, -0.14); return s;
}

export function pagoda(b, color, center, size, project) {
  // Stacked swept eaves, pillars and finial form a recognisable pagoda silhouette.
  const shapes = [];
  for (let i = 0; i < 3; i++) {
    const w = 0.72 - i * 0.17, y = -0.35 + i * 0.43;
    const s = new THREE.Shape();
    s.moveTo(-w, y + 0.03); s.quadraticCurveTo(-w * 0.4, y + 0.1, -w * 0.27, y + 0.31);
    s.lineTo(w * 0.27, y + 0.31); s.quadraticCurveTo(w * 0.4, y + 0.1, w, y + 0.03);
    s.quadraticCurveTo(w * 0.95, y - 0.12, w * 0.74, y - 0.12); s.lineTo(-w * 0.74, y - 0.12);
    s.quadraticCurveTo(-w * 0.95, y - 0.12, -w, y + 0.03); shapes.push(s);
    const rect = new THREE.Shape(); rect.moveTo(-w * 0.45, y - 0.22); rect.lineTo(w * 0.45, y - 0.22);
    rect.lineTo(w * 0.45, y + 0.05); rect.lineTo(-w * 0.45, y + 0.05); rect.closePath(); shapes.push(rect);
  }
  const stem = new THREE.Shape(); stem.moveTo(-0.035, 0.77); stem.lineTo(0.035, 0.77); stem.lineTo(0.035, 0.98); stem.lineTo(-0.035, 0.98); stem.closePath(); shapes.push(stem);
  for (const s of shapes) relief(b, 'wood', color, s, center, size, [0, 0, 0], project);
}

export function lantern(b, x, y, z, scale = 1) {
  b.at([x, y, z], [0, 0, 0], () => {
    const s = scale;
    b.box('glow', '#ffe7a3', [0, 0, 0], [0.36 * s, 0.49 * s, 0.36 * s]);
    for (const level of [-0.3, 0.3]) b.box('wood', '#88512b', [0, level * s, 0], [0.53 * s, 0.09 * s, 0.53 * s]);
    b.cylinder('wood', '#784729', [0, 0.39 * s, 0], 0.09 * s, 0.29 * s, 0.13 * s, [0, Math.PI / 4, 0], 4);
    for (const a of [-1, 1]) for (const c of [-1, 1]) b.box('gold', '#b8863d', [a * 0.19 * s, 0, c * 0.19 * s], [0.045 * s, 0.54 * s, 0.045 * s]);
    for (const front of [-1, 1]) {
      b.box('gold', '#bf8d40', [0, 0.05 * s, front * 0.19 * s], [0.035 * s, 0.36 * s, 0.025 * s]);
      b.box('gold', '#bf8d40', [0, -0.12 * s, front * 0.19 * s], [0.34 * s, 0.03 * s, 0.025 * s]);
    }
    b.ring('gold', '#a47738', [0, 0.51 * s, 0], 0.07 * s, 0.024 * s, [0, 0, 0], 12);
    b.ball('wood', '#81502e', [0, -0.39 * s, 0], [0.06 * s, 0.07 * s, 0.06 * s]);
  });
}

export function rope(b, points, radius = 0.055, twisted = true) {
  const steps = b.quality === 'light' ? 12 : 22;
  b.curve('wood', '#d7b477', points, radius, steps, 5);
  if (!twisted) return;
  const curve = new THREE.CatmullRomCurve3(points.map(V));
  const frames = curve.computeFrenetFrames(steps * 3, false);
  const winding = [];
  for (let i = 0; i <= steps * 3; i++) {
    const t = i / (steps * 3), a = t * curve.getLength() * 23;
    const p = curve.getPointAt(t).addScaledVector(frames.normals[i], Math.cos(a) * radius * 0.9)
      .addScaledVector(frames.binormals[i], Math.sin(a) * radius * 0.9);
    winding.push(p.toArray());
  }
  b.curve('wood', '#b7884b', winding, radius * 0.18, steps * 3, 3);
}

export function balloonIcon(b, center, size = 1, color = '#f4dfad') {
  b.at(center, [0, 0, 0], () => {
    for (const factor of [1, 0.48, -0.48]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; pts.push([Math.sin(a) * 0.34 * factor * size, Math.cos(a) * 0.4 * size + 0.2 * size, 0]); }
      b.curve('cloth', color, pts, 0.018 * size, 24, 3);
    }
    for (const sign of [-1, 1]) b.beam('cloth', color, [sign * 0.18 * size, -0.12 * size, 0], [sign * 0.1 * size, -0.36 * size, 0], 0.025 * size);
    b.box('cloth', color, [0, -0.39 * size, 0], [0.24 * size, 0.035 * size, 0.025 * size]);
    b.box('cloth', color, [0, -0.49 * size, 0], [0.22 * size, 0.035 * size, 0.025 * size]);
    for (const sign of [-1, 1]) b.box('cloth', color, [sign * 0.1 * size, -0.44 * size, 0], [0.025 * size, 0.12 * size, 0.025 * size]);
  });
}
