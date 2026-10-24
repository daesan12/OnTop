import type { Pawn } from './protocol'
export const COLORS = ['#dc404d', '#a45ddd', '#36b968', '#398bea'] as const
export const STAGES = { AWAITING_ROLL: '비밀 주사위 굴리기', DECLARING: '숫자 선언', RESPONDING: '순차 판단', RESOLVING: '판정 연출', FINISHED: '경기 종료' }
export const PAWNS = { ACTIVE: '다리 위', RESERVE: '예비', SCORED: '골인', FALLEN: '추락', REMOVED_SCORED: '골인 제거', FORFEITED: '기권' }
export const END: Record<string, string> = { THREE_GOALS: '유효 골인 말 3개 달성', LAST_PLAYER_STANDING: '기권하지 않은 마지막 참가자', ABORTED_NO_PLAYERS: '모든 참가자 기권 · 승자 없음',
  GOAL_SLOTS_EXHAUSTED: '8번까지 골인 번호 발급 · 현재 최고 점수', NO_RUNNABLE_PAWNS: '이동할 말 소진 · 현재 최고 점수' }
export const EVENTS: Record<string, string> = { START: '첫 차례', ROLL: '비밀 주사위를 굴렸습니다.', DECLARE: '숫자를 선언했습니다.', TRUST: '다음 판단자를 기다립니다.',
  ALL_TRUSTED: '모두 믿음 · 실제 눈은 공개하지 않습니다.', DOUBT_SUCCESS: '거짓말을 찾아냈습니다.', DOUBT_FAILED: '선언이 사실입니다.',
  TURN_TIMEOUT: '시간 만료 · 굴림/선언 없이 차례를 넘겼습니다.', JUDGE_TIMEOUT: '판단 시간 만료 · 믿기로 처리되었습니다.', PLAYER_LEFT: '참가자 기권 상태가 변경되었습니다.' }
export interface Pose { x: number; y: number; z: number; scale: number; roll: number }
export const plankX = (position: number) => -.62 + (position - 1) * .14
export const goalZ = (slot: number) => -.45 + (slot - 1) * .128
export const plankY = (position: number) => .055 + Math.sin((position - 1) / 7 * Math.PI) * .04
export function pawnPose(pawn: Pawn, playerIndex: number): Pose {
  const pose: Pose = { x: 0, y: .05, z: 0, scale: 0, roll: 0 }
  if (pawn.status === 'ACTIVE') {
    pose.x = pawn.position === 0 ? -.8 : plankX(pawn.position); pose.y = pawn.position === 0 ? .05 : plankY(pawn.position)
    pose.z = (playerIndex - 1.5) * .08; pose.scale = 1
  } else if (pawn.goalSlot !== null && ['SCORED', 'REMOVED_SCORED'].includes(pawn.status)) {
    pose.x = .82; pose.z = goalZ(pawn.goalSlot); pose.y = .075; pose.scale = pawn.status === 'SCORED' ? 1 : 0
  } else {
    const n = (pawn.id - 1) % 7; pose.x = -.94 + n % 2 * .045; pose.z = -.48 + playerIndex * .23 + Math.floor(n / 2) * .035
    pose.scale = pawn.status === 'RESERVE' ? .5 : 0
  }
  return pose
}
