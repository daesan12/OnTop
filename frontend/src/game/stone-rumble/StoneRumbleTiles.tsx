import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DynamicDrawUsage, ExtrudeGeometry, InstancedBufferAttribute, Object3D, Shape, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { STONE_FLOOR_COLORS, STONE_FLOOR_HEIGHTS, STONE_OUTER_WARNING_SECONDS, STONE_STEP_DELAY, STONE_TILE_RADIUS, stoneTileX, stoneTileZ } from './layout'
import type { StoneTile } from './protocol'
import { stoneTileEpoch, updateStoneTileMarks } from './tileBuffers'
import { StoneRenderClock } from './motion'

const STONE_DEPTH = .42
const BEVEL = .025
const PANEL_RADIUS = STONE_TILE_RADIUS - .035

// 육각 상판과 측면을 합쳐 층마다 한 번만 인스턴스 렌더링한다.
function tileGeometry() {
  const shape = new Shape()
  for (let vertex = 0; vertex < 6; vertex++) {
    const angle = Math.PI / 6 + vertex * Math.PI / 3
    const x = Math.cos(angle) * PANEL_RADIUS, y = Math.sin(angle) * PANEL_RADIUS
    if (vertex === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: STONE_DEPTH, steps: 1, bevelEnabled: true,
    bevelSegments: 1, bevelSize: BEVEL, bevelThickness: BEVEL, curveSegments: 1 })
  geometry.translate(0, 0, -STONE_DEPTH / 2)
  return geometry
}

function tileSurface(material: MeshBasicMaterial, clock: { value: number }) {
  const surface = material.clone()
  surface.onBeforeCompile = shader => {
    shader.uniforms.stoneTime = clock
    shader.uniforms.stoneInk = { value: new Color('#454a3c') }
    shader.uniforms.stoneWarning = { value: new Color('#df7650') }
    shader.uniforms.stoneStepped = { value: new Color('#f4cc68') }
    shader.uniforms.stoneUrgent = { value: new Color('#e77c65') }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 stoneMark;
      uniform float stoneTime;
      varying vec2 vStonePoint;
      varying vec2 vStoneMark;
      varying float vStoneSide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStonePoint = position.xy / ${PANEL_RADIUS.toFixed(8)};
        float remaining = stoneMark.y - stoneTime;
        float fallen = max(0.0, -remaining);
        transformed *= 1.0 - step(0.65, fallen);
        transformed.z -= fallen * fallen * 15.0;
        vStoneMark = vec2(mix((1.0 - step(${STONE_OUTER_WARNING_SECONDS.toFixed(1)}, remaining)) * 2.0, 1.0, stoneMark.x), clamp(remaining / ${(STONE_STEP_DELAY / 1000).toFixed(1)}, 0.0, 1.0));
        vStoneSide = 1.0 - abs(normal.z);`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 stoneInk;
      uniform vec3 stoneWarning;
      uniform vec3 stoneStepped;
      uniform vec3 stoneUrgent;
      varying vec2 vStonePoint;
      varying vec2 vStoneMark;
      varying float vStoneSide;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hex = max(abs(vStonePoint.x), max(abs(dot(vStonePoint, vec2(0.5, 0.8660254))), abs(dot(vStonePoint, vec2(-0.5, 0.8660254)))));
        float edge = 0.8660254 - hex;
        float aa = max(fwidth(edge), 0.0006);
        float border = 1.0 - smoothstep(0.035 - aa, 0.035 + aa, edge);
        float bevel = 1.0 - smoothstep(0.09 - aa, 0.09 + aa, edge);
        float marked = step(0.5, vStoneMark.x);
        float stepped = marked * (1.0 - step(1.5, vStoneMark.x));
        vec3 warning = mix(stoneWarning, mix(stoneStepped, stoneUrgent, 1.0 - step(0.3, vStoneMark.y)), stepped);
        vec3 stone = mix(diffuseColor.rgb, warning, marked);
        stone = mix(stone, vec3(1.0), 0.08 + 0.1 * bevel);
        stone = mix(stone, stoneInk, border * 0.7);
        float countdown = stepped * (1.0 - smoothstep(0.012 - aa, 0.012 + aa, abs(hex - mix(0.12, 0.72, vStoneMark.y))));
        diffuseColor.rgb = mix(stone, vec3(1.0, 0.98, 0.88), countdown * 0.9);
        if (vStoneSide > 0.5) diffuseColor.rgb = stone * 0.58;
        diffuseColor.a = opacity;`)
  }
  surface.customProgramCacheKey = () => 'stone-hex-bevel-v1'
  return surface
}

function TileLayer({ tiles, material, time, hidden, current, floor }: {
  tiles: StoneTile[]; material: MeshBasicMaterial; time: number; hidden: boolean; current: boolean; floor: number
}) {
  const stones = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Object3D(), []), color = useMemo(() => new Color(), [])
  const epoch = stoneTileEpoch(time)
  const clock = useMemo(() => ({ value: 0 }), [])
  const renderClock = useMemo(() => new StoneRenderClock(), [])
  const surface = useMemo(() => tileSurface(material, clock), [material, clock])
  const { panel, marks } = useMemo(() => {
    const panel = tileGeometry()
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
      transform.position.set(stoneTileX(tile.q, tile.r), STONE_FLOOR_HEIGHTS[tile.floor]! - .015 - STONE_DEPTH / 2 - BEVEL, stoneTileZ(tile.r))
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
    surface.opacity = current ? 1 : .52
    surface.depthWrite = current
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
