import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Quaternion, RingGeometry, Vector3, type Group } from 'three'
import { STONE_HIT_EFFECT_MS, type StoneFeedbackFrame } from './feedback'

const ring = new RingGeometry(.32, .39, 24)
const rays = new BufferGeometry()
const points: number[] = []
for (let i = 0; i < 8; i++) {
  const angle = i * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle)
  points.push(c * .6 - s * .055, s * .6 + c * .055, 0, c * .6 + s * .055, s * .6 - c * .055, 0, c, s, 0)
}
rays.setAttribute('position', new Float32BufferAttribute(points, 3))

/** 두 개의 작은 메시만 사용한다. 공유 캐릭터 재질이나 전체 화면 밝기는 바꾸지 않는다. */
export function StoneHitEffect({ userId, feedback }: { userId: string; feedback?: MutableRefObject<StoneFeedbackFrame> }) {
  const group = useRef<Group>(null), reduced = useRef(false)
  const materials = useMemo(() => [new MeshBasicMaterial({ color: '#fff5d2', transparent: true, fog: false, toneMapped: false, depthWrite: false }),
    new MeshBasicMaterial({ color: '#ed9b45', transparent: true, fog: false, toneMapped: false, depthWrite: false })], [])
  const inverse = useMemo(() => new Quaternion(), [])
  const offset = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'), update = () => { reduced.current = media.matches }
    update(); media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); materials.forEach(material => material.dispose()) }
  }, [materials])
  useFrame(({ camera }) => {
    const root = group.current, hit = feedback?.current.hits.get(userId)
    if (!root) return
    const age = hit ? performance.now() - hit.startedAt : STONE_HIT_EFFECT_MS
    root.visible = !!feedback?.current.enabled && age >= 0 && age < STONE_HIT_EFFECT_MS
    if (!root.visible) return
    const progress = age / STONE_HIT_EFFECT_MS
    root.scale.setScalar(reduced.current ? .85 : .5 + progress * .45)
    inverse.copy(root.parent!.quaternion).invert()
    root.quaternion.copy(inverse).multiply(camera.quaternion)
    // 몸에 파묻히지 않게 카메라 쪽으로 조금 띄우되 깊이 검사는 유지한다.
    offset.set(0, 0, .45).applyQuaternion(camera.quaternion).applyQuaternion(inverse)
    root.position.copy(offset); root.position.y += 1.3
    const alpha = Math.min(1, (1 - progress) / .65)
    materials[0]!.opacity = alpha * .95; materials[1]!.opacity = alpha * .85
  })
  return <group name={`stone-hit-${userId}`} ref={group} position={[0, 1.3, 0]} visible={false} userData={{ prepareWhenHidden: true }}>
    <mesh geometry={rays} material={materials[0]} renderOrder={30} dispose={null} />
    <mesh geometry={ring} material={materials[1]} renderOrder={30} dispose={null} />
  </group>
}
