export interface Message { id: string; author: string; text: string; hidden: boolean; version: number; processed: boolean; sentAt: number }
export interface Npc { id: string; name: string; persona: string; role: string; action: string; x: number; z: number; speech: string; speechSource: string; speechUntil: number; generation: number }
export interface Analysis { source: string; advantage: string; blackEstimate: number | null; depth: number; elapsedMs: number; bestMove: string; comment: string }
export interface Report { id: string; text: string; createdAt: number; triage: null | { type: string; area: string; severity: number; provider: string }; digestId: string }
export interface Notice { id: string; kind: string; text: string; status: string; attempts: number; nextAttemptAt: number; sentAt: number; key: string }
export interface Incident { id: string; scope: string; kind: string; messageIds: string[]; createdAt: number; provider: string; actors: string[]; x: number; z: number; policeStatus: string; policeAttempts: number }
export interface Visitor { author: string; scope: string; x: number; z: number; moving: boolean; targetX: number; targetZ: number; version: number }
export interface State {
  now: number; scope: string; mode: string; notifier: string; npcs: Npc[]; messages: Message[];
  visitors: Visitor[];
  moderationWindowSize?: number;
  operations: { running: boolean; nextBatchAt: number; lastError: string; decisionFailure: boolean; notifierFailure: boolean };
  route: { x: number; z: number }[];
  game: { id: string; version: number; active: boolean; turn: string; analyzing: boolean;
    board: { board: number[][]; moveCount: number; outcome: string; lastMove: { x: number; y: number } | null; forbiddenMoves: { x: number; y: number; kind: string }[] }; analysis: Analysis };
  reports?: Report[]; notices?: Notice[]; incidents?: Incident[];
  moderationAssessments?: Record<string, { provider: string; probability: number; hideThreshold: number; verdict: 'NORMAL' | 'UNCERTAIN' | 'VIOLATION'; evaluatedAt: number; conversationIds?: string[]; utteranceProbability?: number; contributionProbability?: number; spellingCandidateCount?: number; guidanceDigest?: string; utteranceThreshold?: number; profanityProbability?: number; mentionProbability?: number; profanityThreshold?: number; mentionThreshold?: number; reason?: string; policyVersion?: string }>;
  reviewMessages?: { chat: { id: string; text: string; author: string; scope: string }; hidden: boolean; version: number }[];
}

export async function command(action: string, fields: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch('/dev/ai/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ai-Lab': 'local' },
    body: JSON.stringify({ action, ...fields }), signal: AbortSignal.timeout(15_000) })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(typeof body === 'object' && body && 'error' in body ? String(body.error) : '요청을 처리하지 못했습니다.')
  return body
}
export async function adminState(scope: string, signal: AbortSignal, author = ''): Promise<State> {
  const response = await fetch(`/dev/ai/state?scope=${encodeURIComponent(scope)}&author=${encodeURIComponent(author)}&admin=true`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('관리자 검수 데이터를 불러오지 못했습니다.')
  return response.json() as Promise<State>
}
