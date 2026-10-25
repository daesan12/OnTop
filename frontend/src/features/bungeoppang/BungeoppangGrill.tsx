import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sphere,
  DynamicDrawUsage,
  Vector3,
} from "three";
import { BUNGEOPPANG } from "./config";
import { cookLevel, judge } from "./rules";
import {
  BUNG_GRILL,
  bungeoppangClock,
  bungeoppangView,
  slotFx,
  slotOverlayEls,
  slotScreen,
} from "./bungeoppangView";
import {
  discardBungeoppangSlot,
  pressBungeoppangSlot,
  useBungeoppang,
} from "./store";

const R = BUNGEOPPANG;
// 카트 홈과 같은 붕어 윤곽(머리 -x, 꼬리 +x). scripts/repair-cart-prop.py와 같은 점이다.
const OUTLINE = [
  [-0.52, 0],
  [-0.48, -0.19],
  [-0.32, -0.3],
  [-0.08, -0.32],
  [0.14, -0.25],
  [0.3, -0.12],
  [0.49, -0.29],
  [0.43, 0],
  [0.49, 0.29],
  [0.3, 0.12],
  [0.14, 0.25],
  [-0.08, 0.32],
  [-0.32, 0.3],
  [-0.48, 0.19],
] as const;
function fishShape(length: number) {
  const shape = new Shape();
  OUTLINE.forEach(([x, y], i) =>
    i
      ? shape.lineTo(x * length, y * length)
      : shape.moveTo(x * length, y * length),
  );
  shape.closePath();
  return shape;
}
/** 익힘 색: 연한 베이지 → 노릇 → 황금 → 진한 갈색(너무 익음) → 탐(100에서 바로 바뀜). */
const STOPS: [number, Color][] = [
  [0, new Color("#f2e3c0")],
  [50, new Color("#e7c27c")],
  [70, new Color("#e0a33a")],
  [90, new Color("#c9811f")],
  [99, new Color("#8a5424")],
];
const BURNT = new Color("#32200f");
const BATTER = new Color("#f4ead2");
export function cookColor(level: number, target: Color) {
  if (level >= R.burntFrom) return target.copy(BURNT);
  const l = Math.max(0, level);
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i]!;
    if (l <= b) {
      const [a, ca] = STOPS[i - 1]!;
      return target.copy(ca).lerp(cb, (l - a) / (b - a));
    }
  }
  return target.copy(STOPS[STOPS.length - 1]![1]);
}
const GAUGE: Record<string, string> = {
  RAW: "#d3d1c7",
  GOOD: "#97c459",
  PERFECT: "#ef9f27",
  OVER: "#854f0b",
  BURNT: "#e24b4a",
};

/** 내 화면에만 보이는 개인 철판. 조리대 시점일 때만 그린다. */
export function BungeoppangGrill() {
  const phase = useBungeoppang((s) => s.phase);
  if (phase === "idle") return null;
  return <GrillMeshes />;
}

function GrillMeshes() {
  const { camera, gl } = useThree();
  const L = BUNG_GRILL.breadLength;
  const geometries = useMemo(() => {
    const bread = new ExtrudeGeometry(fishShape(L), {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 4,
    });
    bread.rotateX(-Math.PI / 2);
    const batter = new ExtrudeGeometry(fishShape(L * 0.96), {
      depth: 0.012,
      bevelEnabled: false,
    });
    batter.rotateX(-Math.PI / 2);
    const cavity = new ShapeGeometry(fishShape(L * 1.06));
    cavity.rotateX(-Math.PI / 2);
    return {
      bread,
      batter,
      cavity,
      bean: new SphereGeometry(0.045, 10, 6),
      hit: new BoxGeometry(L * 1.12, 0.14, L * 0.82),
      plate: new BoxGeometry(BUNG_GRILL.plate.width, BUNG_GRILL.plate.thickness, BUNG_GRILL.plate.depth),
    };
  }, [L]);
  const materials = useMemo(
    () => ({
      // 저녁·밤에도 판과 홈이 구별되도록 약한 자체 발광을 둔다.
      plate: new MeshStandardMaterial({
        color: "#5c544d",
        emissive: "#1b1815",
        metalness: 0.3,
        roughness: 0.55,
      }),
      rim: new MeshStandardMaterial({
        color: "#8a7f75",
        emissive: "#24201c",
        metalness: 0.25,
        roughness: 0.5,
      }),
      cavity: new MeshStandardMaterial({
        color: "#1f1b18",
        metalness: 0.2,
        roughness: 0.8,
      }),
      bread: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 }),
      batter: new MeshStandardMaterial({ color: BATTER, roughness: 0.9 }),
      bean: new MeshStandardMaterial({ color: "#5a2a1e", roughness: 0.7 }),
      hover: new MeshBasicMaterial({ color: "#fffaf0", transparent: true, opacity: 0.5, depthWrite: false }),
      golden: new MeshBasicMaterial({ color: "#ef9f27", transparent: true, opacity: 0.85, depthWrite: false }),
      // 그리지 않지만 레이캐스트는 받는 클릭 상자(그리기 호출 없음).
      hit: new MeshBasicMaterial({ visible: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
    [geometries, materials],
  );
  const breads = useRef<InstancedMesh>(null);
  const batters = useRef<InstancedMesh>(null);
  const beans = useRef<InstancedMesh>(null);
  const hoverRings = useRef<InstancedMesh>(null);
  const goldenRings = useRef<InstancedMesh>(null);
  const groups = useRef<(Group | null)[]>([]);
  const rims = useRef<InstancedMesh>(null);
  const cavities = useRef<InstancedMesh>(null);
  const staticScratch = useMemo(() => new Object3D(), []);
  const staticOffsets = useRef(new Float32Array(R.slots));
  const setStaticSlot = (i: number, x: number, z: number) => {
    staticScratch.position.set(x, BUNG_GRILL.top + 0.001, z);
    staticScratch.scale.set(1.1, 1, 1.18);
    staticScratch.updateMatrix();
    rims.current!.setMatrixAt(i, staticScratch.matrix);
    staticScratch.position.y = BUNG_GRILL.top + 0.002;
    staticScratch.scale.set(1, 1, 1);
    staticScratch.updateMatrix();
    cavities.current!.setMatrixAt(i, staticScratch.matrix);
  };
  useLayoutEffect(() => {
    BUNG_GRILL.slots.forEach(([x, z], i) => setStaticSlot(i, x, z));
    const batches = [rims.current!, cavities.current!, breads.current!, batters.current!, beans.current!, hoverRings.current!, goldenRings.current!];
    for (const mesh of batches) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      // All six slots, shake and the short upward/sideways take animation.
      // Bounds are local to this small private grill; world-sector culling stays intact.
      mesh.boundingSphere = new Sphere(new Vector3(...BUNG_GRILL.center), 2.2);
    }
    breads.current!.setColorAt(0, STOPS[0]![1]);
    return () => { batches.forEach(mesh => mesh.dispose()); };
  }, []);
  // 카트 앞 간판이 45° 시점을 가린다. 굽는 동안 내 화면에서만 숨기고 나갈 때 되돌린다.
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const hidden = new Map<Mesh, boolean>();
    const hide = () => {
      scene.getObjectByName("fish-bread")?.traverse((object) => {
        const mesh = object as Mesh;
        const name = (mesh.material as { name?: string } | undefined)?.name;
        if (
          mesh.isMesh &&
          mesh.visible &&
          name &&
          bungeoppangView.hiddenCartMaterials.includes(name)
        ) {
          mesh.visible = false;
          hidden.set(mesh, true);
        }
      });
    };
    hide();
    // The cart streams by distance. Keep checking until its LODs have loaded,
    // including slow connections, rather than relying on a single timeout.
    const timer = setInterval(hide, 250);
    return () => {
      clearInterval(timer);
      hidden.forEach((visible, mesh) => (mesh.visible = visible));
    };
  }, [scene]);
  const scratch = useMemo(
    () => ({ v: new Vector3(), w: new Vector3(), color: new Color(), object: new Object3D() }),
    [],
  );

  useFrame(() => {
    const s = useBungeoppang.getState();
    const grill = s.grill;
    const now = performance.now();
    const showGame =
      s.phase === "countdown" || s.phase === "play" || s.phase === "ending";
    const rect = gl.domElement.getBoundingClientRect();
    const visible = { bread: false, batter: false, bean: false, hover: false, golden: false };
    const instance = (mesh: InstancedMesh, i: number, x: number, y: number, z: number, scale: number, rotation = 0, sx = 1, sz = 1) => {
      const object = scratch.object;
      object.position.set(x, y, z);
      object.rotation.set(rotation, 0, 0);
      object.scale.set(scale * sx, scale, scale * sz);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    };
    BUNG_GRILL.slots.forEach(([x, z], i) => {
      const slot = grill?.slots[i];
      const fx = slotFx[i]!;
      const group = groups.current[i];
      // 재료가 맞지 않을 때 0.25초 흔들기
      const shake = now - fx.shakeAt;
      const offset = shake < 250 ? Math.sin(shake / 18) * 0.012 : 0;
      if (group) group.position.x = x + offset;
      if (Math.abs(staticOffsets.current[i]! - offset) > 0.000001) {
        setStaticSlot(i, x + offset, z);
        staticOffsets.current[i] = offset;
        rims.current!.instanceMatrix.needsUpdate = true;
        cavities.current!.instanceMatrix.needsUpdate = true;
      }
      const cooking =
        showGame && (slot?.phase === "front" || slot?.phase === "back");
      const level = cooking
        ? cookLevel(slot!.since, bungeoppangClock.t, slot!.heat, R)
        : 0;
      const breadVisible = !!cooking || (showGame && now - fx.takeAt < 260);
      const flip = (now - fx.flipAt) / 280, take = (now - fx.takeAt) / 260;
      let bx = x + offset, by = BUNG_GRILL.top, rotation = 0, scale = 1;
      if (flip >= 0 && flip < 1) {
        by += Math.sin(flip * Math.PI) * 0.14;
        rotation = flip * Math.PI;
      } else if (take >= 0 && take < 1) {
        bx += take * 0.5;
        by += Math.sin(take * Math.PI) * 0.18;
        scale = 1 - take * 0.5;
      }
      instance(breads.current!, i, bx, by, z, breadVisible ? scale : 0, rotation);
      breads.current!.setColorAt(i, cookColor(level, scratch.color));
      visible.bread ||= breadVisible;
      const batterVisible = showGame && slot?.phase === "batter";
      const pour = Math.min(1, (now - fx.pourAt) / 200);
      instance(batters.current!, i, x + offset, BUNG_GRILL.top + .002, z, batterVisible ? .35 + .65 * pour : 0);
      visible.batter ||= batterVisible;
      const fill = (now - fx.fillAt) / 1200;
      const beanVisible = !!cooking && slot!.phase === "front" && fill >= 0 && fill < 1;
      instance(beans.current!, i, x + offset, BUNG_GRILL.top + .03, z, beanVisible ? Math.min(1, fill * 6) : 0);
      visible.bean ||= beanVisible;
      const golden = s.firstGame && cooking && level >= R.goldenFrom && level <= R.goldenTo;
      const goldVisible = s.phase === "play" && !!golden;
      const hoverVisible = s.phase === "play" && fx.hover && !golden;
      instance(goldenRings.current!, i, x + offset, BUNG_GRILL.top + .003, z, goldVisible ? 1 : 0, 0, 1.07, 1.12);
      instance(hoverRings.current!, i, x + offset, BUNG_GRILL.top + .003, z, hoverVisible ? 1 : 0, 0, 1.07, 1.12);
      visible.golden ||= goldVisible;
      visible.hover ||= hoverVisible;
      // 칸 위 DOM(키, 동작 이름, 게이지, 김) 위치와 값
      const v = scratch.v.set(x, BUNG_GRILL.top + 0.02, z).project(camera);
      const w = scratch.w
        .set(x + L / 2, BUNG_GRILL.top + 0.02, z)
        .project(camera);
      const sx = rect.left + ((v.x + 1) / 2) * rect.width,
        sy = rect.top + ((1 - v.y) / 2) * rect.height;
      const width = Math.abs(((w.x - v.x) / 2) * rect.width) * 2;
      Object.assign(slotScreen[i]!, { x: sx, y: sy, width });
      const el = slotOverlayEls[i];
      if (el) {
        el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        el.style.setProperty("--slot-width", `${width.toFixed(0)}px`);
        el.dataset.cooking = cooking ? "true" : "false";
        const gauge = el.querySelector<HTMLElement>(".bung-gauge-fill");
        if (gauge) {
          const j = judge(level, R);
          gauge.style.width = `${Math.min(100, level)}%`;
          gauge.style.background =
            GAUGE[j === "GOOD" && level > R.goldenTo ? "OVER" : j]!;
        }
        el.dataset.steam = !cooking
          ? "none"
          : level >= 95
            ? "smoke"
            : level > 40
              ? "steam"
              : "none";
      }
    });
    for (const [mesh, shown] of [[breads.current!, visible.bread], [batters.current!, visible.batter], [beans.current!, visible.bean], [hoverRings.current!, visible.hover], [goldenRings.current!, visible.golden]] as const) {
      mesh.visible = shown;
      if (shown) mesh.instanceMatrix.needsUpdate = true;
    }
    if (visible.bread && breads.current!.instanceColor) breads.current!.instanceColor.needsUpdate = true;
  });

  const onDown = (i: number) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.button === 0 && event.shiftKey) discardBungeoppangSlot(i);
    else if (event.button === 0) pressBungeoppangSlot(i);
    else if (event.button === 2) discardBungeoppangSlot(i);
  };
  const [cx, , cz] = BUNG_GRILL.center;
  const { thickness } = BUNG_GRILL.plate;
  return (
    <group name="bungeoppang-personal-grill" dispose={null}>
      <instancedMesh ref={breads} args={[geometries.bread, materials.bread, R.slots]} visible={false} />
      <instancedMesh ref={batters} args={[geometries.batter, materials.batter, R.slots]} visible={false} />
      <instancedMesh ref={beans} args={[geometries.bean, materials.bean, R.slots]} visible={false} />
      <instancedMesh ref={hoverRings} args={[geometries.cavity, materials.hover, R.slots]} visible={false} />
      <instancedMesh ref={goldenRings} args={[geometries.cavity, materials.golden, R.slots]} visible={false} />
      <instancedMesh
        ref={rims}
        args={[geometries.cavity, materials.rim, R.slots]}
      />
      <instancedMesh
        ref={cavities}
        args={[geometries.cavity, materials.cavity, R.slots]}
      />
      <mesh
        position={[cx, BUNG_GRILL.top - thickness / 2, cz]}
        material={materials.plate}
        castShadow={false}
        receiveShadow
        geometry={geometries.plate}
      />
      {BUNG_GRILL.slots.map(([x, z], i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={[x, BUNG_GRILL.top, z]}
        >
          {/* 붕어빵이 뒤집히며 움직여도 빗나가지 않는 넓은 클릭 상자 */}
          <mesh
            material={materials.hit}
            geometry={geometries.hit}
            position={[0, 0.06, 0]}
            onPointerDown={onDown(i)}
            onPointerOver={(e) => {
              e.stopPropagation();
              slotFx[i]!.hover = true;
              useBungeoppang.setState({ hover: i });
            }}
            onPointerOut={() => {
              slotFx[i]!.hover = false;
              if (useBungeoppang.getState().hover === i)
                useBungeoppang.setState({ hover: null });
            }}
            onContextMenu={(e) => e.nativeEvent.preventDefault()}
          />
        </group>
      ))}
    </group>
  );
}
