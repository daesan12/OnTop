import { getAuthSession } from '../../auth/authFlow'
import { useSession } from '../../network/worldClient'

export type MoleGame = 'whack-a-mole' | 'speed-mole'
export type MoleInput = 'KEYBOARD' | 'POINTER' | 'TOUCH'
export type MoleOutcome = 'HIT' | 'RAPID' | 'MISS' | 'DECOY' | 'IGNORED'

interface Observation {
  sequence: number
  clientAtMs: number
  hole: number
  input: MoleInput
  outcome: MoleOutcome
  spawnId?: number
  appearedAtMs?: number
  targetId?: string
}

const MAX_BATCH = 64
const FLUSH_DELAY_MS = 350

/** 게임 판정이나 정산을 기다리게 하지 않는 판 중 관측 전송이다. */
export class MoleTapRecorder {
  private readonly owner = useSession.getState().sessionId
  private readonly path: string
  private queue: Observation[] = []
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(game: MoleGame, roundId: string) {
    this.path = `/api/v1/minigames/${game}/rounds/${encodeURIComponent(roundId)}/observations`
  }

  push(tap: Observation) {
    this.queue.push(tap)
    if (this.queue.length === MAX_BATCH) {
      this.flush()
    } else {
      this.timer ??= setTimeout(() => this.flush(), FLUSH_DELAY_MS)
    }
  }

  flush() {
    clearTimeout(this.timer)
    this.timer = undefined
    const taps = this.queue
    this.queue = []
    const session = getAuthSession()
    if (!taps.length || !this.owner || useSession.getState().sessionId !== this.owner
      || session?.status !== 'AUTHENTICATED') return
    void fetch(this.path, {
      method: 'POST', keepalive: true, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taps }),
    }).catch(() => undefined)
  }
}
