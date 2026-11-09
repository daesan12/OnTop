import { expect, it, vi } from 'vitest'
import { Mesh } from 'three'
import { ToyPeople } from '../../src/features/skewer/serviceHall/rendering/ToyPeople'
import { DiningGuests } from '../../src/features/skewer/serviceHall/rendering/DiningGuests'
import { RestaurantSet } from '../../src/features/skewer/serviceHall/rendering/RestaurantSet'
import { GuestSpeechArt } from '../../src/features/skewer/serviceHall/rendering/GuestSpeech'

it('캐릭터 로딩 중과 실패 뒤에도 프로토타입 몸체를 렌더링하지 않는다', async () => {
  let fail!: (reason: Error) => void
  const load = vi.spyOn(DiningGuests, 'load').mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const art = new RestaurantSet(), people = new ToyPeople(art)
  const actors = [people.create(1, 'guest'), people.create(2, 'guest', true), people.create(1, 'server'), people.create(0, 'chef')]
  const visibleMeshes = () => {
    let count = 0
    for (const actor of actors) actor.root.traverseVisible(object => { if (object instanceof Mesh) count++ })
    return count
  }
  try {
    expect(visibleMeshes()).toBe(0)
    fail(new Error('asset unavailable'))
    expect(await people.guestsReady).toBe(false)
    for (const actor of actors) actor.pose(.05, { moving: true, eating: true })
    expect(visibleMeshes()).toBe(0)
  } finally { people.dispose(); art.dispose(); load.mockRestore() }
})

it('요리사 배경 손님은 입퇴장해도 주문표 앞에 대화 말풍선을 만들지 않는다', async () => {
  const load = vi.spyOn(DiningGuests, 'load').mockRejectedValue(new Error('not needed'))
  const texture = vi.spyOn(GuestSpeechArt.prototype, 'texture')
  const art = new RestaurantSet(), people = new ToyPeople(art, false)
  try {
    const guest = people.create(1, 'guest', true)
    await people.guestsReady
    for (const kind of ['arrival', 'departure'] as const) {
      guest.greet(kind); guest.pose(.05, { moving: true })
      expect(guest.root.getObjectByName('guest-greeting')).toBeUndefined()
      expect(guest.greetingVisible).toBe(false)
    }
    expect(texture).not.toHaveBeenCalled()
  } finally { people.dispose(); art.dispose(); load.mockRestore() }
})
