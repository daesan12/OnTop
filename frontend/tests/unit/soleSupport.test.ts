import { expect, it } from 'vitest'
import { Group, SkinnedMesh, Vector3 } from 'three'
import { characterSource } from '../fixtures/characterRig'
import { createCharacterRig } from '../../src/world/art/CharacterRig'
import { createSoleSupport } from '../../src/world/art/soleSupport'

for (const name of ['man', 'girl'] as const) it(`${name}: cached sole skinning matches Three across leg poses, morphs and parent transforms`, async () => {
  const rig = createCharacterRig(await characterSource(name)), parent = new Group()
  parent.add(rig.root); parent.position.set(12, .4, -7); parent.rotation.set(.15, 1.2, -.1); parent.scale.setScalar(1.3)
  let shoes: SkinnedMesh | undefined
  rig.root.traverse(node => { if (node instanceof SkinnedMesh && (node.name === 'near-shoes-socks' || !shoes && node.name === 'near-body')) shoes = node })
  const mesh = shoes!, positions = mesh.geometry.getAttribute('position')
  const indices = Array.from({ length: positions.count }, (_, i) => i).filter(i => positions.getY(i) <= .045)
  expect(indices.length).toBeGreaterThan(10)
  const bottom = createSoleSupport(mesh, indices), point = new Vector3()
  for (const bend of [0, -.6, .7, -Math.PI / 2]) {
    rig.reset(); rig.set('hips', .08, .1, -.05); rig.set('upperLeg_L', bend); rig.set('lowerLeg_R', .4); rig.set('foot_L', -.3)
    for (let i = 0; i < 20; i++) rig.apply(1 / 60)
    const morphs = mesh.morphTargetInfluences
    if (morphs?.length) morphs[0] = .4
    parent.updateMatrixWorld(true)
    let reference = Infinity
    for (const index of indices) reference = Math.min(reference, mesh.getVertexPosition(index, point).y)
    expect(bottom()).toBeCloseTo(reference, 10)
    expect(Number.isFinite(rig.groundShift())).toBe(true)
  }
  expect(createSoleSupport(mesh, [])()).toBe(Infinity)
  rig.dispose()
})
