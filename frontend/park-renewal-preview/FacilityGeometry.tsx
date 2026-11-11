import { useLayoutEffect } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { Mesh } from 'three'
import type { Object3D } from 'three'
import { ParkAssetLoader } from '../src/world/art/assetLoader'

const geometryUrls = {
  tower: new URL('./models/facility-tower-optimized.glb', import.meta.url).href,
  mole: new URL('./models/facility-mole-optimized.glb', import.meta.url).href,
  shooting: new URL('./models/facility-shooting-optimized.glb', import.meta.url).href,
  folk: new URL('./models/facility-folk-optimized.glb', import.meta.url).href,
  arcade: new URL('./models/facility-arcade-optimized.glb', import.meta.url).href,
}

export type GeometryFacility = keyof typeof geometryUrls

export function hasFacilityGeometry(id: string): id is GeometryFacility {
  return Object.hasOwn(geometryUrls, id)
}

export function facilityGeometryRoot(id: GeometryFacility) {
  return id === 'tower' ? 'forty-metre-tower' : 'facility-' + id
}

function triangleCount(mesh: Mesh) {
  return (mesh.geometry.index?.count ?? mesh.geometry.attributes.position!.count) / 3
}

export function facilityGeometryMeshes(root: Object3D, id: GeometryFacility) {
  const groups = id === 'arcade' || id === 'mole'
    ? root.children.filter(child => child.name.startsWith('approved-' + id + '-'))
    : [root]
  const meshes: Mesh[] = []
  for (const group of groups) {
    group.traverse(node => {
      if (node instanceof Mesh && !Array.isArray(node.material) && triangleCount(node) >= 24) {
        meshes.push(node)
      }
    })
  }
  return meshes
}

export function FacilityGeometry({ id }: { id: GeometryFacility }) {
  const { scene, invalidate } = useThree()
  const gltf = useLoader(ParkAssetLoader, geometryUrls[id])

  useLayoutEffect(() => {
    const root = scene.getObjectByName(facilityGeometryRoot(id))
    if (!root) return

    const meshes = facilityGeometryMeshes(root, id)
    const parts: Mesh[] = []
    gltf.scene.traverse(node => {
      if (node instanceof Mesh) parts.push(node)
    })
    const compatible = parts.length === meshes.length && meshes.every((mesh, index) => {
      const part = parts[index]
      return part && part.name === 'part-' + index
        && part.userData.sourceTriangles === triangleCount(mesh)
        && part.userData.sourceVertices === mesh.geometry.attributes.position!.count
        && Object.keys(mesh.geometry.attributes).every(name => part.geometry.hasAttribute(name))
    })
    if (!compatible) {
      console.warn('Park preview geometry is out of sync:', id)
      return
    }

    // Keep the original material, transforms, object identity and instance data.
    const original = meshes.map(mesh => mesh.geometry)
    meshes.forEach((mesh, index) => { mesh.geometry = parts[index]!.geometry })
    invalidate()
    return () => {
      meshes.forEach((mesh, index) => { mesh.geometry = original[index]! })
    }
  }, [gltf, id, invalidate, scene])

  return null
}
