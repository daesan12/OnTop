import { useLayoutEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { Mesh, type LOD } from 'three'
import { ParkAssetLoader } from './assetLoader'

/** Local Meshopt decoder and one cached texture/geometry set per URL.
 * Only scene nodes are cloned; the cache owns GPU resource lifetime.
 */
export function ImportedProp({
  url,
  prefix,
  distance,
}: {
  url: string
  prefix: string
  distance: number
}) {
  const gltf = useLoader(ParkAssetLoader, url)
  const lod = useRef<LOD>(null)
  const levels = useMemo(
    () =>
      ['detail', 'distant'].map((suffix) => {
        const source = gltf.scene.getObjectByName(`${prefix}-${suffix}`)
        if (!source) throw new Error(`Missing ${prefix}-${suffix} in ${url}`)
        const object = source.clone(true)
        object.traverse((child) => {
          if (child instanceof Mesh) {
            child.castShadow = suffix === 'detail'
            child.receiveShadow = true
          }
        })
        return object
      }),
    [gltf, prefix, url],
  )
  useLayoutEffect(() => {
    const current = lod.current!
    current.addLevel(levels[0]!, 0)
    current.addLevel(levels[1]!, distance, 0.15)
    return () => {
      current.levels.length = 0
    }
  }, [levels, distance])
  return (
    <lOD ref={lod} name={`${prefix}-lod`} dispose={null}>
      {levels.map((object) => (
        <primitive key={object.name} object={object} dispose={null} />
      ))}
    </lOD>
  )
}
