import { useLayoutEffect, useState } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { Mesh } from 'three'
import type { Object3D } from 'three'
import { ParkAssetLoader } from '../src/world/art/assetLoader'
import { optimizedGeometryMatchesSource } from './optimizedGeometrySource'
import { useGeometrySourceVersion } from './geometrySourceReady'

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
      if (node instanceof Mesh && !node.userData.distanceProxy && !node.userData.winterSnow
        && !Array.isArray(node.material) && triangleCount(node) >= 24) {
        meshes.push(node)
      }
    })
  }
  return meshes
}

export function FacilityGeometry({ id }: { id: GeometryFacility }) {
  const { scene } = useThree()
  const [accepted, setAccepted] = useState<GeometryFacility | null>(null)
  const sourceVersion = useGeometrySourceVersion(scene)
  useLayoutEffect(() => {
    // Once replaced, the scene contains optimized geometry rather than sources.
    if (accepted === id) return
    const root = scene.getObjectByName(facilityGeometryRoot(id))
    const sources = root ? facilityGeometryMeshes(root, id).map(mesh => mesh.geometry) : []
    if (!optimizedGeometryMatchesSource(`facility-${id}-optimized.glb`, sources)) {
      performance.mark('park-facility-geometry-skipped-' + id)
      return
    }
    setAccepted(id)
  }, [accepted, id, scene, sourceVersion])
  return accepted === id ? <LoadedFacilityGeometry id={id} /> : null
}

function LoadedFacilityGeometry({ id }: { id: GeometryFacility }) {
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
