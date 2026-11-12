import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Mesh } from 'three'
import { gradeFountainCourses } from './fountainAccessGeometry'
import { ParkAssetLoader } from '../src/world/art/assetLoader'
import { parkDetailIds, parkDetailMeshes, type ParkDetailId } from './parkDetailMeshes'
import { LakePart, LakeStage } from './lakeStages'

const urls = import.meta.glob<string>('./models/detail-*-optimized.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})
const profile = new URLSearchParams(window.location.search)

function DetailGeometry({ id, url, pending }: { id: ParkDetailId; url: string; pending?: Set<() => void> }) {
  const { scene, invalidate } = useThree()
  const { scene: gltfScene } = useLoader(ParkAssetLoader, url)

  useLayoutEffect(() => {
    if (!pending) return applyGeometry()
    let restore: (() => void) | undefined
    const apply = () => { restore = applyGeometry() }
    pending.add(apply)
    return () => {
      pending.delete(apply)
      restore?.()
    }

    function applyGeometry() {
      const groups = parkDetailMeshes(scene, id)
      const parts: Mesh[] = []
      gltfScene.traverse(node => {
        if (node instanceof Mesh) parts.push(node)
      })
      const compatible = groups.length === parts.length && groups.every(({ source }, index) => {
        const part = parts[index]!
        const vertices = source.attributes.position!.count
        return part.name === 'part-' + index
          && part.userData.sourceTriangles === (source.index?.count ?? vertices) / 3
          && part.userData.sourceVertices === vertices
          && Object.keys(source.attributes).every(name =>
            part.geometry.hasAttribute(name) || part.geometry.hasAttribute('_' + name.toLowerCase()))
      })
      if (!compatible) {
        console.warn('Park detail geometry is out of sync:', id)
        return
      }

      const restore = groups.flatMap(({ source, meshes }, index) => {
        const { geometry } = parts[index]!
        for (const name of Object.keys(source.attributes)) {
          if (!geometry.hasAttribute(name)) {
            geometry.setAttribute(name, geometry.getAttribute('_' + name.toLowerCase()))
          }
        }
        return meshes.map(mesh => {
          const originalRaycast = mesh.raycast
          const visibleGeometry = id === 'fountain' && mesh.parent?.name === 'fountain-stone-courses'
            ? gradeFountainCourses(geometry) : geometry
          mesh.geometry = visibleGeometry
          // Picking and walkable surfaces retain the original triangle data.
          mesh.raycast = function (raycaster, hits) {
            this.geometry = source
            try {
              originalRaycast.call(this, raycaster, hits)
            } finally {
              this.geometry = visibleGeometry
            }
          }
          return () => {
            mesh.geometry = source
            mesh.raycast = originalRaycast
          }
        })
      })
      invalidate()
      return () => restore.forEach(reset => reset())
    }
  }, [gltfScene, id, invalidate, pending, scene])

  return null
}

const distantDetails = new Set<ParkDetailId>(['jump', 'notes', 'telescope', 'bench'])

export function ParkDetailGeometry({ jumpCourse, deferDistant = false, distantReady = true }: { jumpCourse: boolean; deferDistant?: boolean; distantReady?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const pending = useMemo(() => new Set<() => void>(), [])
  useFrame(() => {
    // Cached assets can finish together on reconnect. Apply one replacement before each draw.
    if (!pending.size) return
    const apply = pending.values().next().value
    if (apply) {
      pending.delete(apply)
      apply()
    }
  })
  useEffect(() => {
    if (!deferDistant || !distantReady) return
    // The authored meshes already render and collide. Queue distant geometry
    // replacements after the entrance frame gets a chance to present.
    let second: number | undefined
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setMounted(true)) })
    return () => {
      cancelAnimationFrame(first)
      if (second !== undefined) cancelAnimationFrame(second)
    }
  }, [deferDistant, distantReady])
  if (profile.get('details-profile') === 'before') return null
  return <>{parkDetailIds.map(id => {
    if (id === 'city' || id === 'jump' && jumpCourse || deferDistant && !mounted && distantDetails.has(id)) return null
    const url = urls['./models/detail-' + id + '-optimized.glb']
    if (!url) return null
    const detail = <Suspense key={id} fallback={null}><DetailGeometry id={id} url={url} pending={deferDistant ? pending : undefined} /></Suspense>
    // These assets contain parts from more than one district.
    if (id === 'fence' || id === 'bench') {
      return <LakePart key={id} at={LakeStage.Boats}>{detail}</LakePart>
    }
    return detail
  })}</>
}

export function JumpCourseGeometry() {
  const url = urls['./models/detail-jump-course-optimized.glb']
  return url && profile.get('details-profile') === 'after'
    ? <Suspense fallback={null}><DetailGeometry id="jump" url={url} /></Suspense>
    : null
}
export function CityDetailGeometry() {
  const url = urls['./models/detail-city-optimized.glb']
  return url && profile.get('details-profile') !== 'before'
    ? <Suspense fallback={null}><DetailGeometry id="city" url={url} /></Suspense>
    : null
}
