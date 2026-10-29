import { Color, CylinderGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PropBuilder, type XYZ } from '../../world/art/propGeometry';

export const CUSTOMER_STYLES = ['warm', 'natural', 'round'] as const;
export type CustomerStyle = typeof CUSTOMER_STYLES[number];
const profiles = {
  warm: { x: .147, y: .174, z: .13, cy: 1.49, eye: .026, shoulder: .207, smile: .030 },
  natural: { x: .111, y: .143, z: .106, cy: 1.52, eye: .018, shoulder: .225, smile: .024 },
  round: { x: .178, y: .193, z: .156, cy: 1.46, eye: .032, shoulder: .193, smile: .038 },
} as const;

/** Three real, vertex-coloured mesh studies. The chosen style is not wired into gameplay yet. */
export function customerVariantGeometry(style: CustomerStyle, index: number) {
  const p = profiles[style], b = new PropBuilder([24, 16]);
  const skin = ['#eac2a1', '#ca9b79', '#e2ba94'][index % 3]!;
  const hair = ['#493023', '#292520', '#82766a'][index % 3]!;
  const coat = ['#668276', '#a27650', '#54677a'][index % 3]!;
  const shade = (color: string, mix: string, amount: number) => `#${new Color(color).lerp(new Color(mix), amount).getHexString()}`;
  const box = (color: string, at: XYZ, size: XYZ, radius = .02, rotate: XYZ = [0, 0, 0]) =>
    b.add('stone', new RoundedBoxGeometry(...size, 3, radius), color, at, [1, 1, 1], rotate);
  const bone = (color: string, from: XYZ, to: XYZ, top: number, bottom: number) => {
    const a = new Vector3(...from), c = new Vector3(...to), delta = c.clone().sub(a);
    const g = new CylinderGeometry(top, bottom, delta.length(), 16);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
    const mid = a.add(c).multiplyScalar(.5); g.translate(mid.x, mid.y, mid.z); b.add('stone', g, color);
  };
  const front = (x: number, y: number) => p.z * Math.sqrt(Math.max(.05, 1 - (x / p.x) ** 2 - ((y - p.cy) / p.y) ** 2));

  // Soft tailoring, articulated sleeves, cuffs, pockets and shoes instead of block-shaped limbs.
  const width = p.shoulder * 1.67, torso = style === 'round' ? .42 : .48;
  box(coat, [0, 1.04, 0], [width, torso, .27], .065);
  box('#eadbc3', [0, 1.13, .131], [.115, .27, .018], .008);
  bone(skin, [0, 1.23, 0], [0, p.cy - p.y + .035, 0], .054, .061);
  for (const sign of [-1, 1]) {
    const shoulder: XYZ = [sign * p.shoulder, 1.19, 0];
    const elbow: XYZ = [sign * (p.shoulder + .022), .98, .026];
    const wrist: XYZ = [sign * (p.shoulder + .003), .835, .09];
    b.ball('stone', coat, shoulder, [.072, .077, .079]);
    bone(coat, shoulder, elbow, .068, .059); b.ball('stone', coat, elbow, [.061, .067, .065]);
    bone(coat, elbow, wrist, .061, .048);
    b.ball('stone', shade(coat, '#25302c', .22), wrist, [.050, .029, .050]);
    b.ball('stone', skin, [wrist[0], .785, .104], [.047, .061, .037]);
    b.ball('stone', skin, [wrist[0] - sign * .034, .795, .125], [.017, .034, .018]);
    for (let f = 0; f < 3; f++) b.curve('stone', shade(skin, '#804b33', .23),
      [[wrist[0] - .02 + f * .015, .765, .135], [wrist[0] - .02 + f * .015, .748, .129]], .0018, 3);
    box('#42505b', [sign * .09, .46, -.005], [.142, .69, .155], .035);
    b.curve('stone', '#63717a', [[sign * .15, .75, .066], [sign * .15, .43, .074], [sign * .15, .15, .072]], .002, 6);
    box('#433c34', [sign * .093, .077, .054], [.158, .12, .265], .04);
    box('#d5c4a9', [sign * .093, .029, .06], [.16, .025, .27], .01);
    for (const z of [.075, .105, .135]) b.curve('stone', '#cfbfa4',
      [[sign * .093 - .038, .135, z], [sign * .093 + .038, .135, z + .012]], .003, 4);
    box(shade(coat, '#23352e', .17), [sign * .11, 1.25, .103], [.10, .13, .036], .015, [0, 0, sign * .20]);
    box(shade(coat, '#fff0cb', .10), [sign * .112, .98, .14], [.09, .07, .022], .012);
    b.curve('stone', shade(coat, '#e4d6ba', .27), [[sign * .15, 1.01, .155], [sign * .073, 1.01, .155]], .0018, 5);
  }
  for (const y of [.92, 1.02, 1.12]) {
    b.ball('stone', '#b59a6e', [.012, y, .153], [.008, .008, .004]);
    b.ball('stone', '#695740', [.012, y, .157], [.002, .002, .001]);
  }
  if (index === 0) {
    b.curve('stone', '#cead7b', [[-.078, 1.30, .067], [0, 1.265, .146], [.079, 1.30, .067]], .027, 18);
    box('#b78f61', [.04, 1.17, .165], [.058, .17, .020], .012, [0, 0, -.08]);
    for (const y of [1.105, 1.115, 1.125]) b.box('stone', '#e1c89e', [.04, y, .178], [.053, .0025, .003]);
  }

  // Tapered jaw and shaded cheeks; all features remain geometry from every angle.
  const head = new SphereGeometry(1, 32, 24), positions = head.getAttribute('position');
  const colours: number[] = [], baseSkin = new Color(skin), blush = new Color('#cf7e6b'), tint = new Color();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i), jaw = y < -.15 ? 1 - Math.min(.24, (-y - .15) * .30) : 1;
    positions.setX(i, positions.getX(i) * jaw);
    const x = positions.getX(i), z = positions.getZ(i);
    const rosy = z > 0 ? Math.exp(-((Math.abs(x) - .58) ** 2 / .09 + (y + .13) ** 2 / .045)) * (style === 'natural' ? .08 : .17) : 0;
    tint.copy(baseSkin).lerp(blush, rosy); colours.push(tint.r, tint.g, tint.b);
  }
  head.setAttribute('color', new Float32BufferAttribute(colours, 3));
  head.computeVertexNormals(); b.add('stone', head, '#ffffff', [0, p.cy, 0], [p.x, p.y, p.z], [0, 0, 0], false, true);
  for (const sign of [-1, 1]) {
    b.ball('stone', skin, [sign * p.x, p.cy - .006, -.009], [.025, .042, .022]);
    b.ball('stone', shade(skin, '#a96750', .30), [sign * (p.x + .012), p.cy - .007, .001], [.009, .024, .012]);
    const ex = sign * p.x * .385, ey = p.cy + .021, ez = front(ex, ey);
    const ew = p.eye, eh = ew * (style === 'natural' ? .58 : .75);
    b.ball('stone', '#f1e9d8', [ex, ey, ez + .003], [ew, eh, .010]);
    b.ball('stone', index === 0 ? '#67452e' : '#493d31', [ex - sign * .002, ey - .003, ez + .012], [ew * .58, eh * .85, .006]);
    b.ball('stone', '#27241f', [ex - sign * .002, ey - .004, ez + .017], [ew * .28, eh * .60, .003]);
    b.ball('stone', '#fff7e6', [ex - .004, ey + .003, ez + .020], [.0034, .0034, .002]);
    b.curve('stone', hair, [[ex - ew, ey + .002, ez + .005], [ex, ey + eh, ez + .010], [ex + ew, ey + .002, ez + .005]], style === 'natural' ? .0016 : .0025, 10);
    b.curve('stone', hair, [[ex - ew * .9, ey + eh + .018, ez - .008], [ex, ey + eh + .023, ez - .003], [ex + ew * .9, ey + eh + .015, ez - .007]], .0035, 10);
  }
  b.ball('stone', skin, [0, p.cy + .002, p.z - .004], [.010, .025, .014]);
  b.ball('stone', shade(skin, '#a96c4b', .08), [0, p.cy - .020, p.z + .009], [.017, .015, .015]);
  for (const sign of [-1, 1]) b.ball('stone', shade(skin, '#8a4e37', .38), [sign * .010, p.cy - .029, p.z + .013], [.003, .002, .003]);
  const my = p.cy - .066, mz = front(0, my) + .005, mw = p.smile;
  b.curve('stone', '#884d3c', [[-mw, my + .005, mz - .003], [0, my - .005, mz + .004], [mw, my + .005, mz - .003]], .003, 16);
  b.curve('stone', shade(skin, '#bc7564', .25), [[-mw * .75, my - .005, mz], [0, my - .012, mz + .002], [mw * .75, my - .005, mz]], .0028, 12);

  // Continuous crown with a higher forehead opening, rather than a row of ball-shaped bangs.
  const cap = (color: string, inflate = 1, lift = .005) => {
    const g = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * .95), a = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < a.count; i++) {
      const phi = uv.getX(i) * Math.PI * 2;
      const theta = (1 - uv.getY(i)) * (index === 0 ? 2.4 - Math.max(0, Math.sin(phi)) * 1.35 : 1.92 - Math.max(0, Math.sin(phi)) * .87);
      a.setXYZ(i, -Math.cos(phi) * Math.sin(theta) * p.x * inflate,
        p.cy + Math.cos(theta) * p.y * inflate + lift, Math.sin(phi) * Math.sin(theta) * p.z * inflate - .008);
    }
    g.computeVertexNormals(); b.add('stone', g, color);
  };
  cap(hair, index === 0 ? 1.10 : 1.035);
  if (index !== 2) for (let j = 0; j < 5; j++) {
    const x = -p.x * .5 + j * p.x * .18;
    const along = (dx: number, z: number): XYZ => [dx,
      p.cy + Math.sqrt(Math.max(.03, 1 - (dx / (p.x * 1.035)) ** 2 - ((z + .008) / (p.z * 1.035)) ** 2)) * p.y * 1.035 + .006, z];
    b.curve('stone', shade(hair, '#b38658', .08 + j * .012),
      [along(x - .018, .015), along(x, p.z * .52), along(x + .012, p.z * .78)], .0013, 18);
  }
  if (index === 1) {
    const eyeY = p.cy + .022, radius = p.eye * 1.25;
    for (const sign of [-1, 1]) {
      const x = sign * p.x * .385, z = front(x, eyeY) + .027;
      b.add('stone', new TorusGeometry(radius, .0028, 7, 28), '#63513d', [x, eyeY, z], [1.13, 1, 1]);
      b.curve('stone', '#63513d', [[x + sign * radius, eyeY, z], [sign * p.x, eyeY + .002, .065], [sign * p.x, eyeY - .012, -.005]], .0028, 10);
    }
    b.curve('stone', '#63513d', [[-.018, eyeY + .003, p.z + .022], [0, eyeY + .008, p.z + .025], [.018, eyeY + .003, p.z + .022]], .0025, 8);
  }
  if (index === 2) {
    b.add('stone', new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), '#aa7751',
      [0, p.cy + .10, 0], [p.x * 1.09, p.y * .63, p.z * 1.09]);
    b.add('stone', new CylinderGeometry(1, 1, 1, 48), '#966843', [0, p.cy + .10, 0], [p.x * 1.10, .041, p.z * 1.10]);
    for (let j = 0; j < 22; j++) {
      const angle = j / 22 * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
      b.curve('stone', j % 2 ? '#bf8c61' : '#916444',
        Array.from({ length: 8 }, (_, i): XYZ => {
          const theta = .15 + i / 7 * (Math.PI / 2 - .15);
          return [x * Math.sin(theta) * p.x * 1.10, p.cy + .10 + Math.cos(theta) * p.y * .64, z * Math.sin(theta) * p.z * 1.10];
        }), .0013, 18);
      b.curve('stone', '#b9885f', [[x * p.x * 1.11, p.cy + .082, z * p.z * 1.11], [x * p.x * 1.11, p.cy + .118, z * p.z * 1.11]], .0014, 3);
    }
    for (const sign of [-1, 1]) {
      b.curve('stone', shade(skin, '#aa7959', .26), [[sign * .066, p.cy - .002, p.z * .91], [sign * .083, p.cy - .013, p.z * .80]], .0018, 6);
      b.ball('stone', '#97887b', [sign * p.x * .92, p.cy + .006, .002], [.018, .048, .020]);
    }
  }
  const result = b.finish().stone!;
  result.name = `bungeoppang-customer-${style}-${index}`;
  return result;
}
