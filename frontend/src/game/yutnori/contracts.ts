export interface YutRules { emptyBackEnters: boolean; doubleCaptureBonus: boolean; backHomeFinish: boolean }
export interface YutMove { piece: number; rollId: number; shortcut: boolean; to: number }
export interface YutRoll { id: number; name: string; steps: number; mask: number; bonus: boolean }
export interface YutPlayer { userId: string; nickname: string; team: number; ready: boolean; connected: boolean }
export interface YutSnapshot {
  gameId: string; version: number; registered: boolean; role: 'PLAYER' | 'SPECTATOR'
  publicState: {
    gameCode: 'YUTNORI'; phase: 'WAITING' | 'PLAYING' | 'FINISHED'; channelId: string; roomName: string
    host: string; turnUser: string; team: number; credits: number; deadline: number; winner: number; reason: string
    message: string; entryFee: 0; rules: YutRules; players: YutPlayer[]; rolls: YutRoll[]; pieces: number[][]
    moves: YutMove[]; opening: number[]; log: string[]
  }
}
export interface YutRoom { gameId: string; name: string; hostNickname: string; players: number; phase: string }
export const defaultRules: YutRules = { emptyBackEnters: false, doubleCaptureBonus: false, backHomeFinish: false }
export const teamName = (team: number) => team === 0 ? '청팀' : '홍팀'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function parseYut(value: unknown): YutSnapshot | null {
  if (!object(value) || typeof value.gameId !== 'string' || !value.gameId.startsWith('yut-')
    || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || typeof value.registered !== 'boolean'
    || !['PLAYER', 'SPECTATOR'].includes(String(value.role)) || !object(value.publicState)) return null
  const p = value.publicState
  if (p.gameCode !== 'YUTNORI' || !['WAITING', 'PLAYING', 'FINISHED'].includes(String(p.phase))
    || !Array.isArray(p.players) || p.players.length < 1 || p.players.length > 4
    || !p.players.every(player => object(player) && typeof player.userId === 'string' && typeof player.nickname === 'string'
      && [0, 1].includes(player.team as number) && typeof player.ready === 'boolean' && typeof player.connected === 'boolean')
    || !Array.isArray(p.pieces) || p.pieces.length !== 2 || !p.pieces.every(tokens => Array.isArray(tokens)
      && tokens.length === 4 && tokens.every(node => Number.isInteger(node) && node >= 0 && node <= 30))
    || !Array.isArray(p.rolls) || !p.rolls.every(roll => object(roll) && Number.isInteger(roll.id)
      && typeof roll.name === 'string' && Number.isInteger(roll.steps) && Number.isInteger(roll.mask))
    || !Array.isArray(p.moves) || !p.moves.every(move => object(move) && Number.isInteger(move.piece)
      && Number.isInteger(move.rollId) && Number.isInteger(move.to) && typeof move.shortcut === 'boolean')
    || !Array.isArray(p.log) || !p.log.every(line => typeof line === 'string') || !Array.isArray(p.opening)
    || !object(p.rules) || !Object.values(p.rules).every(rule => typeof rule === 'boolean')
    || !['host', 'turnUser', 'roomName', 'channelId', 'message', 'reason'].every(key => typeof p[key] === 'string')
    || ![0, 1].includes(p.team as number) || ![-1, 0, 1].includes(p.winner as number)
    || !Number.isInteger(p.credits) || !Number.isSafeInteger(p.deadline) || p.entryFee !== 0) return null
  return value as unknown as YutSnapshot
}
