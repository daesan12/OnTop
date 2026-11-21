export type YutChatScope = 'ALL' | 'TEAM'
export interface YutChatMessage { id: number; scope: YutChatScope; team: number; userId: string; nickname: string; text: string; sentAt: number }
export interface YutRules { emptyBackEnters: boolean; doubleCaptureBonus: boolean; backHomeFinish: boolean }
export interface YutMove { piece: number; rollId: number; shortcut: boolean; to: number }
export interface YutRoll { id: number; name: string; steps: number; mask: number; bonus: boolean }
export interface YutPlayer { userId: string; nickname: string; team: number; ready: boolean; connected: boolean }
export interface YutSnapshot {
  gameId: string; version: number; registered: boolean; role: 'PLAYER' | 'SPECTATOR'
  privateState: { teamChat?: YutChatMessage[] }
  publicState: {
    gameCode: 'YUTNORI'; phase: 'WAITING' | 'PLAYING' | 'FINISHED'; channelId: string; roomName: string
    host: string; turnUser: string; team: number; credits: number; deadline: number; winner: number; reason: string
    message: string; entryFee: 0; rules: YutRules; players: YutPlayer[]; rolls: YutRoll[]; pieces: number[][]
    chat: YutChatMessage[]; moves: YutMove[]; opening: number[]; log: string[]; teamCount: number; pieceCount: number; eliminatedTeams: number[]
  }
}
export interface YutRoom { gameId: string; name: string; hostNickname: string; players: number; phase: string; teamCount: number; pieceCount: number }
export const defaultRules: YutRules = { emptyBackEnters: false, doubleCaptureBonus: false, backHomeFinish: false }
export const teamName = (team: number) => ['청팀', '홍팀', '녹팀', '황팀'][team] ?? '알 수 없는 팀'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function parseYut(value: unknown): YutSnapshot | null {
  if (!object(value) || typeof value.gameId !== 'string' || !value.gameId.startsWith('yut-')
    || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || typeof value.registered !== 'boolean'
    || !['PLAYER', 'SPECTATOR'].includes(String(value.role)) || !object(value.publicState)) return null
  const p = value.publicState
  const validTeam = (team: unknown) => Number.isInteger(team) && (team as number) >= 0 && (team as number) < (p.teamCount as number)
  const chatMessage = (entry: unknown, scope: YutChatScope) => object(entry) && entry.scope === scope
    && Number.isSafeInteger(entry.id) && (entry.id as number) > 0 && Number.isSafeInteger(entry.sentAt)
    && typeof entry.userId === 'string' && typeof entry.nickname === 'string' && typeof entry.text === 'string'
    && entry.text.length <= 100 && (scope === 'ALL' ? entry.team === -1 : validTeam(entry.team))
  if (!object(value.privateState) || value.role === 'SPECTATOR' && Object.keys(value.privateState).length !== 0
    || value.privateState.teamChat !== undefined && (!Array.isArray(value.privateState.teamChat)
      || !value.privateState.teamChat.every(entry => chatMessage(entry, 'TEAM')))
    || !Array.isArray(p.chat) || !p.chat.every(entry => chatMessage(entry, 'ALL'))) return null
  if (p.gameCode !== 'YUTNORI' || !['WAITING', 'PLAYING', 'FINISHED'].includes(String(p.phase))
    || ![2, 3, 4].includes(p.teamCount as number) || ![1, 2, 3, 4].includes(p.pieceCount as number)
    || !Array.isArray(p.eliminatedTeams) || !p.eliminatedTeams.every(validTeam)
    || new Set(p.eliminatedTeams).size !== p.eliminatedTeams.length
    || !Array.isArray(p.players) || p.players.length < 1 || p.players.length > 4
    || !p.players.every(player => object(player) && typeof player.userId === 'string' && typeof player.nickname === 'string'
      && validTeam(player.team) && typeof player.ready === 'boolean' && typeof player.connected === 'boolean')
    || !Array.isArray(p.pieces) || p.pieces.length !== p.teamCount || !p.pieces.every(tokens => Array.isArray(tokens)
      && tokens.length === p.pieceCount && tokens.every(node => Number.isInteger(node) && node >= 0 && node <= 30))
    || !Array.isArray(p.rolls) || !p.rolls.every(roll => object(roll) && Number.isInteger(roll.id)
      && typeof roll.name === 'string' && Number.isInteger(roll.steps) && Number.isInteger(roll.mask))
    || !Array.isArray(p.moves) || !p.moves.every(move => object(move) && Number.isInteger(move.piece)
      && Number.isInteger(move.rollId) && Number.isInteger(move.to) && typeof move.shortcut === 'boolean')
    || !Array.isArray(p.log) || !p.log.every(line => typeof line === 'string') || !Array.isArray(p.opening)
    || !object(p.rules) || !Object.values(p.rules).every(rule => typeof rule === 'boolean')
    || !['host', 'turnUser', 'roomName', 'channelId', 'message', 'reason'].every(key => typeof p[key] === 'string')
    || !validTeam(p.team) || !(p.winner === -1 || validTeam(p.winner))
    || !Number.isInteger(p.credits) || !Number.isSafeInteger(p.deadline) || p.entryFee !== 0) return null
  return value as unknown as YutSnapshot
}
