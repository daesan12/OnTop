import { OnlineHall } from '../../../src/features/skewer/coop/drivers'
import type { CoopClient } from '../../../src/features/skewer/coop/client'
import type { CoopSnapshot } from '../../../src/features/skewer/coop/contracts'
import { HallPreview } from '../../../src/features/skewer/serviceHall/previewModel'
import type { HallView } from '../../../src/features/skewer/serviceHall/previewModel'
import { SERVER_SPEED } from '../../../src/features/skewer/serviceHall/plan'
import { ServiceScene } from '../../../src/features/skewer/serviceHall/rendering/ServiceScene'
import type { HallMotion } from '../../../src/features/skewer/serviceHall/rendering/HallMotion'
import type { WebGLRenderer } from 'three'
import '../../../src/styles.css'

// 실제 OnlineHall → ServiceScene, 합성 서버 틱/지터만 주입한다. 공유 서버·재화 미연결.
const hall = new HallPreview().view()
const snapshot = { version: 1, privateState: { role: 'server', hall }, publicState: {
  phase: 'PLAYING', round: 0, elapsed: 0, remaining: 240, score: 0, served: 0, paused: false,
  message: '', greeting: { active: false },
} } as unknown as CoopSnapshot
const client = { snapshot, playable: true, act: async () => {} } as unknown as CoopClient
const driver = new OnlineHall(client), host = document.getElementById('host')!
const scene = new ServiceScene(host, () => driver.view(), text => { throw new Error(text) })
const internal = scene as unknown as { renderer: WebGLRenderer; serverMotion: HallMotion;
  update(view: HallView, dt: number): void; post: { render(): void } }
internal.renderer.setAnimationLoop(null)
Reflect.set(window, 'movementQA', {
  resume: () => {
    hall.position = { x: hall.position.x + 1, z: hall.position.z }
    snapshot.publicState.elapsed += 10; snapshot.version++
    driver.step(0); internal.update(driver.view(), 0); internal.post.render()
    return { expected: { ...hall.position }, displayed: { ...internal.serverMotion.position } }
  },
  run: (reverse: boolean) => {
    snapshot.publicState.round = (snapshot.publicState.round ?? 0) + 1
    snapshot.publicState.elapsed = 0; hall.position = { x: -3, z: 1.25 }; snapshot.version++
    driver.step(0); internal.update(driver.view(), 0)
    const steps: number[] = [], turns: number[] = []
    const turnFrame = 48, turnAt = .84
    let firstMoveFrame = 0, firstReverseFrame = 0
    let sample = 0, before = { ...hall.position }, yaw = internal.serverMotion.yaw
    for (let frame = 1; frame <= 120; frame++) {
      const next = sample + 1
      const time = next * .06, delay = next % 2 ? .032 : .008
      if (frame === Math.ceil((time + delay) * 60)) {
        sample = next
        const travelTime = reverse && time > turnAt ? 2 * turnAt - time : time
        hall.position = { x: -3 + SERVER_SPEED * travelTime, z: 1.25 }
        snapshot.publicState.elapsed = time; snapshot.version++
      }
      if (frame % 4 === 0) snapshot.version++ // 같은 서버 틱의 MOVE 확인 응답.
      driver.step(1 / 60, reverse && frame > turnFrame ? -1 : 1, 0)
      internal.update(driver.view(), 1 / 60)
      const motion = internal.serverMotion
      const dx = motion.position.x - before.x
      if (!firstMoveFrame && dx > .000001) firstMoveFrame = frame
      if (!firstReverseFrame && dx < -.000001) firstReverseFrame = frame
      if (frame > 30) {
        steps.push(Math.hypot(motion.position.x - before.x, motion.position.z - before.z))
        turns.push(Math.abs(Math.atan2(Math.sin(motion.yaw - yaw), Math.cos(motion.yaw - yaw))))
      }
      before = { ...motion.position }; yaw = motion.yaw
    }
    internal.post.render()
    return { minStep: Math.min(...steps), maxStep: Math.max(...steps), maxTurn: Math.max(...turns),
      startMs: firstMoveFrame ? (firstMoveFrame - 1) * 1000 / 60 : Infinity,
      reverseMs: firstReverseFrame ? (firstReverseFrame - turnFrame - 1) * 1000 / 60 : Infinity,
      end: { ...internal.serverMotion.position }, moving: internal.serverMotion.moving }
  },
})
driver.step(0); internal.update(driver.view(), 0); internal.post.render()
host.dataset.fixtureReady = 'true'
