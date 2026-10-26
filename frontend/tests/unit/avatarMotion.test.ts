import { describe, expect, it, vi } from 'vitest'
import { Group, SkinnedMesh, Vector3 } from 'three'
import { characterSource } from '../fixtures/characterRig'
import { characterBones, createCharacterRig } from '../../src/world/art/CharacterRig'
import { avatarEmoteAge, avatarPoseActive, avatarPoseKey, avatarSeatSurface, createAvatarMotion } from '../../src/world/avatarMotion'
import { AvatarPoseCadence } from '../../src/performance/avatarPoseCadence'
import { CHARACTER, CLAP_EMOTE, FITNESS_STATIONS, SOCIAL_GESTURES } from '../../src/config'
import { FITNESS, PULLDOWN_LIFT, createFitnessMotion, sampleFitnessMotion } from '../../src/config'
import { sampleFitnessGrip } from '../../src/world/art/fitnessGrip'
import type { AvatarSnapshot } from '../../src/network/worldClient'

const pose = { x: -10, y: 0.8, z: 21, yaw: 0 }
function avatar(patch: Partial<AvatarSnapshot> = {}): AvatarSnapshot {
  return { previous: pose, current: pose, at: 0, nickname: '검수', color: 0, character: 'man',
    connected: true, moving: false, running: false, swimming: false, emote: '', emoteAt: 0,
    tableId: '', seatIndex: -1, benchId: '', fitnessId: '', fitnessStartedAt: 0,
    telescopeId: '', telescopeYaw: 0, telescopePitch: 0, followTargetId: '', ...patch }
}

describe('avatar pose transitions and resource ownership', () => {
  it('uses the full authored duration and suppresses hand gestures in incompatible states', () => {
    const wave = avatar({ emote: 'EMOTE_WAVE', emoteAt: 100 })
    expect(avatarPoseActive(wave, 2100)).toBe(true)
    expect(avatarEmoteAge(wave, 100 + SOCIAL_GESTURES.EMOTE_WAVE.durationMs)).toBeNull()
    expect(avatarEmoteAge(avatar({ emote: 'EMOTE_CLAP' }), CLAP_EMOTE.durationMs - 1)).not.toBeNull()
    for (const patch of [{ swimming: true }, { fitnessId: 'walker-1' }, { telescopeId: 'scope' }, { connected: false }])
      expect(avatarEmoteAge({ ...wave, ...patch }, 500)).toBeNull()
    expect(avatarEmoteAge(wave, 99)).toBeNull()
    expect(avatarEmoteAge(wave, NaN)).toBeNull()
    expect(avatarEmoteAge(avatar({ emote: 'unknown' }), 500)).toBeNull()
  })

  it('updates changed remote poses immediately while retaining distance cadence', () => {
    const cadence = new AvatarPoseCadence(), a = avatar()
    expect(cadence.advance(1 / 60, 30, false, false, avatarPoseKey(a))).toBeGreaterThan(0)
    expect(cadence.advance(1 / 60, 30, false, false, avatarPoseKey(a))).toBe(0)
    const key = avatarPoseKey(a)
    a.emote = 'EMOTE_WAVE'
    expect(avatarPoseKey(a)).not.toBe(key)
    expect(cadence.advance(1 / 60, 30, false, true, avatarPoseKey(a))).toBeGreaterThan(0)
    a.telescopePitch = 0.3
    expect(cadence.advance(1 / 60, 30, false, true, avatarPoseKey(a))).toBeGreaterThan(0)
    expect(cadence.advance(1 / 60, 30, false, true, avatarPoseKey(a))).toBe(0)
    expect(cadence.advance(1 / 60, 5, false, true, avatarPoseKey(a))).toBeGreaterThan(0)
  })

  for (const name of ['man', 'girl'] as const) {
    it(`${name}: keeps the seated body and clothing above the seat surface`, async () => {
      const rig = createCharacterRig(await characterSource(name)), motion = createAvatarMotion(rig)
      const figure = new Group()
      for (let i = 0; i < 90; i++) motion.apply(avatar({ tableId: 'table-1', seatIndex: 0 }), 0, 1 / 60, pose, figure)
      rig.root.updateMatrixWorld(true)
      const mesh = rig.root.getObjectByName('near-body') as SkinnedMesh
      mesh.skeleton.update()
      const p = mesh.geometry.attributes.position!, weights = mesh.geometry.attributes.skinWeight!, indices = mesh.geometry.attributes.skinIndex!
      let bottom = Infinity, samples = 0
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < rig.hipHeight - 0.2 || p.getY(i) > rig.hipHeight + 0.1) continue
        let support = 0
        for (let j = 0; j < 4; j++) if (['hips', 'spine'].includes(mesh.skeleton.bones[indices.getComponent(i, j)]!.name)) support += weights.getComponent(i, j)
        if (support < 0.65) continue
        bottom = Math.min(bottom, mesh.getVertexPosition(i, new Vector3()).y)
        samples++
      }
      const worldBottom = CHARACTER.seatedHipHeight + rig.seatedHipLift - rig.hipHeight + bottom
      expect(samples).toBeGreaterThan(50)
      expect(worldBottom).toBeGreaterThanOrEqual(CHARACTER.seatedHipHeight)
      expect(worldBottom).toBeLessThan(CHARACTER.seatedHipHeight + 0.015)
      expect(avatarSeatSurface('bench-0') + rig.seatedHipLift - rig.hipHeight + bottom).toBeGreaterThan(0.58)
      rig.dispose()
    })
    it(`${name}: swims with alternating full arm strokes, kicks and a stable pelvis at 30/60fps`, async () => {
      for (const fps of [30, 60]) {
        const rig = createCharacterRig(await characterSource(name)), motion = createAvatarMotion(rig)
        const figure = new Group(), hips = new Vector3()
        figure.add(rig.root)
        const a = avatar({ swimming: true, moving: true })
        let min = Infinity, max = -Infinity, kickMin = Infinity, kickMax = -Infinity
        for (let i = 0; i < fps * 4; i++) {
          motion.apply(a, 0, 1 / fps, pose, figure)
          figure.updateMatrixWorld(true)
          if (i < fps) continue
          const hand = rig.bones.hand_L.getWorldPosition(new Vector3())
          min = Math.min(min, hand.z); max = Math.max(max, hand.z)
          kickMin = Math.min(kickMin, rig.bones.upperLeg_L.rotation.x)
          kickMax = Math.max(kickMax, rig.bones.upperLeg_L.rotation.x)
          rig.bones.hips.getWorldPosition(hips)
          expect(Math.abs(hips.z)).toBeLessThan(0.001)
          expect(hips.y).toBeCloseTo(0.8, 3)
        }
        expect(figure.rotation.x).toBeCloseTo(1.3, 3)
        expect(max - min).toBeGreaterThan(0.4)
        expect(kickMax - kickMin).toBeGreaterThan(0.35)
        for (let i = 0; i < fps; i++) motion.apply({ ...a, moving: false }, 0, 1 / fps, pose, figure)
        expect(figure.rotation.x).toBeLessThan(0.2)
        rig.dispose()
      }
    })
    it(`${name}: fits machine grips and seated hip height without changing model scale`, async () => {
      const rig = createCharacterRig(await characterSource(name)), motion = createAvatarMotion(rig)
      const base = new Group(), figure = new Group(), target = new Vector3(), hand = new Vector3()
      base.add(figure); figure.add(rig.root)
      const errors: Record<string, number> = {}
      for (const station of FITNESS_STATIONS) {
        base.position.y = station.baseHeight
        for (const age of [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400]) {
          const a = avatar({ fitnessId: station.id, fitnessStartedAt: 100 })
          const sample = sampleFitnessMotion(station.kind, 100, 100 + age, createFitnessMotion())
          for (let frame = 0; frame < 20; frame++) motion.apply(a, 100 + age, 1 / 30, pose, figure)
          base.updateMatrixWorld(true)
          if (['rower', 'situp', 'inversion', 'legpress', 'pulldown'].includes(station.kind)) {
            rig.bones.hips.getWorldPosition(hand)
            const lift = station.kind === 'pulldown' ? sample.mechanism * PULLDOWN_LIFT : 0
            expect(hand.y).toBeCloseTo(station.baseHeight + FITNESS.hipHeight + lift, 5)
          }
          if (station.kind === 'walker') {
            expect(rig.bones.upperLeg_L.rotation.x).toBeCloseTo(sample.rightLeg, 3)
            expect(rig.bones.upperLeg_R.rotation.x).toBeCloseTo(sample.leftLeg, 3)
          }
          for (const side of ['L', 'R'] as const) {
            if (!sampleFitnessGrip(station, sample, side, target)) continue
            rig.bones[`hand_${side}`].getWorldPosition(hand)
            errors[station.kind] = Math.max(errors[station.kind] ?? 0, hand.distanceTo(target))
          }
          expect(figure.scale.toArray()).toEqual([1, 1, 1])
        }
      }
      expect(Math.max(...Object.values(errors))).toBeLessThan(0.085)
      rig.dispose()
    })
    it(`${name}: owns a private skeleton, shares immutable assets and preserves pose across LOD`, async () => {
      const source = await characterSource(name)
      const a = createCharacterRig(source), b = createCharacterRig(source)
      const mesh = (rig: typeof a, name = 'near-body') => rig.root.getObjectByName(name) as SkinnedMesh
      expect(Object.keys(a.bones)).toHaveLength(49)
      expect(mesh(a).geometry).toBe(mesh(b).geometry)
      expect(mesh(a).material).toBe(mesh(b).material)
      expect(mesh(a).skeleton).not.toBe(mesh(b).skeleton)
      expect(mesh(a).skeleton).toBe(mesh(a, 'far-body').skeleton)
      expect(a.bones.head).not.toBe(b.bones.head)
      a.set('upperArm_L', -1)
      a.apply(0.1)
      const rotation = a.bones.upperArm_L.quaternion.clone()
      a.lod(15)
      expect(mesh(a, 'far-body').visible).toBe(true)
      a.lod(12)
      expect(mesh(a, 'far-body').visible).toBe(true)
      a.lod(9)
      expect(mesh(a).visible).toBe(true)
      expect(a.bones.upperArm_L.quaternion.equals(rotation)).toBe(true)
      expect(b.bones.upperArm_L.rotation.x).toBeCloseTo(0)
      const geometryDispose = vi.spyOn(mesh(a).geometry, 'dispose')
      mesh(a).skeleton.computeBoneTexture()
      const texture = mesh(a).skeleton.boneTexture!
      const textureDispose = vi.spyOn(texture, 'dispose')
      a.dispose()
      expect(textureDispose).toHaveBeenCalledOnce()
      expect(mesh(a).skeleton.boneTexture).toBeNull()
      expect(geometryDispose).not.toHaveBeenCalled()
      b.set('head', 0.4)
      b.apply(0.1)
      expect(b.bones.head.rotation.x).toBeGreaterThan(0)
      b.dispose()
    })

    it(`${name}: blends locomotion, sitting, swimming, all 12 exercise poses and returns to idle`, async () => {
      const rig = createCharacterRig(await characterSource(name))
      const motion = createAvatarMotion(rig), figure = new Group()
      const step = (a: AvatarSnapshot, now = 900, frames = 20) => {
        for (let frame = 0; frame < frames; frame++) motion.apply(a, now + frame * 1000 / 60, 1 / 60, pose, figure)
        rig.root.updateMatrixWorld(true)
      }
      step(avatar({ moving: true }))
      const walkElbow = rig.bones.lowerArm_L.rotation.x
      step(avatar({ moving: true, running: true }))
      expect(rig.bones.lowerArm_L.rotation.x).toBeLessThan(walkElbow - 0.2)
      step(avatar({ benchId: 'bench-0', seatIndex: 0, moving: true }), 900, 60)
      expect(rig.bones.upperLeg_L.rotation.x).toBeCloseTo(-Math.PI / 2, 4)
      expect(figure.position.z).toBe(0.18)
      if (name === 'girl') {
        const mesh = rig.root.getObjectByName('near-body') as SkinnedMesh
        expect(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.seatedCloth!]).toBeCloseTo(1, 4)
      }
      step(avatar({ swimming: true, emote: 'EMOTE_WAVE' }))
      expect(figure.rotation.x).toBeCloseTo(0.18, 3)
      expect(Number.isFinite(figure.position.y)).toBe(true)
      const signatures = new Set<string>()
      for (const station of FITNESS_STATIONS) {
        step(avatar({ fitnessId: station.id, fitnessStartedAt: 100, swimming: true }), 1100)
        const signature = [figure.rotation.x, figure.rotation.z, figure.position.y, figure.position.z,
          ...['upperLeg_L', 'upperLeg_R', 'upperArm_L', 'upperArm_R'].map(joint => rig.bones[joint as 'upperLeg_L'].rotation.x)]
        expect(signature.every(Number.isFinite)).toBe(true)
        signatures.add(signature.map(value => value.toFixed(2)).join(','))
        for (const joint of characterBones) expect(rig.bones[joint].quaternion.toArray().every(Number.isFinite)).toBe(true)
        const mesh = rig.root.getObjectByName('near-body') as SkinnedMesh
        mesh.skeleton.update()
        expect(mesh.getVertexPosition(0, new Vector3()).toArray().every(Number.isFinite)).toBe(true)
      }
      expect(signatures.size).toBe(11)
      step(avatar({ telescopeId: 'scope', telescopePitch: 0.4, emote: 'EMOTE_CLAP' }), 900, 60)
      expect(rig.bones.upperArm_L.rotation.x).toBeCloseTo(-1.1, 4)
      expect(rig.bones.head.rotation.x).toBeCloseTo(-0.16, 4)
      step(avatar({ fitnessId: 'unregistered' }), 900, 60)
      expect(rig.bones.upperArm_L.rotation.x).toBeCloseTo(0, 3)
      for (const emote of ['EMOTE_CLAP', 'EMOTE_APPLAUSE_REQUEST', 'EMOTE_TSK', 'EMOTE_WAVE', 'EMOTE_TABLE_FLIP']) {
        step(avatar({ emote, emoteAt: 100 }), 900)
        expect(Math.abs(rig.bones.upperArm_R.rotation.x)).toBeGreaterThan(0.01)
      }
      step(avatar(), 10_000, 90)
      expect(figure.rotation.x).toBe(0)
      expect(figure.position.z).toBe(0)
      expect(rig.bones.upperLeg_L.rotation.x).toBeCloseTo(0, 3)
      if (name === 'girl') {
        const mesh = rig.root.getObjectByName('far-body') as SkinnedMesh
        expect(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.seatedCloth!]).toBe(0)
      }
      rig.dispose()
    })
  }
})
