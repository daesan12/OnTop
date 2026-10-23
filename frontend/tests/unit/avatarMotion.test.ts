import { describe, expect, it, vi } from 'vitest'
import { Group, SkinnedMesh, Vector3 } from 'three'
import { characterSource } from '../fixtures/characterRig'
import { characterBones, createCharacterRig } from '../../src/world/art/CharacterRig'
import { avatarEmoteAge, avatarPoseActive, avatarPoseKey, createAvatarMotion } from '../../src/world/avatarMotion'
import { AvatarPoseCadence } from '../../src/performance/avatarPoseCadence'
import { CLAP_EMOTE, FITNESS_STATIONS, SOCIAL_GESTURES } from '../../src/config'
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
      expect(figure.rotation.x).toBe(1)
      expect(figure.position.y).toBe(0.45)
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
