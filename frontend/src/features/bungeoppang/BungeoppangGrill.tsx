import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  CatmullRomCurve3,
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
  TubeGeometry,
} from "three";
import { BUNGEOPPANG, bungeoppangV5Enabled } from "./config";
import { createFishCartShape as fishShape } from '../../world/art/fishCartShape';
import { createSculptedFish } from '../../world/art/fishBreadGeometry';
import { v5HeatEls } from './layoutV5';
import { cookLevel, judge } from "./rules";
import { heatLook, INGREDIENT_LOOK } from './presentation';
import { BREAD_NAMES, BREAD_TOOLS } from './rulesV4';
import { isV5Grill } from './rulesV5';
import { BungeoppangSceneV5 } from './BungeoppangSceneV5';
import { BungeoppangStageV5 } from './BungeoppangStageV5';
import { BungeoppangFood25V5 } from './BungeoppangFood25V5';
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
function cookingMaterial(color: Color | string, roughness: number, detailed = false) {
  const material = new MeshStandardMaterial({ color, roughness, emissive: '#ffffff', emissiveIntensity: 0 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;' + (detailed
        ? '\n totalEmissiveRadiance += diffuseColor.rgb * (0.08 + 0.22 * max(0.0, dot(normal, normalize(vec3(-0.5, 0.65, 0.7)))));' : ''));
  };
  material.customProgramCacheKey = () => detailed ? 'bungeoppang-readable-cooking-v2' : 'bungeoppang-readable-cooking-v1';
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
  const v5 = useBungeoppang(s => isV5Grill(s.grill && 'rulesVersion' in s.grill ? s.grill : null));
  const root = useRef<Group>(null), { gl, camera, scene } = useThree();
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!v5 || phase !== 'countdown' || !root.current) return;
    let mounted = true;
    // Includes hidden food variants; use the existing park lighting without rendering a fake frame.
    void gl.compileAsync(root.current, camera, scene).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => { mounted = false; };
  }, [v5, phase, gl, camera, scene]);
  if (error) throw error;
  if (phase === "idle") return null;
  return <group ref={root} name="bungeoppang-render-root">{bungeoppangV5Enabled && <BungeoppangStageV5 />}<GrillMeshes />{v5 && <><BungeoppangFood25V5 /><BungeoppangSceneV5 /></>}</group>;
}

function GrillMeshes() {
  const { camera, gl } = useThree();
  const detailed = useBungeoppang(s => isV5Grill(s.grill && 'rulesVersion' in s.grill ? s.grill : null));
  const L = BUNG_GRILL.breadLength;
  const geometries = useMemo(() => {
    const bread = detailed ? createSculptedFish(BUNG_GRILL.mouldScale * .92) : new ExtrudeGeometry(fishShape(BUNG_GRILL.mouldScale * .92), {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 4,
    });
    if (!detailed) bread.rotateX(-Math.PI / 2);
    const batter = new ExtrudeGeometry(fishShape(BUNG_GRILL.mouldScale * .92), {
      depth: 0.012,
      bevelEnabled: false,
    });
    batter.rotateX(-Math.PI / 2);
    const cavity = detailed ? new TubeGeometry(new CatmullRomCurve3(fishShape(BUNG_GRILL.mouldScale).getSpacedPoints(64)
      .slice(0, -1).map(p => new Vector3(p.x, .005, -p.y)), true), 64, .0035, 5, true)
      : new ShapeGeometry(fishShape(BUNG_GRILL.mouldScale));
    if (!detailed) cavity.rotateX(-Math.PI / 2);
    return {
      bread,
      batter,
      cavity,
      bean: new SphereGeometry(0.045, 10, 6),
      hit: new BoxGeometry(L * 1.12, 0.14, L * 0.82),
    };
  }, [L, detailed]);
  const materials = useMemo(
    () => ({
      bread: cookingMaterial('#ffffff', .78, detailed),
      batter: cookingMaterial(detailed ? '#ffffff' : BATTER, .9, detailed),
      bean: cookingMaterial('#ffffff', .7, detailed),
      hover: new MeshBasicMaterial({ color: "#fffaf0", transparent: true, opacity: 0.5, depthWrite: false }),
      golden: new MeshBasicMaterial({ color: "#ef9f27", transparent: true, opacity: 0.85, depthWrite: false }),
      // 그리지 않지만 레이캐스트는 받는 클릭 상자(그리기 호출 없음).
      hit: new MeshBasicMaterial({ visible: false }),
    }),
    [detailed],
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
    if (detailed) batters.current!.setColorAt(0, STOPS[0]![1]);
    for (let i = 0; i < R.slots * (detailed ? 9 : 1); i++) beans.current!.setColorAt(i, FILLING_COLORS.bean!);
    return () => { batches.forEach(mesh => mesh.dispose()); };
  }, [geometries, materials, detailed]);
  const scratch = useMemo(
    () => ({ v: new Vector3(), w: new Vector3(), color: new Color(), object: new Object3D() }),
    [],
  );
  materials.bread.vertexColors = detailed;

  useFrame(() => {
    const s = useBungeoppang.getState();
    const grill = s.grill;
    const v5 = grill && 'rulesVersion' in grill && isV5Grill(grill);
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
      const monitor = v5HeatEls[i];
      if (v5 && monitor) {
        const lit = cooking;
        const look = heatLook(slot?.heat ?? 100, bungeoppangClock.t, rules);
        monitor.dataset.lit = String(lit); monitor.dataset.heat = look.band; monitor.dataset.rush = String(look.rush);
        const values = { '.bung-v5-heat-label': lit ? look.label : '꺼짐',
          '.bung-v5-heat-value': lit ? `${slot!.heat}%` : '—',
          '.bung-v5-heat-speed': lit ? `굽기 ×${look.speed.toFixed(2)}` : slot?.phase === 'batter' ? '소를 넣으면 가열 시작' : '반죽을 부어요',
          '.bung-v5-cook-state': !lit ? slot?.phase === 'batter' ? '반죽 · 가열 대기' : '빈 칸' : `${slot!.phase === 'front' ? '앞면' : '뒷면'} ${level}%`,
          '.bung25-slot-name': slot?.phase === 'batter' ? s.tool === 'batter' ? '소 선택 1~4' : `${BREAD_NAMES[s.tool]} 넣기`
            : !lit ? s.tool === 'batter' ? '반죽 붓기' : '반죽부터'
            : level >= rules.burntFrom ? '탄 빵 · 버리기' : s.choosingWaste ? '폐기 대상으로 선택'
            : `${slot && 'filling' in slot && slot.filling ? BREAD_NAMES[slot.filling] : ''} · ${slot!.phase === 'front' ? '뒤집기' : '꺼내기'}` };
        monitor.dataset.quality = cooking ? judge(level, rules) : 'EMPTY';
        for (const [selector, text] of Object.entries(values)) {
          const readout = monitor.querySelector(selector);
          if (readout && readout.textContent !== text) readout.textContent = text;
        }
      }
      const breadVisible = (!!cooking && (!v5 || slot!.phase !== 'batter')) || (showGame && now - fx.takeAt < 260);
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
      const batterVisible = showGame && slot?.phase === 'batter';
      const pour = Math.min(1, (now - fx.pourAt) / 200);
      instance(batters.current!, i, x + offset, BUNG_GRILL.top + .002, z, batterVisible ? .35 + .65 * pour : 0);
      if (v5 && batterVisible) batters.current!.setColorAt(i, cookColor(level, scratch.color));
      visible.batter ||= batterVisible;
      const fill = (now - fx.fillAt) / 1200;
      const beanVisible = !!cooking && slot!.phase === "front" && fill >= 0;
      const filling = slot && 'filling' in slot && slot.filling ? slot.filling : 'bean';
      if (v5) {
        for (let part = 0; part < 9; part++) {
          const angle = (part - 1) / 8 * Math.PI * 2, radius = part ? .032 : 0;
          instance(beans.current!, i * 9 + part, x + offset - .02 + Math.cos(angle) * radius,
            BUNG_GRILL.top + .043 + (part ? 0 : .014), z + Math.sin(angle) * radius * .7,
            beanVisible ? .43 * Math.min(1, fill * 6) : 0, 0, filling === 'bean' ? .85 : 1, .75);
        }
      } else instance(beans.current!, i, x + offset, BUNG_GRILL.top + .03, z, beanVisible ? Math.min(1, fill * 6) : 0);
      if (previousFillings.current[i] !== filling) {
        for (let part = 0; part < (v5 ? 9 : 1); part++) {
          const color = v5 && filling === 'bean' ? scratch.color.set('#722a32')
            : v5 && filling === 'pizza' && part % 3 === 0 ? scratch.color.set('#f7d77b') : FILLING_COLORS[filling]!;
          beans.current!.setColorAt(v5 ? i * 9 + part : i, color);
        }
        beans.current!.instanceColor!.needsUpdate = true;
        previousFillings.current[i] = filling;
      }
      visible.bean ||= beanVisible;
      const golden = s.firstGame && cooking && level >= R.goldenFrom && level <= R.goldenTo;
      const goldVisible = s.phase === "play" && !!golden;
      const hoverVisible = s.phase === "play" && fx.hover && !golden;
      instance(goldenRings.current!, i, x + offset, BUNG_GRILL.top + .003, z, goldVisible ? 1 : 0, 0, v5 ? .86 : 1.07, v5 ? 1.85 : 1.12);
      instance(hoverRings.current!, i, x + offset, BUNG_GRILL.top + .003, z, hoverVisible ? 1 : 0, 0, v5 ? .86 : 1.07, v5 ? 1.85 : 1.12);
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
        if (v5) el.dataset.waiting = String(slot?.phase === 'batter');
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
          const text = `${slot!.phase === 'batter' ? '반죽' : slot!.phase === 'front' ? '앞면' : '뒷면'} · ${quality === 'RAW' ? '설익음' : quality === 'PERFECT' ? '황금! 지금 눌러요' : quality === 'BURNT' ? v5 ? '탔어요 · 눌러서 버리기' : '탔어요 · 폐기' : level > rules.goldenTo ? '곧 타요!' : '알맞음'} ${level}%`;
          if (readout && readout.textContent !== text) { readout.textContent = text; readout.dataset.quality = quality; }
        } else if (v5) {
          const readout = el.querySelector<HTMLElement>('.bung-cook-readout');
          const text = slot?.phase === 'batter' ? '소를 넣으면 불이 켜져요' : '';
          if (readout && readout.textContent !== text) { readout.textContent = text; readout.dataset.quality = 'EMPTY'; }
        }
        const gauge = el.querySelector<HTMLElement>(".bung-gauge-fill");
        if (gauge) {
          const j = judge(level, R);
          gauge.style.width = `${Math.min(100, level)}%`;
          gauge.style.background =
            GAUGE[j === "GOOD" && level > R.goldenTo ? "OVER" : j]!;
          const progress = gauge.parentElement;
          if (progress && progress.getAttribute('aria-valuenow') !== String(Math.min(100, level))) {
            progress.setAttribute('aria-valuenow', String(Math.min(100, level)));
          }
          const valueText = cooking ? `${slot!.phase === 'front' ? '앞면' : '뒷면'} 익힘 ${level}%`
            : slot?.phase === 'batter' ? '반죽 · 소를 넣으면 가열 시작' : '빈 칸';
          if (progress && progress.getAttribute('aria-valuetext') !== valueText) progress.setAttribute('aria-valuetext', valueText);
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
      mesh.visible = shown && (!detailed || (mesh !== breads.current && mesh !== batters.current));
      if (shown) mesh.instanceMatrix.needsUpdate = true;
    }
    if (visible.bread && breads.current!.instanceColor) breads.current!.instanceColor.needsUpdate = true;
    if (visible.batter && batters.current!.instanceColor) batters.current!.instanceColor.needsUpdate = true;
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
      <instancedMesh name="bungeoppang-fillings" ref={beans} args={[geometries.bean, materials.bean, R.slots * (detailed ? 9 : 1)]} visible={false} />
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
