import { expect, test, type Locator } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import path from 'node:path'
import os from 'node:os'

const viewports = [{ width: 1672, height: 941 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]
// Compare the rendered shared skin against the park, rather than hard-coding a second theme.
const appearance = (chat: Locator) => chat.evaluate(node => {
  const read = (element: Element, properties: string[]) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]))
  }
  return {
    panel: read(node, ['width', 'max-height', 'padding', 'gap', 'background-color', 'color', 'border-radius', 'border', 'transform', 'left', 'bottom']),
    title: read(node.querySelector('h1')!, ['font-family', 'font-size', 'color']),
    heading: read(node.querySelector('.park-chat__heading')!, ['padding', 'margin', 'gap']),
    composer: read(node.querySelector('.park-chat__composer')!, ['height', 'min-height', 'padding', 'gap', 'font-size', 'background-color', 'color', 'border-radius']),
  }
})

async function contained(chat: Locator) {
  const geometry = await chat.evaluate(node => {
    const outer = node.getBoundingClientRect(), composer = node.querySelector('.park-chat__composer')!.getBoundingClientRect()
    const inside = (r: DOMRect, parent: DOMRect) => r.left >= parent.left - 1 && r.right <= parent.right + 1 && r.top >= parent.top - 1 && r.bottom <= parent.bottom + 1
    const visible = (element: Element) => element.getClientRects().length > 0
    const controls = [...node.querySelectorAll('.park-chat__composer input,.park-chat__composer button,.park-chat__send-icon,.park-chat__composer img')].filter(visible)
    const input = node.querySelector('input')?.getBoundingClientRect(), close = node.querySelector('button[aria-label="채팅 입력창 닫기"]')?.getBoundingClientRect()
    return {
      inViewport: outer.left >= 0 && outer.right <= innerWidth && outer.top >= 0 && outer.bottom <= innerHeight,
      noOverflow: node.scrollWidth <= node.clientWidth && inside(composer, outer),
      controlsInside: controls.every(control => inside(control.getBoundingClientRect(), composer)),
      noInputOverlap: !input || !close || input.right <= close.left,
      buttonsClickable: [...node.querySelectorAll('.park-chat__composer button')].every(button => {
        const r = button.getBoundingClientRect()
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button
      }),
    }
  })
  expect(geometry).toEqual({ inViewport: true, noOverflow: true, controlsInside: true, noInputOverlap: true, buttonsClickable: true })
}

test('dice chat keeps messages and composer contained when collapsed, editing and reading history', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true, spectatorEvents: true,
    publicProfiles: { '102': { nickname: '긴이름의주사위참가자', characterGender: 'FEMALE' } } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  const parkChat = page.getByRole('region', { name: '주변 채팅', exact: true })
  const parkAppearance = new Map<string, Awaited<ReturnType<typeof appearance>>>()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const mode of ['closed', 'open', 'history'] as const) {
      if (mode === 'open') await parkChat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
      if (mode === 'history') {
        await parkChat.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
        await parkChat.getByRole('button', { name: '채팅 입력창 닫기', exact: true }).click()
      }
      await contained(parkChat)
      parkAppearance.set(`${viewport.width}/${mode}`, await appearance(parkChat))
      if (viewport.width === 1672) await screenshot(page, `park-chat-reference-${mode}`)
    }
    await parkChat.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
  }
  await page.setViewportSize(viewports[0])
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 }); server.confirmStart()
  await expect(page.getByRole('region', { name: '주사위 경기', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady)).toBe(true)
  const chat = page.getByRole('region', { name: '경기 채팅', exact: true })
  await chat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await contained(chat); await screenshot(page, 'farkle-chat-empty')
  await chat.getByRole('button', { name: '채팅 입력창 닫기', exact: true }).click()
  for (let index = 0; index < 20; index++) server.spectatorEvent('chat', {
    senderUserId: '102', text: `대화 ${index + 1} ${'긴 대화도 채팅창 안에서 줄을 바꾸며 끝까지 읽을 수 있어요. '.repeat(3)}`.trim(),
  })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const mode of ['closed', 'open', 'history'] as const) {
      if (mode === 'open') {
        await chat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
        const input = chat.getByRole('textbox', { name: '경기 채팅 메시지', exact: true })
        await input.fill('긴입력도버튼공간을침범하지않아야해요'.repeat(4))
        await contained(chat)
        await input.press('Tab')
        expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(0)
        const text = `전송 버튼 확인 ${viewport.width}`
        await input.fill(text)
        // Keep the real one-second chat throttle; rapid viewport QA is not a second send gesture.
        if (viewport.width !== 1672) await page.waitForTimeout(1100)
        await chat.getByRole('button', { name: '메시지 보내기', exact: true }).click()
        await expect(chat.getByText(text, { exact: true })).toBeVisible()
        await chat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
      }
      if (mode === 'history') {
        await chat.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
        await chat.getByRole('button', { name: '채팅 입력창 닫기', exact: true }).click()
      }
      expect(await appearance(chat), `${viewport.width}/${mode} uses the park chat dimensions and colors`).toEqual(parkAppearance.get(`${viewport.width}/${mode}`))
      await screenshot(page, `farkle-chat-${mode}-${viewport.width}x${viewport.height}`)
      if (mode === 'open') await chat.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), `farkle-chat-input-${viewport.width}.png`) })
      await contained(chat)
      if (mode === 'history') {
        const log = chat.getByRole('log'), box = (await log.boundingBox())!
        expect(await log.evaluate(node => node.scrollHeight > node.clientHeight && node.clientHeight > 20)).toBe(true)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -10000)
        await expect.poll(() => log.evaluate(node => node.scrollTop)).toBe(0)
        server.spectatorEvent('chat', { senderUserId: '102', text: '이전 대화를 읽는 중 새 메시지' })
        await expect(chat.getByText('이전 대화를 읽는 중 새 메시지', { exact: true }).last()).toBeAttached()
        expect(await log.evaluate(node => node.scrollTop)).toBe(0)
        await page.mouse.wheel(0, 100000)
        await expect.poll(() => log.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(2)
      }
    }
    await chat.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
  }
  await chat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const input = chat.getByRole('textbox', { name: '경기 채팅 메시지', exact: true })
  await input.fill('보관할 채팅 내용')
  await page.getByRole('button', { name: 'T 점수표', exact: true }).click()
  await expect(chat).toBeHidden()
  await page.keyboard.press('Escape'); await expect(chat).toBeVisible()
  await expect(input).toHaveValue('보관할 채팅 내용')
  server.rejectChat(); await page.waitForTimeout(1100); await chat.getByRole('button', { name: '메시지 보내기', exact: true }).click()
  await expect(chat.getByRole('status')).toContainText('내용을 보관')
  await expect(input).toHaveValue('보관할 채팅 내용'); await contained(chat)
  await screenshot(page, 'farkle-chat-rejected-844x390')
  expect(server.sent.filter(message => message.type === 'GAME_SPECTATOR_CHAT_SEND')).toHaveLength(6)
  expect(server.sent.filter(message => message.type === 'WORLD_CHAT_SEND' || message.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})
