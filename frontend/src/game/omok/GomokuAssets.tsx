import { memo, useLayoutEffect, useRef } from "react";
import {
  LatheGeometry,
  MeshLambertMaterial,
  SphereGeometry,
  Vector2,
  type Group,
} from "three";
import { GOMOKU } from "../../config";
import { BeveledBox } from "../../world/art/BeveledBox";
import { Instances, type Part } from "../../world/art/Instances";
import { SurfaceMaterial } from "../../world/art/SurfaceMaterial";
import { BoardWood } from "./BoardWood";

// Shared by the four table settings, placed stones, previews and decorative supplies.
export const stoneGeometry = new SphereGeometry(0.039, 12, 8);
export const blackStoneMaterial = new MeshLambertMaterial({
  color: "#101717",
});
export const whiteStoneMaterial = new MeshLambertMaterial({
  color: "#d6d1c6",
});

const body: Part[] = [
  { p: [0, -0.011, 0], s: [1.48, 0.046, 1.48], c: "#73452d" },
  { p: [0, -0.023, 0], s: [1.5, 0.014, 1.5], c: "#47291c" },
  { p: [0, -0.012, 0], s: [1.488, 0.008, 1.488], c: "#a06a43" },
];
const inlay: Part[] = [];
for (const sign of [-1, 1]) {
  // Keep every bevel and trim outside the edge stone's radius: .65 + .039.
  body.push(
    { p: [sign * 0.721, 0.019, 0], s: [0.038, 0.03, 1.48], c: "#59341f" },
    { p: [0, 0.019, sign * 0.721], s: [1.404, 0.03, 0.038], c: "#684128" },
  );
  inlay.push(
    { p: [sign * 0.709, 0.0345, 0], s: [0.0018, 0.001, 1.418], c: "#ae875a" },
    { p: [0, 0.0345, sign * 0.709], s: [1.418, 0.001, 0.0018], c: "#ae875a" },
  );
}

function lathe(points: [number, number][]) {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    24,
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
  const x = sign * 0.9,
    z = -sign * 0.26;
  bowls.push({ p: [x, -0.03, z], s: [1, 1, 1], c: "#73472e" });
  lids.push({ p: [x, -0.029, -sign * 0.59], s: [1, 1, 1], c: "#845335" });
  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count + layer * 0.37;
      const radius = layer === 0 ? 0.054 : 0.071;
      supplies[index]!.push({
        p: [
          x + Math.cos(angle) * radius,
          0.028 + layer * 0.027,
          z + Math.sin(angle) * radius,
        ],
        s: [0.84, 0.36, 0.84],
        r: [Math.sin(angle) * 0.23, angle, Math.cos(angle) * 0.18],
        c: "#ffffff",
      });
    }
    supplies[index]!.push({
      p: [x, 0.031 + layer * 0.027, z],
      s: [0.84, 0.36, 0.84],
      r: [0.1, layer, -0.13],
      c: "#ffffff",
    });
  }
}

/** Original prototype art, adapted to the current tabletop. Keep the grid at local Y=0.
 * Static parts stay instanced; 24-sided bowls and shared 12x8 stones preserve the silhouette.
 * The lower base is shallower to clear the current pavilion felt without moving seat/camera anchors. */
export const GomokuAssets = memo(function GomokuAssets() {
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
        material={<SurfaceMaterial kind="wood" detail={0.42} strength={0.1} />}
      >
        <BeveledBox />
      </Instances>
      <mesh
        name="gomoku-playing-surface"
        position={[0, 0.011, 0]}
      >
        <boxGeometry
          args={[
            GOMOKU.boardOuterSpan - 0.08,
            0.006,
            GOMOKU.boardOuterSpan - 0.08,
          ]}
        />
        <BoardWood />
      </mesh>
      <Instances
        parts={inlay}
        shadow={false}
        material={<meshLambertMaterial />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={bowls}
        material={<SurfaceMaterial kind="wood" detail={0.45} strength={0.08} />}
      >
        <primitive object={bowlGeometry} attach="geometry" dispose={null} />
      </Instances>
      <Instances
        parts={lids}
        material={<SurfaceMaterial kind="wood" detail={0.45} strength={0.08} />}
      >
        <primitive object={lidGeometry} attach="geometry" dispose={null} />
      </Instances>
      {supplies.map((parts, i) => (
        <Instances
          key={i}
          parts={parts}
          material={
            <primitive
              object={i ? whiteStoneMaterial : blackStoneMaterial}
              attach="material"
              dispose={null}
            />
          }
        >
          <primitive object={stoneGeometry} attach="geometry" dispose={null} />
        </Instances>
      ))}
    </group>
  );
});
