import { TABLES } from '../config'
import { record } from './protocol'

export interface TableBinding {
  channelId: string
  tableId: string
  anchorId: string
}
/** Deployment input, not a server DTO. Never infer placement from UUIDs or list order. */
export function parseBindings(value: unknown): TableBinding[] {
  if (!Array.isArray(value))
    throw new Error('테이블 배치 설정은 배열이어야 합니다.')
  const used = new Set<string>()
  return value.map((item) => {
    if (
      !record(item) ||
      typeof item.channelId !== 'string' ||
      !item.channelId ||
      typeof item.tableId !== 'string' ||
      !item.tableId ||
      typeof item.anchorId !== 'string' ||
      !TABLES.some((t) => t.id === item.anchorId)
    )
      throw new Error('서버 테이블과 공원 배치 설정을 확인해주세요.')
    for (const key of [
      `${item.channelId}:server:${item.tableId}`,
      `${item.channelId}:anchor:${item.anchorId}`,
    ]) {
      if (used.has(key)) throw new Error('테이블 배치 설정이 중복되었습니다.')
      used.add(key)
    }
    return {
      channelId: item.channelId,
      tableId: item.tableId,
      anchorId: item.anchorId,
    }
  })
}
export function bindAnchor(
  bindings: readonly TableBinding[],
  channelId: string,
  anchorId: string,
  serverIds: readonly string[],
) {
  const binding = bindings.find(
    (b) => b.channelId === channelId && b.anchorId === anchorId,
  )
  return binding && serverIds.includes(binding.tableId) ? binding.tableId : null
}
