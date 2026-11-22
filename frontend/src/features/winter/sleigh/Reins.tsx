import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import type { RefObject } from 'react'

/** Continuous traces pass through animated harness rings and clear the animals' flanks. */
export function Reins({ team }: { team: RefObject<Group | null> }) {
  const mesh = useRef<InstancedMesh>(null)
  const work = useMemo(() => ({ dummy: new Object3D(), from: new Vector3(), to: new Vector3(),
    direction: new Vector3(), tangent: new Vector3(), up: new Vector3(0, 1, 0),
    curves: [-1, 1].flatMap(column => [-1, 1].map(flank => ({ column, flank, curve: new CatmullRomCurve3([
      new Vector3(column * .65, .25, 1.4), ...[3.4, 5.9, 8.4].map(z => new Vector3(column * .85 + flank * .3, .05, z + .37)),
    ]) }))) }), [])
  useFrame(() => {
    if (!mesh.current || !team.current) return
    mesh.current.parent?.updateWorldMatrix(true, true)
    work.curves.forEach(({ curve, column, flank }, line) => {
      const tow = mesh.current!.parent?.getObjectByName(column < 0 ? 'sleigh-tow-left' : 'sleigh-tow-right')
      if (tow) { tow.getWorldPosition(curve.points[0]!); mesh.current!.worldToLocal(curve.points[0]!) }
      for (let row = 0; row < 3; row++) {
        const animal = team.current!.children[row * 2 + (column < 0 ? 0 : 1)]!
        const anchor = animal.getObjectByName(flank < 0 ? 'harness-left' : 'harness-right')
        const point = curve.points[row + 1]!
        if (anchor) { anchor.getWorldPosition(point); mesh.current!.worldToLocal(point) }
        else point.set(flank * .3, .05, .37).applyQuaternion(animal.quaternion).add(animal.position)
      }
      const pointAt = (t: number, target: Vector3) => {
        curve.getPoint(t, target); curve.getTangent(t, work.tangent)
        const phase = Math.min(2.999999, t * 3) % 1, slack = Math.sin(Math.PI * phase) ** 2
        const clearance = .03 * slack + .19 * (729 / 16) * phase ** 4 * (1 - phase) ** 2
        const length = Math.hypot(work.tangent.x, work.tangent.z) || 1
        target.x += flank * work.tangent.z / length * clearance
        target.z -= flank * work.tangent.x / length * clearance
        target.y -= .045 * slack
      }
      for (let i = 0; i < 81; i++) {
        pointAt(i / 81, work.from); pointAt((i + 1) / 81, work.to)
        work.direction.subVectors(work.to, work.from)
        const length = work.direction.length()
        work.dummy.position.copy(work.from).add(work.to).multiplyScalar(.5)
        work.dummy.quaternion.setFromUnitVectors(work.up, work.direction.normalize())
        work.dummy.scale.set(1, length, 1); work.dummy.updateMatrix()
        mesh.current!.setMatrixAt(line * 81 + i, work.dummy.matrix)
      }
    })
    mesh.current.instanceMatrix.needsUpdate = true
  }, -.25)
  return <instancedMesh ref={mesh} name="sleigh-curved-reins" args={[undefined, undefined, 324]} frustumCulled={false} raycast={() => {}}>
    <cylinderGeometry args={[.012, .012, 1, 6, 1, true]} />
    <meshStandardMaterial color="#722b34" roughness={.65} />
  </instancedMesh>
}
