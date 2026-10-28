import { BufferGeometry, Float32BufferAttribute } from 'three';
import { PropBuilder, type XYZ } from './propGeometry';
import { createFishCartShape } from './fishCartShape';

/** A domed crust / recessed iron die sharing the exact gameplay outline. One reusable batch. */
export function createSculptedFish(scale = 1, mould = false) {
  const b = new PropBuilder([12, 8]);
  const outline = createFishCartShape().getSpacedPoints(40).slice(0, -1);
  const n = outline.length, rings = 5, positions: number[] = [], indices: number[] = [];
  const height = mould ? -.022 : .061;
  for (let row = 0; row <= rings; row++) {
    const r = Math.max(.001, row / rings);
    for (const p of outline) positions.push((.015 + (p.x - .015) * r) * scale,
      (.006 + height * Math.sqrt(1 - r * r)) * scale, -p.y * r * scale);
  }
  const triangle = (a: number, c: number, d: number) => {
    const crossY = (positions[c * 3 + 2]! - positions[a * 3 + 2]!) * (positions[d * 3]! - positions[a * 3]!)
      - (positions[c * 3]! - positions[a * 3]!) * (positions[d * 3 + 2]! - positions[a * 3 + 2]!);
    indices.push(a, crossY > 0 ? c : d, crossY > 0 ? d : c);
  };
  for (let row = 0; row < rings; row++) for (let j = 0; j < n; j++) {
    const a = row * n + j, c = row * n + (j + 1) % n;
    triangle(a, c, a + n); triangle(c, c + n, a + n);
  }
  const surface = new BufferGeometry(); surface.setAttribute('position', new Float32BufferAttribute(positions, 3));
  surface.setIndex(indices); surface.computeVertexNormals();
  if (!mould) {
    const underside = surface.clone(); underside.scale(1, -.38, 1);
    // Reflecting the surface reverses its winding; the underside must face out during a flip.
    const index = underside.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i); index.setX(i, index.getX(i + 1)); index.setX(i + 1, a);
    }
    underside.computeVertexNormals(); b.add('stone', underside, '#dfc59d');
  }
  b.add('stone', surface, mould ? '#333839' : '#ffffff');
  const ink = mould ? '#626969' : '#c39b69';
  const at = (x: number, z: number, lift = .002): XYZ => [x * scale,
    (.006 + height * Math.sqrt(Math.max(.05, 1 - ((x - .015) / .19) ** 2 - (z / .082) ** 2)) + lift) * scale, z * scale];
  b.curve('stone', ink, [...outline, outline[0]!].map(p => [p.x * scale, .007 * scale, -p.y * scale]), .0025 * scale, 48);
  // Raised eye, gill, overlapping scale arcs and tail rays are geometry, not a flat decal.
  b.ball('stone', ink, at(.123, -.025, .004), [.012 * scale, .004 * scale, .012 * scale]);
  b.ball('stone', mould ? '#262b2c' : '#79512c', at(.123, -.025, .008), [.005 * scale, .003 * scale, .005 * scale]);
  b.curve('stone', ink, [at(.081, -.053), at(.063, 0), at(.081, .053)], .003 * scale, 12);
  for (const x of [-.075, -.035, .005, .045]) for (const z of [-.027, .018]) {
    b.curve('stone', ink, [at(x - .013, z - .018), at(x + .003, z), at(x - .013, z + .018)], .0024 * scale, 6);
  }
  for (const z of [-.045, 0, .045]) b.curve('stone', ink,
    [at(-.184, z, .003), at(-.15, z * .4, .003), at(-.12, z * .2, .003)], .0025 * scale, 6);
  return b.finish().stone!;
}
