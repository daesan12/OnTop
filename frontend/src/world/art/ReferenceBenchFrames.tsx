import { BENCHES, BENCH_PAVILIONS, BENCH_YAWS } from '../../config'
import { PropBuilder } from './propGeometry'
import { Instances, type Part } from './Instances'
import { PropModel } from './PropModel'
import { SIMPLE_MAP } from './mapRenderProfile'
import { createConnectedBenchFrame } from './connectedBenchFrame'
function frame(back: boolean) {
  const b = new PropBuilder([12, 8], `bench-frame-${back}`),
    c = '#283333'
  for (const x of [-1.17, 1.17]) {
    for (const side of [-1, 1])
      b.curve(
        'metal',
        c,
        [
          [x, 0.035, side * 0.39],
          [x, 0.12, side * 0.29],
          [x, 0.34, side * 0.22],
          [x, 0.51, side * 0.28],
        ],
        0.05,
        12,
      )
    b.curve(
      'metal',
      c,
      [
        [x, 0.46, -0.32],
        [x, 0.48, 0],
        [x, 0.46, 0.34],
      ],
      0.055,
      10,
    )
    for (const side of [-1, 1])
      b.box('metal', c, [x, 0.035, side * 0.39], [0.23, 0.06, 0.19])
    if (back) {
      b.curve(
        'metal',
        c,
        [
          [x, 0.48, -0.28],
          [x, 0.78, -0.35],
          [x, 1.12, -0.42],
          [x, 1.32, -0.41],
        ],
        0.045,
      )
      b.curve(
        'metal',
        c,
        [
          [x, 1.12, -0.4],
          [x, 0.92, -0.31],
          [x, 0.81, -0.13],
          [x, 0.79, 0.28],
          [x, 0.73, 0.38],
          [x, 0.65, 0.3],
          [x, 0.69, 0.21],
          [x, 0.74, 0.24],
        ],
        0.035,
        28,
      )
      b.curve(
        'metal',
        c,
        [
          [x, 0.52, 0.29],
          [x, 0.62, 0.3],
          [x, 0.73, 0.38],
        ],
        0.037,
      )
    }
  }
  b.curve(
    'metal',
    c,
    [
      [-1.17, 0.3, -0.18],
      [0, 0.28, -0.18],
      [1.17, 0.3, -0.18],
    ],
    0.035,
    3,
  )
  return b.finish().metal!
}
const full = SIMPLE_MAP?createConnectedBenchFrame(true):frame(true),
  backless = SIMPLE_MAP?createConnectedBenchFrame(false):frame(false)
const parts = (noBack: boolean): Part[] =>
  BENCHES.flatMap((p, i) =>
    !BENCH_PAVILIONS[i] && [6, 7].includes(i) === noBack
      ? [{ p: [...p], s: [1, 1, 1], r: [0, BENCH_YAWS[i], 0], c: '#ffffff' }]
      : [],
  )
const regular = parts(false),
  simple = parts(true)

const benchWood=new PropBuilder()
for(let j=0;j<5;j++)benchWood.box('wood',j%2?'#9e6c3e':'#b7834f',[0,.53,-.34+j*.17],[2.8,.1,.13])
for(let j=0;j<3;j++)benchWood.box('wood',j%2?'#b17b48':'#9d683d',[0,.86+j*.17,-.36],[2.8,.12,.075],[-.12,0,0])
for(const side of [-1,1])for(let j=0;j<5;j++)benchWood.cylinder('metal','#8e8e79',[side*1.04,.583,-.34+j*.17],.015,.015,.004,[0,0,0],6)
const singleBenchWood=benchWood.finish()

/** The original cast-iron frame and slats, for a separately placed existing bench. */
export function ReferenceBench({name,position,yaw,horizontalScale=1,seatHeight=.58}:{name:string;position:[number,number,number];yaw:number;horizontalScale?:number;seatHeight?:number}) {
  return <group name={name} position={position} rotation={[0,yaw,0]} scale={[horizontalScale,seatHeight/.58,horizontalScale]}>
    <mesh geometry={full} dispose={null} castShadow><meshStandardMaterial vertexColors metalness={.55} roughness={.63}/></mesh>
    <PropModel art={singleBenchWood} name="original-reference-bench-slats"/>
  </group>
}
export function ReferenceBenchFrames() {
  return (
    <group name="reference-cast-iron-benches">
      {[
        { geometry: full, parts: regular },
        { geometry: backless, parts: simple },
      ].map((v, i) => (
        <Instances
          key={i}
          parts={v.parts}
          material={
            <meshStandardMaterial
              vertexColors
              metalness={0.55}
              roughness={0.63}
            />
          }
        >
          <primitive object={v.geometry} attach="geometry" dispose={null} />
        </Instances>
      ))}
    </group>
  )
}
