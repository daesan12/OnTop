import { expect, it, vi } from 'vitest'
import { CanvasTexture, Group } from 'three'
import { GuestJourney } from '../../src/features/skewer/serviceHall/rendering/GuestJourney'
import { GuestSpeech, GuestSpeechArt, GUEST_GREETING_SECONDS } from '../../src/features/skewer/serviceHall/rendering/GuestSpeech'
import type { ToyActor } from '../../src/features/skewer/serviceHall/rendering/ToyPeople'
import { GUEST_GREETING_PROFILES, pickGuestGreeting } from '../../src/features/skewer/serviceHall/rendering/guestGreetings'

function customer(spokesperson = true) {
  const greet = vi.fn(), actor = { root: new Group(), guestFloorY: 0, greetingVisible: false, pose: () => {}, greet } as unknown as ToyActor
  actor.root.position.set(-7.5, 0, -2.87)
  return { greet, journey: new GuestJourney(actor, spokesperson) }
}
it('기존 착석 복구에는 인사하지 않고 실제 입장·퇴장 시 한 번씩만 인사한다', () => {
  const { greet, journey } = customer()
  journey.update(true, false, 0, false); expect(greet).not.toHaveBeenCalled()
  journey.update(false, false, .05, false)
  for (let i = 0; i < 300; i++) journey.update(false, false, .05, false)
  expect(greet.mock.calls).toEqual([['departure']])
  journey.update(true, false, .05, false)
  for (let i = 0; i < 300; i++) journey.update(true, false, .05, false)
  expect(greet.mock.calls).toEqual([['departure'], ['arrival']])
})
it('동행 손님은 중복 말풍선을 만들지 않고 움직임 줄이기에서도 대표 인사는 유지한다', () => {
  const leader = customer(), companion = customer(false)
  for (const { journey } of [leader, companion]) {
    journey.update(false, false, 0, true); journey.update(true, false, .05, true); journey.update(true, false, .05, true)
  }
  expect(leader.greet).toHaveBeenCalledExactlyOnceWith('arrival'); expect(companion.greet).not.toHaveBeenCalled()
})
it('인사 말풍선은 일시정지 시 유지되고 2.4초 후 사라지며 자기 재질만 해제한다', () => {
  const art = new GuestSpeechArt(), texture = new CanvasTexture({ width: 512, height: 160 } as HTMLCanvasElement), sourceDispose = vi.spyOn(texture, 'dispose')
  vi.spyOn(art, 'texture').mockReturnValue(texture)
  const speech = new GuestSpeech(art)
  expect(speech.root.material.depthTest).toBe(false)
  expect(speech.root.material.depthWrite).toBe(false)
  expect(speech.root.renderOrder).toBe(50)
  speech.show('arrival'); speech.update(0, 2.1, false)
  expect(speech.root.visible).toBe(true); expect(GUEST_GREETING_PROFILES[0].arrival).toContain(speech.root.userData.text)
  speech.update(GUEST_GREETING_SECONDS + .01, 2.1, false); expect(speech.root.visible).toBe(false)
  speech.show('departure'); speech.update(0, 2.1, true)
  expect(GUEST_GREETING_PROFILES[0].departure).toContain(speech.root.userData.text); expect(speech.root.visible).toBe(true)
  speech.show('departure'); speech.update(.3, 2.1, false); expect(speech.root.visible).toBe(false)
  speech.update(.5, 2.1, false); expect(speech.root.visible).toBe(true)
  speech.dispose(); expect(sourceDispose).not.toHaveBeenCalled()
})

it('서버의 착석 대기가 끝나야 좌석에 앉고 일시정지에는 입장이 진행되지 않는다', () => {
  const { journey } = customer()
  journey.update(false, false, 0, false)
  journey.update(true, false, .05, false, 6)
  const actor = Reflect.get(journey, 'actor') as ToyActor
  expect(actor.root.userData.diningPhase).toBe('arriving')
  const before = actor.root.position.clone()
  journey.update(true, false, 0, false, 6)
  expect(actor.root.position.equals(before)).toBe(true)
  for (let n = 1; n <= 120; n++) journey.update(true, false, .05, false, Math.max(0, 6 - n * .05))
  expect(actor.root.userData.diningPhase).toBe('seated')
  expect(actor.root.position.x).toBe(-7.5)
  expect(actor.root.position.z).toBe(-2.87)
})

it('캐릭터별 입퇴장 인사는 세 가지씩이고 같은 문구가 연속 반복되지 않는다', () => {
  expect(new Set(GUEST_GREETING_PROFILES.flatMap(profile => [...profile.arrival, ...profile.departure])).size).toBe(36)
  for (const [index, profile] of GUEST_GREETING_PROFILES.entries()) for (const kind of ['arrival', 'departure'] as const) {
    const results = [0, .4, .999].map(value => pickGuestGreeting(index, kind, undefined, () => value))
    expect(new Set(results).size).toBe(3)
    expect(results).toEqual([...profile[kind]])
    for (const text of results) expect(pickGuestGreeting(index, kind, text, () => 0)).not.toBe(text)
  }
})
