import { expect, it } from 'vitest'
import { parkDialogues } from '../../src/features/ai/parkDialogue'
import { closeParkDialogue, openParkDialogue, useParkDialogue } from '../../src/features/ai/parkDialogueState'
import { winterRoofSnowActive } from '../../src/features/winter/boardView'

it('눈사람은 현재 눈싸움 규칙을 안내하고 산타 이야기로 마친다', () => {
  const lines = parkDialogues.snowman.lines.join(' ')
  for (const part of ['Q', 'R', '3개', '세 번', '5초', 'A', 'D', '여섯 번']) expect(lines).toContain(part)
  expect(parkDialogues.snowman.lines.at(-1)).toMatch(/산타가 할 말이 있다던데\.\.\.$/)
})
it('산타는 응원·트리 참여·마지막 모임을 순서대로 안내한다', () => {
  const story = parkDialogues.santa.lines
  expect(story[0]).toMatch(/한 학기.*고생/)
  expect(story[0]).toContain('응원')
  expect(story[1]).toContain('트리에 남겨')
  expect(story[2]).toMatch(/힘을 모아/)
  expect(story.at(-1)).toMatch(/11월 27일 금요일.*모여 사진/)
  expect(new Date('2026-11-27T00:00:00Z').getUTCDay()).toBe(5)
})
it.each(['elder', 'hansu', 'child'] as const)('%s는 기존 초상화와 오목 주민 대국 안내를 사용한다', id => {
  expect(parkDialogues[id].portrait).toMatch(/\/npc-portraits\/.+\.webp$/)
  expect(parkDialogues[id].lines.join(' ')).toContain('오목')
  expect(parkDialogues[id].lines.join(' ')).toContain('주민과 두기')
})
it('계정·채널별 대화 범위를 기록하고 닫을 때 제거한다', () => {
  openParkDialogue('santa', '101:channel-1')
  expect(useParkDialogue.getState()).toEqual({ speaker: 'santa', scope: '101:channel-1' })
  closeParkDialogue()
  expect(useParkDialogue.getState().speaker).toBeNull()
})
it('관전 벤치에서는 눈을 유지하고 일반 보드·개인 요리 화면에서는 숨긴다', () => {
  const session = { tableId: '', focusedAnchorId: 'table-5', benchId: 'pavilion-bench' }
  const game = { game: {}, watchedGameId: 'match' }, lobby = { joiningAnchorId: '', spectatorRequested: true }
  expect(winterRoofSnowActive(session, game, lobby)).toBe(true)
  expect(winterRoofSnowActive({ ...session, benchId: '' }, game, lobby)).toBe(false)
  expect(winterRoofSnowActive(session, game, lobby, true)).toBe(false)
})
