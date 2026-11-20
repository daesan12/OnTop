import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import type { RefObject } from 'react'

/** Flexible reins follow the three pairs rather than cutting straight through a turn. */
export function Reins({ team }: { team: RefObject<Group | null> }) {
  const mesh = useRef<InstancedMesh>(null)
  const work = useMemo(() => ({ dummy: new Object3D(), from: new Vector3(), to: new Vector3(),
    direction: new Vector3(), up: new Vector3(0, 1, 0),
    curves: [-1, 1].map(side => new CatmullRomCurve3([
      new Vector3(side * .65, .25, 1.4), ...[3.4, 5.9, 8.4].map(z => new Vector3(side * .85, .4, z)),
    ])) }), [])
  useFrame(() => {
    if (!mesh.current || !team.current) return
    work.curves.forEach((curve, side) => {
      for (let row = 0; row < 3; row++) {
        const animal = team.current!.children[row * 2 + side]!
        curve.points[row + 1]!.copy(animal.position)
        curve.points[row + 1]!.y += .4
      }
      for (let i = 0; i < 20; i++) {
        curve.getPoint(i / 20, work.from); curve.getPoint((i + 1) / 20, work.to)
        work.direction.subVectors(work.to, work.from)
        const length = work.direction.length()
        work.dummy.position.copy(work.from).add(work.to).multiplyScalar(.5)
        work.dummy.quaternion.setFromUnitVectors(work.up, work.direction.normalize())
        work.dummy.scale.set(1, length, 1); work.dummy.updateMatrix()
        mesh.current!.setMatrixAt(side * 20 + i, work.dummy.matrix)
      }
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} name="sleigh-curved-reins" args={[undefined, undefined, 40]} frustumCulled={false} raycast={() => {}}>
    <cylinderGeometry args={[.018, .018, 1, 5]} />
    <meshStandardMaterial color="#69462c" roughness={.85} />
  </instancedMesh>
}
