import type { Page } from '@playwright/test'
type Point = { x: number; z: number }

/** 이동 액션을 주입하지 않고 실제 키보드로 통로의 코너를 따라간다. */
export async function keyboardWalk(page: Page, label: string, read: () => Promise<Point>, online = true) {
  const start = await read()
  const path = await page.evaluate(async ({ label, start }) => {
    const url = '/src/features/skewer/serviceHall/plan.ts'
    const plan = await import(/* @vite-ignore */ url)
    const id = Number(label.match(/^(\d)번/)?.[1])
    const target = id ? plan.tableDestination(start, plan.TABLES[id - 1]) : /주문 전달/.test(label) ? plan.STATIONS.orders
      : /음식 수령/.test(label) ? plan.STATIONS.pickup : /냉장고/.test(label) ? plan.STATIONS.fridge
        : /세척기/.test(label) ? plan.STATIONS.washer : plan.STATIONS.storage
    const route = [start, ...plan.route(start, target)] as Point[]
    return route.filter((point, i) => i > 0 && (i === route.length - 1 ||
      Math.abs((point.x - route[i - 1].x) * (route[i + 1].z - point.z) - (point.z - route[i - 1].z) * (route[i + 1].x - point.x)) > .00001))
  }, { label, start })
  if (!path.length) return
  for (const point of path) {
    for (let i = 0; i < 120; i++) {
      const current = await read(), dx = point.x - current.x, dz = point.z - current.z
      if (Math.hypot(dx, dz) < (online ? .7 : .25)) break
      const free = await page.evaluate(async ({ current, dx, dz }) => {
        const url = '/src/features/skewer/serviceHall/plan.ts', { walkable } = await import(/* @vite-ignore */ url)
        return { x: walkable({ x: current.x + Math.sign(dx) * .35, z: current.z }), z: walkable({ x: current.x, z: current.z + Math.sign(dz) * .35 }) }
      }, { current, dx, dz })
      const horizontal = Math.abs(dx) > Math.abs(dz) ? free.x || !free.z : !free.z && free.x
      const key = horizontal ? dx > 0 ? 'd' : 'a' : dz > 0 ? 's' : 'w'
      await page.keyboard.down(key)
      await page.waitForTimeout(online ? 70 : 25)
      await page.keyboard.up(key)
      await page.waitForTimeout(online ? 140 : 20)
      if (i === 119) throw new Error(`키보드 이동 실패: ${label}, ${JSON.stringify(current)} → ${JSON.stringify(point)}`)
    }
  }
}
