import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DynamicDrawUsage, InstancedBufferAttribute, Object3D, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { STONE_FLOOR_COLORS, STONE_FLOOR_HEIGHTS, STONE_STEP_DELAY, stoneTileX, stoneTileZ } from './layout'
import type { StoneTile } from './protocol'
import { stoneTileEpoch, updateStoneTileMarks } from './tileBuffers'
import { StoneRenderClock } from './motion'
import { createStoneTileGeometry, STONE_PANEL_RADIUS } from './tileGeometry'

function tileSurface(material: MeshBasicMaterial, clock: { value: number }) {
  const surface = material.clone()
  surface.opacity = 1
  surface.transparent = false
  surface.depthWrite = true
  surface.onBeforeCompile = shader => {
    shader.uniforms.stoneTime = clock
    shader.uniforms.stoneStepped = { value: new Color('#fff7e6') }
    shader.uniforms.stoneUrgent = { value: new Color('#e77c65') }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 stoneMark;
      uniform float stoneTime;
      varying vec2 vStonePoint;
      varying vec2 vStoneMark;
      varying float vStoneShade;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStonePoint = position.xy / ${STONE_PANEL_RADIUS.toFixed(8)};
        float remaining = stoneMark.y - stoneTime;
        // 충돌이 사라진 발판이 추가 0.65초 동안 남아 보이지 않게 한다.
        transformed *= step(0.0001, remaining);
        vStoneMark = vec2(max(stoneMark.x, 1.0 - step(1.001, remaining)), clamp(remaining / ${(STONE_STEP_DELAY / 1000).toFixed(1)}, 0.0, 1.0));
        vec3 stoneNormal = normal;
        #ifdef USE_INSTANCING
          stoneNormal = mat3(instanceMatrix) * stoneNormal;
        #endif
        stoneNormal = normalize(mat3(modelMatrix) * stoneNormal);
        // 면 방향으로 입체감을 주고, 그림자용 추가 패스나 텍스처는 늘리지 않는다.
        vStoneShade = 0.32 + 0.68 * max(dot(stoneNormal, normalize(vec3(-0.45, 0.8, 0.4))), 0.0);`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 stoneStepped;
      uniform vec3 stoneUrgent;
      varying vec2 vStonePoint;
      varying vec2 vStoneMark;
      varying float vStoneShade;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hex = max(abs(vStonePoint.x), max(abs(dot(vStonePoint, vec2(0.5, 0.8660254))), abs(dot(vStonePoint, vec2(-0.5, 0.8660254)))));
        float aa = max(fwidth(hex), 0.0006);
        float marked = step(0.5, vStoneMark.x);
        float stepped = marked;
        vec3 warning = mix(stoneStepped, stoneUrgent, 1.0 - step(0.3, vStoneMark.y));
        vec3 stone = mix(diffuseColor.rgb, warning, marked);
        float countdown = stepped * (1.0 - smoothstep(0.012 - aa, 0.012 + aa, abs(hex - mix(0.12, 0.72, vStoneMark.y))));
        diffuseColor.rgb = mix(stone, vec3(1.0, 0.98, 0.88), countdown * 0.9) * vStoneShade;
        diffuseColor.a = opacity;`)
  }
  surface.customProgramCacheKey = () => 'stone-hex-faceted-deadline-v3'
  return surface
}

function TileLayer({ tiles, material, time, hidden, floor }: {
  tiles: StoneTile[]; material: MeshBasicMaterial; time: number; hidden: boolean; floor: number
}) {
  const stones = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Object3D(), []), color = useMemo(() => new Color(), [])
  const epoch = stoneTileEpoch(time)
  const clock = useMemo(() => ({ value: 0 }), [])
  const renderClock = useMemo(() => new StoneRenderClock(), [])
  const surface = useMemo(() => tileSurface(material, clock), [material, clock])
  const { panel, marks } = useMemo(() => {
    const panel = createStoneTileGeometry()
    const marks = new InstancedBufferAttribute(new Float32Array(tiles.length * 2), 2).setUsage(DynamicDrawUsage)
    panel.setAttribute('stoneMark', marks)
    return { panel, marks }
  }, [tiles.length])
  useEffect(() => () => surface.dispose(), [surface])
  useEffect(() => () => panel.dispose(), [panel])
  useLayoutEffect(() => {
    if (!stones.current) return
    // 좌표와 기본색은 불변이므로 시간 갱신마다 전체 행렬을 전송하지 않는다.
    tiles.forEach((tile, index) => {
      transform.position.set(stoneTileX(tile.q, tile.r), STONE_FLOOR_HEIGHTS[tile.floor]! - .015, stoneTileZ(tile.r))
      transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(1)
      transform.updateMatrix(); stones.current!.setMatrixAt(index, transform.matrix)
      color.set(STONE_FLOOR_COLORS[floor]!).multiplyScalar(.95 + Math.abs(tile.q * 17 + tile.r * 31 + floor * 7) % 7 * .015)
      stones.current!.setColorAt(index, color)
    })
    stones.current.instanceMatrix.needsUpdate = true
    if (stones.current.instanceColor) stones.current.instanceColor.needsUpdate = true
  }, [panel, color, transform, floor])
  useLayoutEffect(() => { updateStoneTileMarks(marks, tiles, epoch) }, [marks, tiles, epoch])
  useFrame(() => {
    clock.value = (renderClock.sample(time, performance.now()) - epoch) / 1000
  })
  return <group visible={!hidden} userData={{ prepareWhenHidden: true }}>
    <instancedMesh ref={stones} args={[panel, surface, tiles.length]} renderOrder={10 - floor} userData={{ stoneTile: true }} frustumCulled={false} dispose={null} />
  </group>
}

export function StoneRumbleTiles({ tiles, material, time, ownFloor }: {
  tiles: StoneTile[]; material: MeshBasicMaterial; time: number; ownFloor: number
}) {
  const layers = useMemo(() => STONE_FLOOR_HEIGHTS.map((_, floor) => tiles.filter(tile => tile.floor === floor)), [tiles])
  return <group name="stone-rumble-tiles">{layers.map((layer, floor) => <TileLayer key={floor} tiles={layer} material={material} time={time} hidden={floor > ownFloor} floor={floor} />)}</group>
}
