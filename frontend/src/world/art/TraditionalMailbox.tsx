import { useLayoutEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { Box3, Mesh, Vector3, type LOD } from 'three'
import { ParkAssetLoader } from './assetLoader'
import { MAILBOX } from '../../config'
import { mailboxUrl } from '../worldAssets'

/** User supplied GLB, with original PBR maps and two derived mesh LODs. */
export function TraditionalMailbox() {
  const gltf = useLoader(ParkAssetLoader, mailboxUrl)
  const lod = useRef<LOD>(null)
  const model = useMemo(() => {
    const bounds = new Box3().setFromObject(gltf.scene)
    const center = bounds.getCenter(new Vector3())
    const scale = MAILBOX.height / bounds.getSize(new Vector3()).y
    const levels = ['mailbox-detail', 'mailbox-distant'].map((name) => {
      const source = gltf.scene.getObjectByName(name)
      if (!source) throw new Error('소리함 모델의 LOD를 읽을 수 없습니다.')
      const object = source.clone(true)
      object.traverse((node) => {
        if (node instanceof Mesh) {
          node.castShadow = true
          node.receiveShadow = true
        }
      })
      return object
    })
    return {
      levels,
      scale,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [gltf])
  useLayoutEffect(() => {
    const current = lod.current!
    current.addLevel(model.levels[0]!, 0)
    current.addLevel(model.levels[1]!, 18, 0.15)
    return () => {
      current.levels.length = 0
    }
  }, [model])
  return (
    <group
      name="feedback-mailbox"
      position={[MAILBOX.x, 0, MAILBOX.z]}
      userData={{
        assetId: 'user/red-mailbox',
        source: 'red+mailbox+3d+model.glb',
      }}
    >
      <group scale={model.scale}>
        <group position={model.offset}>
          <lOD ref={lod} dispose={null}>
            {model.levels.map((object) => (
              <primitive key={object.name} object={object} dispose={null} />
            ))}
          </lOD>
        </group>
      </group>
    </group>
  )
}
