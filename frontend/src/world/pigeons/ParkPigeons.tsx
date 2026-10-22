import { CompactInstances } from './compactInstances'
import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4, Object3D, type InstancedMesh } from 'three'
import { MOVEMENT, groundHeight, type QualityPreset } from '../../config'
import { avatars } from '../../network/worldClient'
import {
  createBirds,
  PIGEON,
  PIGEON_SITES,
  stepBird,
  type Visitor,
} from './pigeonSimulation'
import {
  pigeonGeometry,
  pigeonMaterial,
  pigeonShadowMaterial,
} from './pigeonGeometry'

const parts = [
  'body',
  'head',
  'folded',
  'leftWing',
  'rightWing',
  'foot',
  'foot',
  'shadow',
] as const
/** Local ambient wildlife reacts to replicated movement of every nearby visitor. */
export function ParkPigeons({ quality }: { quality: QualityPreset }) {
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const batches = useRef<CompactInstances[]>([])
  const state = useMemo(
    () => ({
      birds: PIGEON_SITES.flatMap((_, i) => createBirds(i)),
      visitors: Array.from(
        { length: 16 },
        () => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0 }) as Visitor,
      ),
      active: [] as Visitor[],
      root: new Object3D(),
      part: new Object3D(),
      matrix: new Matrix4(),
      time: 0,
      colors: [
        new Color('#d1d7e1'),
        new Color('#ffffff'),
        new Color('#e3e0db'),
      ],
    }),
    [],
  )
  useLayoutEffect(() => {
    batches.current = meshes.current.map((mesh) => new CompactInstances(mesh!))
  }, [state])
  useFrame(({ camera }, delta) => {
    const dt = Math.min(0.05, delta)
    state.time += dt
    state.active.length = 0
    const now = performance.now()
    let n = 0
    for (const a of avatars.values()) {
      if (n >= state.visitors.length) break
      if (!a.connected) continue
      const dx = a.current.x - a.previous.x,
        dz = a.current.z - a.previous.z,
        distance = Math.hypot(dx, dz)
      const p = state.visitors[n++]
      p.x = a.current.x
      p.y = a.current.y
      p.z = a.current.z
      const running =
        a.running &&
        a.moving &&
        !a.swimming &&
        !a.benchId &&
        !a.tableId &&
        !a.fitnessId &&
        !a.telescopeId &&
        now - a.at < 400 &&
        distance >= 0.015 &&
        distance < 3
      p.vx = running ? (dx / distance) * MOVEMENT.runSpeed : 0
      p.vz = running ? (dz / distance) * MOVEMENT.runSpeed : 0
      state.active.push(p)
    }
    for (const batch of batches.current) batch.begin()
    state.birds.forEach((b, i) => {
      stepBird(
        b,
        dt,
        state.active,
        PIGEON_SITES[Math.floor(i / PIGEON.countPerFlock)],
      )
      const flight = b.mode === 'fly',
        walking = b.mode === 'walk',
        t = state.time + b.phase
      const peck =
        b.mode === 'idle' ? Math.max(0, Math.sin(b.age * 3 + b.phase)) ** 8 : 0
      const visible =
        Math.hypot(camera.position.x - b.x, camera.position.z - b.z) <
        (quality === 'low' ? 42 : 70)
      if (!visible) return
      state.root.position.set(b.x, b.y, b.z)
      state.root.rotation.set(flight ? -0.1 : 0, b.yaw, 0)
      state.root.scale.setScalar(1)
      state.root.updateMatrix()
      for (let k = 0; k < parts.length; k++) {
        if ((k === 2 || k === 7) && flight) continue
        if ((k === 3 || k === 4) && !flight) continue
        const part = state.part
        part.position.set(0, 0, 0)
        part.rotation.set(0, 0, 0)
        part.scale.set(1, 1, 1)
        if (k === 1) {
          part.position.set(
            0,
            0.187 - (walking ? Math.sin(t * 13) * 0.004 : peck * 0.035),
            0.064,
          )
          part.rotation.x = peck * 0.95
        }
        if (k === 3 || k === 4) {
          const side = k === 3 ? -1 : 1
          part.position.set(side * 0.062, 0.18, 0.005)
          part.rotation.z = side * (0.2 + Math.sin(t * 38) * 0.85)
        }
        if (k === 5 || k === 6) {
          const side = k === 5 ? -1 : 1
          part.position.set(side * 0.03, 0.055, -0.005)
          part.rotation.x = flight
            ? -0.9
            : walking
              ? Math.sin(t * 13 + (side * Math.PI) / 2) * 0.48
              : 0
        }
        part.updateMatrix()
        state.matrix.multiplyMatrices(state.root.matrix, part.matrix)
        if (k === 7) {
          part.position.set(b.x, groundHeight(b.x, b.z) + 0.079, b.z)
          part.rotation.set(-Math.PI / 2, 0, -b.yaw)
          part.scale.set(0.24, 0.36, 1)
          part.updateMatrix()
          state.matrix.copy(part.matrix)
        }
        batches.current[k].write(i, state.matrix, state.colors[i % 3])
      }
    })
    for (const batch of batches.current) batch.finish()
  })
  return (
    <group name="park-pigeons" dispose={null}>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          name={`pigeons-${part}-${i}`}
          ref={(m) => {
            meshes.current[i] = m
          }}
          args={[
            pigeonGeometry[part],
            part === 'shadow' ? pigeonShadowMaterial : pigeonMaterial,
            state.birds.length,
          ]}
          receiveShadow
        />
      ))}
    </group>
  )
}
