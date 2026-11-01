import { memo, useLayoutEffect, useRef } from "react";
import {
  LatheGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
  type Group,
} from "three";
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Instances, type Part } from "../../world/art/Instances";
import { BoardWood, OmokWood } from "./BoardWood";
import { OMOK_BOARD_ART_SPAN as span, OMOK_SUPPLY_OFFSET, OMOK_SUPPLY_SCALE } from './boardLayout';

// Shared by the four table settings, placed stones, previews and decorative supplies.
const frameGeometry = new RoundedBoxGeometry(1, 1, 1, 1, .025);
export const stoneGeometry = new SphereGeometry(0.039, 32, 20);
export const blackStoneMaterial = new MeshStandardMaterial({
  color: "#101717",
  roughness: .34,
});
export const whiteStoneMaterial = new MeshStandardMaterial({
  color: "#f3eee2",
  roughness: .38,
});

const body: Part[] = [
  { p: [0, -0.046, 0], s: [span - .02, 0.104, span - .02], c: "#73452d" },
  { p: [0, -0.092, 0], s: [span, 0.016, span], c: "#47291c" },
  { p: [0, -0.012, 0], s: [span - .012, 0.008, span - .012], c: "#a06a43" },
];
const inlay: Part[] = [];
for (const sign of [-1, 1]) {
  // Keep every bevel and trim outside the edge stone's radius: .65 + .039.
  body.push(
    { p: [sign * (span / 2 - .029), 0.019, 0], s: [0.038, 0.03, span - .02], c: "#59341f" },
    { p: [0, 0.019, sign * (span / 2 - .029)], s: [span - .096, 0.03, 0.038], c: "#684128" },
  );
  inlay.push(
    { p: [sign * (span / 2 - .041), 0.0345, 0], s: [0.0018, 0.001, span - .082], c: "#ae875a" },
    { p: [0, 0.0345, sign * (span / 2 - .041)], s: [span - .082, 0.001, 0.0018], c: "#ae875a" },
  );
}

function lathe(points: [number, number][]) {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    32,
  );
}
// A closed shell with a real interior, rather than a solid hemisphere.
const bowlGeometry = lathe([
  [0, 0],
  [0.072, 0],
  [0.095, 0.014],
  [0.123, 0.045],
  [0.134, 0.08],
  [0.13, 0.117],
  [0.122, 0.134],
  [0.113, 0.134],
  [0.109, 0.119],
  [0.116, 0.085],
  [0.105, 0.055],
  [0.078, 0.036],
  [0, 0.031],
]);
const lidGeometry = lathe([
  [0, 0],
  [0.111, 0],
  [0.129, 0.009],
  [0.132, 0.015],
  [0.126, 0.022],
  [0.106, 0.016],
  [0, 0.011],
]);
const bowls: Part[] = [],
  lids: Part[] = [];
const supplies: Part[][] = [[], []];
for (const [index, sign] of ([-1, 1] as const).entries()) {
  const x = sign * OMOK_SUPPLY_OFFSET,
    z = -sign * 0.26;
  bowls.push({ p: [x, -0.03, z], s: [OMOK_SUPPLY_SCALE, OMOK_SUPPLY_SCALE, OMOK_SUPPLY_SCALE], c: "#73472e" });
  lids.push({ p: [x, -0.029, -sign * 0.59], s: [OMOK_SUPPLY_SCALE, OMOK_SUPPLY_SCALE, OMOK_SUPPLY_SCALE], c: "#845335" });
  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count + layer * 0.37;
      const radius = (layer === 0 ? 0.054 : 0.071) * OMOK_SUPPLY_SCALE;
      supplies[index]!.push({
        p: [
          x + Math.cos(angle) * radius,
          -0.03 + (0.058 + layer * 0.027) * OMOK_SUPPLY_SCALE,
          z + Math.sin(angle) * radius,
        ],
        s: [0.84 * OMOK_SUPPLY_SCALE, 0.36 * OMOK_SUPPLY_SCALE, 0.84 * OMOK_SUPPLY_SCALE],
        r: [Math.sin(angle) * 0.23, angle, Math.cos(angle) * 0.18],
        c: "#ffffff",
      });
    }
    supplies[index]!.push({
      p: [x, -0.03 + (0.061 + layer * 0.027) * OMOK_SUPPLY_SCALE, z],
      s: [0.84 * OMOK_SUPPLY_SCALE, 0.36 * OMOK_SUPPLY_SCALE, 0.84 * OMOK_SUPPLY_SCALE],
      r: [0.1, layer, -0.13],
      c: "#ffffff",
    });
  }
}

/** Original prototype art, adapted to the current tabletop. Keep the grid at local Y=0.
 * Static parts stay instanced; the prototype's rounded frame and polished stones share geometry.
 * The lower base is shallower to clear the current pavilion felt without moving seat/camera anchors. */
export const GomokuAssets = memo(function GomokuAssets({ blackAtSouth = true, reverseSupplies = false }: {
  blackAtSouth?: boolean; reverseSupplies?: boolean
}) {
  const root = useRef<Group>(null);
  useLayoutEffect(() => {
    root.current!.traverse(object => {
      object.raycast = () => {};
    });
    // R3F owns these instance buffers. Primitive geometries/materials below stay cached.
  }, []);
  return (
    <group ref={root} name="walnut-gomoku-assets" position={[0, -0.014, 0]}>
      <Instances
        parts={body}
        material={<OmokWood detail={0.42} strength={0.1} />}
      >
        <primitive object={frameGeometry} attach="geometry" dispose={null} />
      </Instances>
      <mesh
        name="gomoku-playing-surface"
        position={[0, 0.011, 0]}
      >
        <boxGeometry
          args={[
            span - 0.08,
            0.006,
            span - 0.08,
          ]}
        />
        <BoardWood />
      </mesh>
      <Instances
        parts={inlay}
        shadow={false}
        material={<meshStandardMaterial roughness={.58} />}
      >
        <boxGeometry />
      </Instances>
      {/* 탑뷰 판 방향과 별개로 돌통은 실제 좌석 쪽에 유지한다. */}
      <group rotation={[0, reverseSupplies ? Math.PI : 0, 0]}>
      <group name="omok-stone-bowls"><Instances
        parts={bowls}
        material={<OmokWood detail={0.45} strength={0.08} />}
      >
        <primitive object={bowlGeometry} attach="geometry" dispose={null} />
      </Instances></group>
      <group name="omok-stone-lids"><Instances
        parts={lids}
        material={<OmokWood detail={0.45} strength={0.08} />}
      >
        <primitive object={lidGeometry} attach="geometry" dispose={null} />
      </Instances></group>
      {supplies.map((parts, i) => (
        <group key={i} name={`omok-supply-${i ? 'north' : 'south'}`}><Instances
          parts={parts}
          material={
            <primitive
              object={(blackAtSouth ? i : 1 - i) ? whiteStoneMaterial : blackStoneMaterial}
              attach="material"
              dispose={null}
            />
          }
        >
          <primitive object={stoneGeometry} attach="geometry" dispose={null} />
        </Instances></group>
      ))}
      </group>
    </group>
  );
});
