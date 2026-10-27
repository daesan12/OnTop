import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShapeGeometry,
  SphereGeometry,
  Sphere,
  DynamicDrawUsage,
  Vector3,
} from "three";
import { BUNGEOPPANG } from "./config";
import { createFishCartShape as fishShape } from '../../world/art/fishCartShape';
import { cookLevel, judge } from "./rules";
import { heatLook, INGREDIENT_LOOK } from './presentation';
import { BREAD_TOOLS } from './rulesV4';
import { environmentFrame } from '../../world/environmentState';
import {
  BUNG_GRILL,
  bungeoppangClock,
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
const FILLING_COLORS = Object.fromEntries(BREAD_TOOLS.map(tool => [tool, new Color(INGREDIENT_LOOK[tool].color)]));
/** Keep gameplay colors legible at night without adding a light to the shared world. */
function cookingMaterial(color: Color | string, roughness: number) {
  const material = new MeshStandardMaterial({ color, roughness, emissive: '#ffffff', emissiveIntensity: 0 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;');
  };
  material.customProgramCacheKey = () => 'bungeoppang-readable-cooking-v1';
  return material;
}
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

/** 카트의 실제 철판 위에 내 반죽·붕어빵과 조리 효과만 표시한다. */
export function BungeoppangGrill() {
  const phase = useBungeoppang((s) => s.phase);
  if (phase === "idle") return null;
  return <GrillMeshes />;
}

function GrillMeshes() {
  const { camera, gl } = useThree();
  const L = BUNG_GRILL.breadLength;
  const geometries = useMemo(() => {
    const bread = new ExtrudeGeometry(fishShape(BUNG_GRILL.mouldScale * .92), {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 4,
    });
    bread.rotateX(-Math.PI / 2);
    const batter = new ExtrudeGeometry(fishShape(BUNG_GRILL.mouldScale * .92), {
      depth: 0.012,
      bevelEnabled: false,
    });
    batter.rotateX(-Math.PI / 2);
    const cavity = new ShapeGeometry(fishShape(BUNG_GRILL.mouldScale));
    cavity.rotateX(-Math.PI / 2);
    return {
      bread,
      batter,
      cavity,
      bean: new SphereGeometry(0.045, 10, 6),
      hit: new BoxGeometry(L * 1.12, 0.14, L * 0.82),
    };
  }, [L]);
  const materials = useMemo(
    () => ({
      bread: cookingMaterial('#ffffff', .78),
      batter: cookingMaterial(BATTER, .9),
      bean: cookingMaterial('#ffffff', .7),
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
  const previousFillings = useRef<string[]>([]);
  useLayoutEffect(() => {
    const batches = [breads.current!, batters.current!, beans.current!, hoverRings.current!, goldenRings.current!];
    for (const mesh of batches) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      // All six slots, shake and the short upward/sideways take animation.
      // Bounds are local to this small private grill; world-sector culling stays intact.
      mesh.boundingSphere = new Sphere(new Vector3(...BUNG_GRILL.center), 2.2);
    }
    breads.current!.setColorAt(0, STOPS[0]![1]);
    for (let i = 0; i < R.slots; i++) beans.current!.setColorAt(i, FILLING_COLORS.bean!);
    return () => { batches.forEach(mesh => mesh.dispose()); };
  }, []);
  const scratch = useMemo(
    () => ({ v: new Vector3(), w: new Vector3(), color: new Color(), object: new Object3D() }),
    [],
  );

  useFrame(() => {
    const s = useBungeoppang.getState();
    const grill = s.grill;
    const rules = grill && 'rulesVersion' in grill ? s.rules : R;
    const now = performance.now();
    const nightFloor = .24 * (1 - environmentFrame.daylight);
    materials.bread.emissiveIntensity = nightFloor;
    materials.batter.emissiveIntensity = nightFloor;
    materials.bean.emissiveIntensity = nightFloor;
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
      const cooking =
        showGame && (slot?.phase === "front" || slot?.phase === "back");
      const level = cooking
        ? cookLevel(slot!.since, bungeoppangClock.t, slot!.heat, rules)
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
      const beanVisible = !!cooking && slot!.phase === "front" && fill >= 0;
      instance(beans.current!, i, x + offset, BUNG_GRILL.top + .03, z, beanVisible ? Math.min(1, fill * 6) : 0);
      const filling = slot && 'filling' in slot && slot.filling ? slot.filling : 'bean';
      if (previousFillings.current[i] !== filling) {
        beans.current!.setColorAt(i, FILLING_COLORS[filling]!);
        beans.current!.instanceColor!.needsUpdate = true;
        previousFillings.current[i] = filling;
      }
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
        if (cooking) {
          const heat = heatLook(slot!.heat, bungeoppangClock.t, rules);
          const badge = el.querySelector<HTMLElement>('.bung-heat');
          if (badge) {
            badge.dataset.rush = String(heat.rush);
            const speed = badge.querySelector('.bung-heat-speed');
            const text = `${heat.rush ? '몰림 · ' : ''}굽기 ×${heat.speed.toFixed(2)}`;
            if (speed && speed.textContent !== text) speed.textContent = text;
          }
          const readout = el.querySelector<HTMLElement>('.bung-cook-readout');
          const quality = judge(level, rules);
          const text = `${slot!.phase === 'front' ? '앞면' : '뒷면'} · ${quality === 'RAW' ? '설익음' : quality === 'PERFECT' ? '황금! 지금 눌러요' : quality === 'BURNT' ? '탔어요 · 폐기' : level > rules.goldenTo ? '곧 타요!' : '알맞음'} ${level}%`;
          if (readout && readout.textContent !== text) { readout.textContent = text; readout.dataset.quality = quality; }
        }
        const gauge = el.querySelector<HTMLElement>(".bung-gauge-fill");
        if (gauge) {
          const j = judge(level, R);
          gauge.style.width = `${Math.min(100, level)}%`;
          gauge.style.background =
            GAUGE[j === "GOOD" && level > R.goldenTo ? "OVER" : j]!;
          if (cooking && gauge.getAttribute('aria-valuenow') !== String(Math.min(100, level))) {
            gauge.setAttribute('aria-valuenow', String(Math.min(100, level)));
            gauge.setAttribute('aria-valuetext', `${slot!.phase === 'front' ? '앞면' : '뒷면'} 익힘 ${level}%`);
          }
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
  return (
    <group name="bungeoppang-personal-grill" dispose={null}>
      <instancedMesh ref={breads} args={[geometries.bread, materials.bread, R.slots]} visible={false} />
      <instancedMesh ref={batters} args={[geometries.batter, materials.batter, R.slots]} visible={false} />
      <instancedMesh name="bungeoppang-fillings" ref={beans} args={[geometries.bean, materials.bean, R.slots]} visible={false} />
      <instancedMesh ref={hoverRings} args={[geometries.cavity, materials.hover, R.slots]} visible={false} />
      <instancedMesh ref={goldenRings} args={[geometries.cavity, materials.golden, R.slots]} visible={false} />
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
