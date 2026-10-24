import { memo } from "react";
import {
  CylinderGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BeveledBox } from "../../../world/art/BeveledBox";
import { Instances, type Part } from "../../../world/art/Instances";
import { SurfaceMaterial } from "../../../world/art/SurfaceMaterial";
import { boneMaps, leatherMaps, boardWearMap, contactMap } from "./textures";

function merge(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error("Incompatible original Farkle geometry");
  parts.forEach((part) => part.dispose());
  return geometry;
}

function thread(from: Vector3, to: Vector3) {
  return new CylinderGeometry(0.00135, 0.00135, from.distanceTo(to), 4)
    .applyQuaternion(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      ),
    )
    .translate(...from.add(to).multiplyScalar(0.5).toArray());
}

function buildAssets() {
  const bone = boneMaps(),
    hide = leatherMaps();
  const dice = new RoundedBoxGeometry(0.15, 0.15, 0.15, 2, 0.017);
  const uv = dice.getAttribute("uv");
  dice.groups.forEach(({ start, count }, face) => {
    for (let i = start; i < start + count; i++) {
      uv.setXY(
        i,
        ((face % 3) + 0.0625 + uv.getX(i) * 0.875) / 3,
        (1 - Math.floor(face / 3) + 0.0625 + uv.getY(i) * 0.875) / 2,
      );
    }
  });
  // One atlas/material draw per die, including all six engraved faces.
  dice.clearGroups();
  const boneMaterials = ["#fff6df", "#ead9b7", "#f5e6c6"].map(
    (color) =>
      new MeshStandardMaterial({
        ...bone,
        color,
        roughness: 0.68,
        bumpScale: 0.0032,
      }),
  );
  const outer = new LatheGeometry(
    [
      [0, 0],
      [0.096, 0],
      [0.108, 0.012],
      [0.113, 0.04],
      [0.122, 0.12],
      [0.135, 0.23],
      [0.141, 0.278],
      [0.137, 0.292],
    ].map(([r, y]) => new Vector2(r, y)),
    24,
  );
  const inner = new LatheGeometry(
    [
      [0.137, 0.292],
      [0.126, 0.292],
      [0.123, 0.27],
      [0.101, 0.055],
      [0.087, 0.035],
      [0, 0.035],
    ].map(([r, y]) => new Vector2(r, y)),
    24,
  );
  const rings = merge([
    new TorusGeometry(0.133, 0.009, 6, 24)
      .rotateX(Math.PI / 2)
      .translate(0, 0.29, 0),
    new TorusGeometry(0.11, 0.005, 6, 24)
      .rotateX(Math.PI / 2)
      .translate(0, 0.021, 0),
  ]);
  const bands = merge([
    new CylinderGeometry(0.14, 0.136, 0.026, 24, 1, true).translate(
      0,
      0.259,
      0,
    ),
    new CylinderGeometry(0.117, 0.113, 0.027, 24, 1, true).translate(
      0,
      0.052,
      0,
    ),
  ]);
  const stitches: BufferGeometry[] = [];
  for (const [y, r] of [
    [0.259, 0.141],
    [0.052, 0.118],
  ]) {
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      stitches.push(
        thread(
          new Vector3(
            Math.sin(angle - 0.023) * r,
            y - 0.004,
            Math.cos(angle - 0.023) * r,
          ),
          new Vector3(
            Math.sin(angle + 0.023) * r,
            y + 0.004,
            Math.cos(angle + 0.023) * r,
          ),
        ),
      );
    }
  }
  // Two hand-sewn lines at the front seam, merged into the same draw as the bands.
  for (let i = 0; i < 13; i++) {
    const y = 0.076 + i * 0.012,
      r = 0.115 + y * 0.095;
    stitches.push(
      thread(new Vector3(-0.006, y, -r), new Vector3(0.006, y + 0.006, -r)),
    );
  }
  const nails: BufferGeometry[] = [];
  for (const x of [-0.875, 0.695])
    for (const z of [-0.6, 0.6]) {
      for (const dx of [-0.018, 0.018])
        nails.push(
          new SphereGeometry(0.008, 6, 3)
            .scale(1, 0.35, 1)
            .translate(x + dx, 1.169, z),
        );
    }
  return {
    dice,
    boneMaterials,
    outer,
    inner,
    bindings: merge([rings, bands]),
    stitches: merge(stitches),
    nails: merge(nails),
    leather: new MeshStandardMaterial({
      ...hide,
      color: "#e1c4a3",
      roughness: 0.87,
      bumpScale: 0.002,
    }),
    lining: new MeshStandardMaterial({
      ...hide,
      color: "#88684d",
      roughness: 1,
      bumpScale: 0.001,
    }),
    binding: new MeshStandardMaterial({
      ...hide,
      color: "#725038",
      roughness: 0.83,
      bumpScale: 0.001,
    }),
    thread: new MeshStandardMaterial({ color: "#b89c6c", roughness: 1 }),
    iron: new MeshStandardMaterial({
      color: "#544c3b",
      metalness: 0.65,
      roughness: 0.7,
    }),
    wear: new MeshStandardMaterial({
      map: boardWearMap(),
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    contact: new MeshBasicMaterial({
      map: contactMap(),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
    contactPlane: new PlaneGeometry(0.25, 0.25).rotateX(-Math.PI / 2),
    wearPlane: new PlaneGeometry(1.54, 1.16),
  };
}

let assets: ReturnType<typeof buildAssets> | undefined;
export function farkleArt() {
  return (assets ??= buildAssets());
}

// Shared for every table, kept across game switches; release only on module replacement.
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    if (!assets) return;
    const textures = new Set<import("three").Texture>();
    for (const entry of Object.values(assets).flat()) {
      if (
        entry instanceof MeshStandardMaterial ||
        entry instanceof MeshBasicMaterial
      ) {
        if (entry.map) textures.add(entry.map);
        if (entry instanceof MeshStandardMaterial && entry.bumpMap)
          textures.add(entry.bumpMap);
      }
      entry.dispose();
    }
    textures.forEach((map) => map.dispose());
    assets = undefined;
  });

export const BoneDie = memo(function BoneDie({ id }: { id: number }) {
  const art = farkleArt();
  return (
    <mesh
      geometry={art.dice}
      material={art.boneMaterials[id % 3]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
});

export const LeatherCup = memo(function LeatherCup() {
  const art = farkleArt();
  return (
    <group dispose={null}>
      <mesh
        geometry={art.outer}
        material={art.leather}
        castShadow
        receiveShadow
      />
      <mesh geometry={art.inner} material={art.lining} />
      <mesh geometry={art.bindings} material={art.binding} />
      <mesh geometry={art.stitches} material={art.thread} />
    </group>
  );
});

const wood: Part[] = [
  { p: [-0.09, 1.074, 0], s: [1.72, 0.045, 1.33], c: "#695347" },
];
for (let i = 0; i < 5; i++)
  wood.push({
    p: [-0.09, 1.0805, -0.464 + i * 0.232],
    s: [1.54, 0.035, 0.23],
    c: ["#93623f", "#a5754c", "#986c49", "#9f7049", "#90613f"][i]!,
  });
for (const z of [-0.62, 0.62]) {
  wood.push({ p: [-0.09, 1.119, z], s: [1.73, 0.084, 0.112], c: "#785239" });
  wood.push({
    p: [-0.09, 1.158, z + Math.sign(z) * 0.035],
    s: [1.68, 0.008, 0.012],
    c: "#b28a58",
  });
}
for (const x of [-0.9, 0.72]) {
  wood.push({ p: [x, 1.119, 0], s: [0.108, 0.084, 1.24], c: "#7c5439" });
  wood.push({
    p: [x + Math.sign(x) * 0.03, 1.158, 0],
    s: [0.012, 0.008, 1.18],
    c: "#b28a58",
  });
}
const fittings: Part[] = [];
for (const x of [-0.875, 0.695])
  for (const z of [-0.6, 0.6]) {
    fittings.push({ p: [x, 1.164, z], s: [0.09, 0.008, 0.046], c: "#6e6653" });
  }

export const OakTray = memo(function OakTray() {
  const art = farkleArt();
  return (
    <group name="farkle-oak-tray">
      <Instances
        parts={wood}
        material={
          <SurfaceMaterial
            kind="wood"
            mapping="box"
            meters={0.95}
            strength={0.26}
          />
        }
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={fittings}
        material={<meshStandardMaterial metalness={0.65} roughness={0.72} />}
      >
        <BeveledBox />
      </Instances>
      <mesh geometry={art.nails} material={art.iron} dispose={null} />
      <mesh
        position={[-0.09, 1.099, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={art.wear}
        geometry={art.wearPlane}
        dispose={null}
      />
      {/* A narrow carved storage lane keeps held dice distinct without covering the wood. */}
      <mesh position={[-0.53, 1.0995, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.006, 1.09]} />
        <meshStandardMaterial color="#3e2d1f" roughness={1} />
      </mesh>
      {[-0.52, 0.52].map((z) => (
        <mesh
          key={z}
          position={[-0.69, 1.1, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.22, 0.003]} />
          <meshStandardMaterial color="#a88c60" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
});
