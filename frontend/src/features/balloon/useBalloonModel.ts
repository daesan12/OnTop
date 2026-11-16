import { useLayoutEffect, type RefObject } from 'react'
import { Mesh, type BufferGeometry, type Group, type Material } from 'three'
import { factory } from '../../../park-renewal-preview/assetFactories'
import { CABIN_FLOOR_HEIGHT } from './cabin'

export function useBalloonModel(root: RefObject<Group | null>) {
  useLayoutEffect(() => {
    const parent = root.current
    if (!parent) return
    const balloon = factory('balloon', { cabinFloorY: CABIN_FLOOR_HEIGHT })
    parent.add(balloon)

    return () => {
      parent.remove(balloon)
      const geometries = new Set<BufferGeometry>()
      const materials = new Set<Material>()
      balloon.traverse(object => {
        if (!(object instanceof Mesh)) return
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    }
  }, [root])
}
