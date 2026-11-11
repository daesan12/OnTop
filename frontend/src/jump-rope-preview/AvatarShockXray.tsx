import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, MeshBasicMaterial, Path, QuadraticBezierCurve3, Quaternion, Shape, SkinnedMesh, Vector3, type Bone, type Group } from 'three'
import type { MissShockPose } from './missShock'

const strokes = [
  ['hips', 'neck', 0.015],
  ['chest', 'upperArm_L', 0.014], ['chest', 'upperArm_R', 0.014],
  ['upperArm_L', 'lowerArm_L', 0.019], ['lowerArm_L', 'hand_L', 0.017],
  ['upperArm_R', 'lowerArm_R', 0.019], ['lowerArm_R', 'hand_R', 0.017],
  ['upperLeg_L', 'lowerLeg_L', 0.023], ['lowerLeg_L', 'foot_L', 0.019],
  ['upperLeg_R', 'lowerLeg_R', 0.023], ['lowerLeg_R', 'foot_R', 0.019],
] as const
type XrayJoint = typeof strokes[number][0 | 1] | 'head'

const skull = new Shape()
skull.moveTo(0, 0.213)
skull.bezierCurveTo(-0.25, 0.213, -0.26, -0.066, -0.135, -0.095)
skull.lineTo(-0.099, -0.164)
skull.quadraticCurveTo(-0.078, -0.19, 0, -0.19)
skull.quadraticCurveTo(0.078, -0.19, 0.099, -0.164)
skull.lineTo(0.135, -0.095)
skull.bezierCurveTo(0.26, -0.066, 0.25, 0.213, 0, 0.213)
skull.closePath()
for (const side of [-1, 1]) {
  const socket = new Path()
  socket.absellipse(side * 0.082, 0.024, 0.056, 0.063, 0, Math.PI * 2, true)
  skull.holes.push(socket)
}
const nose = new Path()
nose.moveTo(0, -0.041)
nose.lineTo(-0.024, -0.088)
nose.lineTo(0.024, -0.088)
nose.closePath()
skull.holes.push(nose)
for (const x of [-0.034, 0, 0.034]) {
  const toothGap = new Path()
  toothGap.moveTo(x - 0.005, -0.124)
  toothGap.lineTo(x + 0.005, -0.124)
  toothGap.lineTo(x + 0.005, -0.16)
  toothGap.lineTo(x - 0.005, -0.16)
  toothGap.closePath()
  skull.holes.push(toothGap)
}

const ribs = [0.106, 0.123, 0.114, 0.094].flatMap((width, index) => [-1, 1].map(side => {
  const y = 0.088 - index * 0.046
  return new QuadraticBezierCurve3(new Vector3(0, y, 0), new Vector3(side * width, y - 0.064, 0), new Vector3(side * width, y - 0.015, 0))
}))
const up = new Vector3(0, 1, 0)

export function AvatarShockXray({ model, bones, shock }: {
  model: Group
  bones: Record<XrayJoint, Bone>
  shock: RefObject<MissShockPose>
}) {
  const overlay = useRef<Group>(null)
  const head = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const limbs = useRef<(Group | null)[]>([])
  const visuals = useMemo(() => {
    const surfaces: { mesh: SkinnedMesh; material: SkinnedMesh['material'] }[] = []
    model.traverse(object => {
      if (object instanceof SkinnedMesh) surfaces.push({ mesh: object, material: object.material })
    })
    return {
      surfaces,
      dark: false,
      silhouette: new MeshBasicMaterial({ color: '#161e2c', toneMapped: false, fog: false }),
      ivory: new MeshBasicMaterial({ color: '#f9fdff', toneMapped: false, fog: false, transparent: true, depthTest: false, depthWrite: false }),
      inverse: new Matrix4(), localView: new Quaternion(), worldFrame: new Quaternion(),
      start: new Vector3(), end: new Vector3(), direction: new Vector3(),
    }
  }, [model])

  useEffect(() => () => {
    for (const { mesh, material } of visuals.surfaces) mesh.material = material
    visuals.silhouette.dispose()
    visuals.ivory.dispose()
  }, [visuals])

  useFrame(({ camera }) => {
    const group = overlay.current
    if (!group) return
    const opacity = shock.current.xray
    const active = opacity > 0.18
    if (active !== visuals.dark) {
      for (const { mesh, material } of visuals.surfaces) mesh.material = active ? visuals.silhouette : material
      visuals.dark = active
    }
    group.visible = active
    if (!active) return

    visuals.ivory.opacity = opacity
    model.updateWorldMatrix(true, true)
    group.updateWorldMatrix(true, false)
    const { inverse, localView, worldFrame, start, end, direction } = visuals
    inverse.copy(group.matrixWorld).invert()
    camera.getWorldQuaternion(localView).premultiply(group.getWorldQuaternion(worldFrame).invert())
    if (head.current) {
      head.current.position.set(0, 0.27, 0.055).applyMatrix4(bones.head.matrixWorld).applyMatrix4(inverse)
      head.current.quaternion.copy(localView)
    }
    if (torso.current) {
      torso.current.position.set(0, -0.072, 0.028).applyMatrix4(bones.chest.matrixWorld).applyMatrix4(inverse)
      torso.current.quaternion.copy(localView)
    }
    strokes.forEach(([from, to, radius], index) => {
      const stroke = limbs.current[index]
      if (!stroke) return
      start.setFromMatrixPosition(bones[from].matrixWorld).applyMatrix4(inverse)
      end.setFromMatrixPosition(bones[to].matrixWorld).applyMatrix4(inverse)
      direction.subVectors(end, start)
      stroke.position.copy(start).lerp(end, 0.5)
      stroke.scale.set(radius, direction.length() / 5.6, radius)
      stroke.quaternion.setFromUnitVectors(up, direction.normalize())
    })
  })

  return (
    <group ref={overlay} visible={false} renderOrder={10}>
      {strokes.map(([from, to], index) => (
        <group key={`${from}-${to}`} ref={group => { limbs.current[index] = group }}>
          <mesh material={visuals.ivory}><capsuleGeometry args={[1, 4, 4, 8]} /></mesh>
        </group>
      ))}
      <group ref={torso}>
        {ribs.map((curve, index) => <mesh key={index} material={visuals.ivory}><tubeGeometry args={[curve, 8, 0.013, 5, false]} /></mesh>)}
      </group>
      <group ref={head}>
        <mesh material={visuals.ivory}><shapeGeometry args={[skull, 10]} /></mesh>
      </group>
    </group>
  )
}
