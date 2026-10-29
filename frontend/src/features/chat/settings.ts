/** Prototype presentation only. Message length, range and send rate remain server-owned. */
// radiusMeters only labels the panel; it mirrors the BE default chatRadius (docs/world-proximity.md).
export const CHAT = { historyLimit: 100, expandedDurationMs: 20_000, previewRows: 6, collapsedRows: 2, radiusMeters: 20 } as const
