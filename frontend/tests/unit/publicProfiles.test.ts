import { beforeEach, describe, expect, it } from 'vitest'
import { avatars, clearChannel, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { setDisplayProfiles } from '../../src/network/profileBridge'
import { worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const position = { x: 0, y: 0.8, z: 34, yaw: 0, moving: false, running: false, swimming: false, lastInputSeq: 0 }
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
const join = () => {
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
}
const snapshot = (version: number, profile: object = {}, channelId = 'a', includeRemote = true) => ({
  channelId, version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position }, ...(includeRemote ? [{ userId: '102', position, ...profile }] : [])],
})
beforeEach(() => { resetWorld(); join() })

describe('approved WORLD_STATE public profile presentation', () => {
  it('updates stationary avatar, chat and model display values without replacing unchanged movement identities', () => {
    emit('WORLD_STATE', snapshot(1, { nickname: '봄산책', characterGender: 'FEMALE' }))
    expect(avatars.get('102')).toMatchObject({ nickname: '봄산책', character: 'girl', current: { x: 0, y: 0.8, z: 34, yaw: 0 } })
    const ids = useSession.getState().ids
    const profiles = useSession.getState().profiles
    emit('WORLD_STATE', snapshot(2, { nickname: '봄산책', characterGender: 'FEMALE' }))
    expect(useSession.getState().profiles).toBe(profiles)
    emit('WORLD_STATE', snapshot(3, { nickname: '여름산책', characterGender: 'MALE' }))
    expect(useSession.getState().ids).toBe(ids)
    expect(useSession.getState().profiles['102']).toEqual({ nickname: '여름산책', character: 'man' })
    expect(avatars.get('102')).toMatchObject({ nickname: '여름산책', character: 'man' })
  })

  it('retains known fields across pending/null, partial and older-server snapshots', () => {
    emit('WORLD_STATE', snapshot(1, { nickname: '봄산책', characterGender: 'FEMALE' }))
    const profiles = useSession.getState().profiles
    emit('WORLD_STATE', snapshot(2, { nickname: null, characterGender: null }))
    emit('WORLD_STATE', snapshot(3))
    expect(useSession.getState().profiles).toBe(profiles)
    expect(avatars.get('102')).toMatchObject({ nickname: '봄산책', character: 'girl' })
    emit('WORLD_STATE', snapshot(4, { nickname: '새닉네임', characterGender: null }))
    expect(avatars.get('102')).toMatchObject({ nickname: '새닉네임', character: 'girl' })
    emit('WORLD_STATE', snapshot(5, { nickname: null, characterGender: 'MALE' }))
    expect(avatars.get('102')).toMatchObject({ nickname: '새닉네임', character: 'man' })
  })

  it('keeps the server-approved game master marker and clears it explicitly', () => {
    emit('WORLD_STATE', snapshot(1, { nickname: '운영자', characterGender: 'FEMALE', gameMaster: true }))
    expect(useSession.getState().profiles['102']).toEqual({ nickname: '운영자', character: 'girl', gameMaster: true })
    emit('WORLD_STATE', snapshot(2, { nickname: null, characterGender: null }))
    expect(useSession.getState().profiles['102']?.gameMaster).toBe(true)
    emit('WORLD_STATE', snapshot(3, { nickname: null, characterGender: null, gameMaster: false }))
    expect(useSession.getState().profiles['102']).toEqual({ nickname: '운영자', character: 'girl' })
  })

  it('keeps authenticated own-profile fallback and wallet balance when public names refresh', () => {
    setDisplayProfiles({ '101': { nickname: '내닉네임', character: 'girl' } }, { nickname: '내닉네임', balance: 73 })
    emit('WORLD_STATE', snapshot(1, { nickname: null, characterGender: null }))
    expect(avatars.get('101')).toMatchObject({ nickname: '내닉네임', character: 'girl' })
    emit('WORLD_STATE', { ...snapshot(2), avatars: [{ userId: '101', position, nickname: '변경한이름', characterGender: 'FEMALE' }] })
    expect(useSession.getState().account).toEqual({ nickname: '변경한이름', balance: 73 })
    clearChannel()
    expect(useSession.getState().profiles).toEqual({ '101': { nickname: '변경한이름', character: 'girl' } })
  })

  it('ignores foreign channels and older versions without leaking their profiles', () => {
    emit('WORLD_STATE', snapshot(3, { nickname: '현재이름', characterGender: 'FEMALE' }))
    const profiles = useSession.getState().profiles
    emit('WORLD_STATE', snapshot(2, { nickname: '과거이름', characterGender: 'MALE' }))
    emit('WORLD_STATE', snapshot(4, { nickname: '다른채널', characterGender: 'MALE' }, 'b'))
    expect(useSession.getState().profiles).toBe(profiles)
    expect(avatars.get('102')?.nickname).toBe('현재이름')
  })

  it('removes departed profiles and waits for fresh data on re-entry, channel change and reconnect', () => {
    const known = { nickname: '봄산책', characterGender: 'FEMALE' }
    emit('WORLD_STATE', snapshot(1, known))
    emit('WORLD_STATE', snapshot(2, {}, 'a', false))
    expect(useSession.getState().profiles['102']).toBeUndefined()
    emit('WORLD_STATE', snapshot(3, { nickname: null, characterGender: null }))
    expect(avatars.get('102')?.nickname).toBe('산책자 102')
    emit('WORLD_STATE', snapshot(4, known))
    clearChannel()
    expect(useSession.getState().profiles['102']).toBeUndefined()
    join(); emit('WORLD_STATE', snapshot(1, known))
    resetWorld('reconnecting')
    expect(useSession.getState().profiles).toEqual({})
    join(); emit('WORLD_STATE', snapshot(1, { nickname: '재접속', characterGender: 'MALE' }))
    expect(avatars.get('102')).toMatchObject({ nickname: '재접속', character: 'man' })
  })

  it('accepts missing/null profile fields but rejects malformed supplied fields', () => {
    expect(() => worldState(snapshot(1))).not.toThrow()
    expect(() => worldState(snapshot(1, { nickname: null, characterGender: null }))).not.toThrow()
    for (const bad of [{ nickname: 2 }, { nickname: '  ' }, { characterGender: 'girl' }, { characterGender: {} }, { gameMaster: 'yes' }])
      expect(() => worldState(snapshot(1, bad))).toThrow()
  })
})
