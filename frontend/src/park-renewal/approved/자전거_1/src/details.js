import { THREE, TAU } from './primitives.js';

export function softBox(b, finish, color, position, size, radius = 0.025, rotation = [0, 0, 0]) {
  const [w, h, d] = size, x = w / 2, z = d / 2, r = Math.min(radius, w / 4, d / 4);
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -z); shape.lineTo(x - r, -z); shape.quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r); shape.quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z); shape.quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r); shape.quadraticCurveTo(-x, -z, -x + r, -z);
  const bevel = Math.min(h * 0.12, r * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {depth:h - bevel * 2, steps:1, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:1, curveSegments:b.quality === 'light' ? 1 : 2});
  geo.rotateX(-Math.PI / 2); geo.translate(0, -h / 2 + bevel, 0);
  b.add(finish, geo, color, position, [1,1,1], rotation);
}

/** Static wheel; axle lies on X, vehicle points towards +Z. */
export function wheel(b, z, radius, width, spokes = true) {
  const centerY = radius, major = radius * 0.85, tube = radius - major;
  const segments = b.quality === 'light' ? 20 : 32;
  const tire = new THREE.TorusGeometry(major, tube, b.quality === 'light' ? 6 : 8, segments);
  tire.scale(1,1,width / (tube * 2));
  b.add('rubber', tire, '#343634', [0,centerY,z], [1,1,1], [0,Math.PI / 2,0]);
  if (spokes) {
    b.ring('metal','#b0b0a0',[0,centerY,z],radius * 0.73,0.013,[0,Math.PI / 2,0],segments);
    const count = b.quality === 'light' ? 8 : 12;
    for(let i=0;i<count;i++) {
      const a = i / count * TAU;
      b.beam('metal','#a9aaa0',[0,centerY,z],[0,centerY + Math.sin(a) * radius * 0.72,z + Math.cos(a) * radius * 0.72],0.008);
    }
  } else b.cylinder('metal','#62645d',[0,centerY,z],radius * 0.75,radius * 0.75,width * 0.87,[0,0,Math.PI / 2],segments);
  b.cylinder('metal','#9d9c8a',[0,centerY,z],radius * 0.15,radius * 0.15,width * 1.28,[0,0,Math.PI / 2],12);
}

export function fender(b, z, radius, color, width) {
  const geo = new THREE.TorusGeometry(radius * 1.025, radius * 0.07, 5, b.quality === 'light' ? 12 : 24, Math.PI);
  geo.scale(1,1,width / (radius * 0.14)); geo.rotateY(Math.PI / 2);
  b.add('paint',geo,color,[0,radius,z]);
  // Seal the two exposed ends of the half-torus mudguard.
  for (const side of [-1, 1]) {
    const cap = new THREE.CircleGeometry(radius * .07, 5);
    cap.scale(width / (radius * .14), 1, 1);
    cap.rotateX(-side * Math.PI / 2);
    b.add('paint', cap, color, [0, radius, z + side * radius * 1.025]);
  }
}

export function bicycleIcon(b, center, size = 1, color = '#f2dfb4', rotation = [0,0,0]) {
  b.at(center,rotation,()=>{
    for(const x of [-0.29,0.29]) b.ring('paint',color,[x * size,-0.08 * size,0],0.16 * size,0.018 * size,[0,0,0],20);
    const p = (x,y)=>[x * size,y * size,0];
    for(const [a,c] of [[[-0.29,-0.08],[-0.12,0.2]],[[-0.12,0.2],[0.1,-0.08]],[[0.1,-0.08],[-0.29,-0.08]],[[-0.12,0.2],[0.19,0.2]],[[0.19,0.2],[0.1,-0.08]],[[0.19,0.2],[0.29,-0.08]],[[0.19,0.2],[0.15,0.34]]]) b.beam('paint',color,p(...a),p(...c),0.02 * size);
    b.box('paint',color,p(-0.12,0.23),[0.15 * size,0.025 * size,0.025 * size]);
    b.box('paint',color,p(0.11,0.35),[0.12 * size,0.025 * size,0.025 * size]);
  });
}

export function scooterIcon(b, center, size = 1, color = '#f2dfb4', rotation = [0,0,0]) {
  b.at(center,rotation,()=>{
    for(const x of [-0.28,0.28]) b.ring('paint',color,[x * size,-0.12 * size,0],0.085 * size,0.018 * size,[0,0,0],16);
    b.beam('paint',color,[-0.28 * size,-0.12 * size,0],[0.2 * size,-0.12 * size,0],0.025 * size);
    b.beam('paint',color,[-0.28 * size,-0.12 * size,0],[-0.16 * size,0.43 * size,0],0.025 * size);
    b.box('paint',color,[-0.16 * size,0.43 * size,0],[0.18 * size,0.028 * size,0.025 * size]);
  });
}
