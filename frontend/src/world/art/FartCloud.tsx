import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry, MeshBasicMaterial, type Mesh } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { NETWORK } from '../../config'
import { avatars, estimatedServerTime } from '../../network/worldClient'

const pieces = [
  [0, 0, 0, 0.36],
  [-0.3, 0.08, 0, 0.27],
  [0.27, 0.13, -0.07, 0.3],
].map(([x, y, z, r]) => new IcosahedronGeometry(r, 1).translate(x!, y!, z!))
const cloud = mergeGeometries(pieces)!
pieces.forEach((g) => g.dispose())

/** A single small mesh per active puff, driven by the public server emote time. */
export function FartCloud({ id }: { id: string }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#bacb78',
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    const avatar = avatars.get(id),
      mesh = ref.current
    if (!mesh) return
    const age = avatar ? estimatedServerTime() - avatar.emoteAt : -1
    mesh.visible =
      !!avatar?.connected &&
      avatar.emote === 'EMOTE_FART' &&
      age >= 180 &&
      age < NETWORK.emoteDurationMs
    if (!mesh.visible) return
    const progress = (age - 180) / (NETWORK.emoteDurationMs - 180)
    mesh.position.set(
      Math.sin(progress * 7) * 0.08,
      0.65 + progress * 0.35,
      -0.5 - progress * 1.1,
    )
    mesh.scale.setScalar(0.35 + progress * 1.6)
    material.opacity = Math.sin(Math.PI * progress) * 0.48
  })
  return (
    <mesh
      ref={ref}
      name={`fart-${id}`}
      geometry={cloud}
      material={material}
      visible={false}
      dispose={null}
    />
  )
}
