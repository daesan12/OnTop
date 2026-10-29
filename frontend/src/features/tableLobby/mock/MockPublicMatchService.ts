import type { PublicMatchReference, PublicMatchService } from '../publicMatch'

export function createMockPublicMatchService(): PublicMatchService & { set(ref: PublicMatchReference): void; clear(): void } {
  // Empty until an explicit preview scenario supplies a public reference. No guessed table→game ID.
  const refs = new Map<string, PublicMatchReference>()
  const key = (channelId: string, tableId: string) => JSON.stringify([channelId, tableId])
  return {
    mode: 'mock',
    find: context => refs.get(key(context.channelId, context.tableId)) ?? null,
    set(ref) {
      if (![ref.channelId, ref.tableId, ref.gameId].every(s => typeof s === 'string' && !!s.trim() && s.length <= 120))
        throw new Error('M09_PUBLIC_MATCH_MOCK_ONLY: 잘못된 미리보기 참조')
      refs.set(key(ref.channelId, ref.tableId), { ...ref })
    },
    clear: () => refs.clear(),
  }
}
