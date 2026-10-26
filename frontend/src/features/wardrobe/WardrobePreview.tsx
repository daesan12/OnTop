import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import type { Group } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls, createCharacterRig } from '../../world/art/CharacterRig'
import { createAvatarMotion } from '../../world/avatarMotion'
import { avatars, estimatedServerTime, useSession } from '../../network/worldClient'

/** Own character on a small stage. Same GLB cache, rig and idle motion as the park avatar;
 * outfits are baked into the current texture, so equipment does not change the mesh yet. */
function Character({ yaw }: { yaw: { current: number } }) {
  const own = useSession(s => s.sessionId)
  const variant = useSession(s => s.profiles[s.sessionId]?.character ?? 'man')
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const model = useMemo(() => createCharacterRig(sources[variant === 'girl' ? 1 : 0]!), [sources, variant])
  const motion = useMemo(() => createAvatarMotion(model), [model])
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const turn = useRef<Group>(null), figure = useRef<Group>(null)
  useEffect(() => () => model.dispose(), [model])
  useFrame((_, delta) => {
    if (!turn.current || !figure.current) return
    turn.current.rotation.y += (yaw.current - turn.current.rotation.y) * Math.min(1, delta * 10)
    const avatar = avatars.get(own)
    if (avatar) motion.apply({ ...avatar, moving: false, running: false, swimming: false }, estimatedServerTime(), delta, pose, figure.current)
    else { model.reset(); model.apply(delta) }
  })
  return <group ref={turn}>
    <group ref={figure}><primitive object={model.root} dispose={null} /></group>
  </group>
}

export function WardrobePreview({ yaw }: { yaw: { current: number } }) {
  return <Canvas className="wardrobe-stage__canvas" dpr={[1, 2]} gl={{ alpha: true, antialias: true }}
    camera={{ position: [0, 1.05, 3.4], fov: 32, near: 0.1, far: 20 }}
    onCreated={({ camera }) => camera.lookAt(0, 0.85, 0)}>
    <hemisphereLight args={['#fff8ec', '#6b6450', 1.6]} />
    <directionalLight position={[2.5, 4, 3]} intensity={1.8} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      <ringGeometry args={[0.55, 0.68, 64]} />
      <meshBasicMaterial color="#8fd4a8" transparent opacity={0.55} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.55, 64]} />
      <meshBasicMaterial color="#1f1d18" transparent opacity={0.18} />
    </mesh>
    <Suspense fallback={null}><Character yaw={yaw} /></Suspense>
  </Canvas>
}
