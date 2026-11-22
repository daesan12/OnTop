import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, Object3D, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { STONE_FLOOR_COLORS, STONE_FLOOR_HEIGHTS, STONE_OUTER_WARNING_SECONDS, STONE_STEP_DELAY, STONE_TILE_SIZE } from './layout'
import type { StoneTile } from './protocol'
import { stoneTileEpoch, updateStoneTileMarks } from './tileBuffers'
import { StoneRenderClock } from './motion'

// 얇은 돌판의 측면·깎인 돌 테두리·투명 중앙을 같은 메시로 그린다. 층당 한 draw call.
const STONE_DEPTH = .48
function tileSurface(material: MeshBasicMaterial, clock: { value: number }) {
  const surface = material.clone()
  surface.onBeforeCompile = shader => {
    shader.uniforms.stoneInk = { value: new Color('#393d35') }
    shader.uniforms.stoneBase = { value: new Color('#ffffff') }
    shader.uniforms.stoneRim = { value: new Color('#e4e1cc') }
    shader.uniforms.stoneWarningInk = { value: new Color('#6b2c19') }
    shader.uniforms.stoneWarning = { value: new Color('#d66b43') }
    shader.uniforms.stoneStepped = { value: new Color('#eeb348') }
    shader.uniforms.stoneUrgent = { value: new Color('#e05a35') }
    shader.uniforms.stoneTime = clock
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 stoneMark;
      uniform float stoneTime;
      varying vec2 vStoneUv;
      varying vec2 vStoneMark;
      varying float vStoneSide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStoneUv = uv;
        float remaining = stoneMark.y - stoneTime;
        float fallen = max(0.0, -remaining);
        transformed *= 1.0 - step(0.65, fallen);
        transformed.z -= fallen * fallen * 15.0;
        vStoneMark = vec2(mix((1.0 - step(${STONE_OUTER_WARNING_SECONDS.toFixed(1)}, remaining)) * 2.0, 1.0, stoneMark.x), clamp(remaining / ${(STONE_STEP_DELAY / 1000).toFixed(1)}, 0.0, 1.0));
        vStoneSide = 1.0 - abs(normal.z);`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 stoneInk;
      uniform vec3 stoneBase;
      uniform vec3 stoneRim;
      uniform vec3 stoneWarningInk;
      uniform vec3 stoneWarning;
      uniform vec3 stoneStepped;
      uniform vec3 stoneUrgent;
      varying vec2 vStoneUv;
      varying vec2 vStoneMark;
      varying float vStoneSide;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float edge = min(min(vStoneUv.x, 1.0 - vStoneUv.x), min(vStoneUv.y, 1.0 - vStoneUv.y));
        float aa = max(fwidth(edge), 0.0006);
        float border = 1.0 - smoothstep(0.115 - aa, 0.115 + aa, edge);
        float outerLip = 1.0 - smoothstep(0.012 - aa, 0.012 + aa, edge);
        float innerBevel = smoothstep(0.090 - aa, 0.112 + aa, edge);
        float marked = step(0.5, vStoneMark.x);
        float stepped = marked * (1.0 - step(1.5, vStoneMark.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(stoneWarning, mix(stoneStepped, stoneUrgent, 1.0 - step(${(400 / STONE_STEP_DELAY).toFixed(3)}, vStoneMark.y)), stepped), marked);
        float inset = mix(0.35, 0.13, clamp(vStoneMark.y, 0.0, 1.0));
        float countdownLine = stepped * (1.0 - smoothstep(0.009 - aa, 0.009 + aa, abs(edge - inset)));
        vec2 nearest = min(vStoneUv, 1.0 - vStoneUv);
        vec2 edgeNormal = mix(vec2(0.0, sign(vStoneUv.y - 0.5)), vec2(sign(vStoneUv.x - 0.5), 0.0), step(nearest.x, nearest.y));
        float bevelLight = 0.88 + dot(edgeNormal, vec2(-0.2, 0.25));
        vec3 stone = mix(diffuseColor.rgb, stoneBase, 0.11);
        vec3 rimColor = mix(stone * bevelLight, mix(stoneInk, stoneWarningInk, marked), max(outerLip, innerBevel * 0.65));
        float outlineAlpha = min(1.0, opacity * 3.0);
        float fillAlpha = min(0.8, opacity * mix(0.5, 2.1, marked));
        diffuseColor.rgb = mix(diffuseColor.rgb, rimColor, border);
        diffuseColor.rgb = mix(diffuseColor.rgb, stoneRim, countdownLine);
        diffuseColor.a = max(fillAlpha, max(border, countdownLine) * outlineAlpha);
        if (vStoneSide > 0.5) {
          diffuseColor.rgb = stone * 0.52;
          diffuseColor.a = outlineAlpha;
        }`)
  }
  surface.customProgramCacheKey = () => 'stone-chiseled-frame-v6-two-second-grace'
  return surface
}
function TileLayer({ tiles, material, time, hidden, current, floor }: {
  tiles: StoneTile[]; material: MeshBasicMaterial; time: number; hidden: boolean; current: boolean; floor: number
}) {
  const stones = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Object3D(), []), color = useMemo(() => new Color(), [])
  // 실제 서버 시각은 epoch ms다. float32에서 짧은 경고/낙하를 잃지 않도록 같은 기준점을 뺀다.
  const epoch = stoneTileEpoch(time)
  const clock = useMemo(() => ({ value: 0 }), [])
  const renderClock = useMemo(() => new StoneRenderClock(), [])
  const surface = useMemo(() => tileSurface(material, clock), [material, clock])
  const { panel, marks } = useMemo(() => {
    const panel = new BoxGeometry(STONE_TILE_SIZE - .1, STONE_TILE_SIZE - .1, STONE_DEPTH)
    const marks = new InstancedBufferAttribute(new Float32Array(tiles.length * 2), 2).setUsage(DynamicDrawUsage)
    panel.setAttribute('stoneMark', marks)
    return { panel, marks }
  }, [tiles.length])
  useEffect(() => () => surface.dispose(), [surface])
  useEffect(() => () => panel.dispose(), [panel])
  useLayoutEffect(() => {
    if (!stones.current) return
    // 서버 격자 좌표는 경기 중 불변이다. 위치 행렬/기본 돌 색은 생성 시 한 번만 업로드한다.
    tiles.forEach((tile, index) => {
      transform.position.set(STONE_TILE_SIZE * tile.q, STONE_FLOOR_HEIGHTS[tile.floor]! - .015 - STONE_DEPTH / 2, STONE_TILE_SIZE * tile.r)
      transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(1)
      transform.updateMatrix(); stones.current!.setMatrixAt(index, transform.matrix)
      color.set(STONE_FLOOR_COLORS[floor]!).multiplyScalar(.93 + Math.abs(tile.q * 17 + tile.r * 31 + floor * 7) % 7 * .023)
      stones.current!.setColorAt(index, color)
    })
    stones.current.instanceMatrix.needsUpdate = true
    if (stones.current.instanceColor) stones.current.instanceColor.needsUpdate = true
  }, [panel, color, transform, floor])
  useLayoutEffect(() => { updateStoneTileMarks(marks, tiles, epoch) }, [marks, tiles, epoch])
  useFrame(() => {
    surface.opacity = current ? .46 : .11
    // Use the avatar's render timeline for the falling stones too. Stop at the
    // latest authoritative time when packets pause instead of predicting a break.
    clock.value = (renderClock.sample(time, performance.now()) - epoch) / 1000
  })
  return <group visible={!hidden} userData={{ prepareWhenHidden: true }}>
    <instancedMesh ref={stones} args={[panel, surface, tiles.length]} renderOrder={floor + 10} userData={{ stoneTile: true }} frustumCulled={false} dispose={null} />
  </group>
}
export function StoneRumbleTiles({ tiles, material, time, ownFloor }: {
  tiles: StoneTile[]; material: MeshBasicMaterial; time: number; ownFloor: number
}) {
  const layers = useMemo(() => [0, 1, 2].map(floor => tiles.filter(tile => tile.floor === floor)), [tiles])
  return <group name="stone-rumble-tiles">{layers.map((layer, floor) => <TileLayer key={floor} tiles={layer} material={material} time={time} hidden={floor > ownFloor} current={floor === ownFloor} floor={floor} />)}</group>
}
