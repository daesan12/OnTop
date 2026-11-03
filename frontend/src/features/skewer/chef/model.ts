import { ingredientName } from '../game'
import type { IngredientId } from '../game'
import { cooperativeRecipe, canThreadCooperative, validCooperativeRecipe, INITIAL_PANTRY, shuffledPantry } from '../cooperativeMenu'

export type ChefJob = { id: string; table: number; recipe: IngredientId[] }
export type HallSight = { position: { x: number; z: number }; carrying: boolean; cleaning: boolean; tables: { id: number; people: number; eating: boolean; dirty: boolean }[] }
export type ChefView = { hallSight?: HallSight; pantry?: IngredientId[]; completed?: number; visible: ChefJob[]; waiting: number; selectedJob: string | null; ingredient: IngredientId; skewer: IngredientId[]; pass: ChefJob[]; message: string; revision: number; seconds: number; started: boolean; cooperative?: { phase: string; greeting: boolean; answered: boolean; speech: boolean; countdown: number; paused: boolean; score?: number; rankingEligible?: boolean; result?: { score: number; reward: string; ranking: string } } }
export type ChefAction = { type: 'select'; ingredient: IngredientId } | { type: 'thread'; ingredient?: IngredientId } | { type: 'choose'; id: string } | { type: 'unthread' | 'submit' | 'pickup' | 'ready' | 'greet' | 'exit' }
const samples = (): ChefJob[] => [
  ...[1, 4, 3, 6].map(table => ({ id: `sample-${String(table).padStart(2, '0')}`, table, recipe: cooperativeRecipe(table) })),
]

/** A local delivered-order fixture. Hidden recipes never enter the rendered view. No rewards/network. */
export class ChefPreview {
  private jobs = samples()
  private selectedJob: string | null = this.jobs[0].id
  private ingredient: IngredientId = 'tomato'
  private skewer: IngredientId[] = []
  private pass: ChefJob[] = []
  private completed = 0
  private pantry = [...INITIAL_PANTRY]
  private message = ''; private revision = 0; private elapsed = 0; private started = false
  readonly duration = 240
  view(): ChefView {
    return { pantry: [...this.pantry], completed: this.completed, visible: this.jobs.slice(0, 2), waiting: Math.max(0, this.jobs.length - 2), selectedJob: this.selectedJob, ingredient: this.ingredient, skewer: [...this.skewer], pass: [...this.pass], message: this.message, revision: this.revision, seconds: Math.max(0, this.duration - this.elapsed), started: this.started }
  }
  private say(message: string) { this.message = message; this.revision++ }
  clearIncoming() { this.jobs = []; this.selectedJob = null; this.skewer = []; this.say('서빙 담당의 주문표를 기다리고 있어요.') }
  receiveSamples() { if (this.jobs.length) return this.say('먼저 받은 주문을 완성해 주세요.'); this.jobs = samples(); this.selectedJob = this.jobs[0].id; this.say('샘플 주문표를 받았어요. 앞의 두 장만 확인할 수 있어요.') }
  step(dt: number) { if (this.started && this.elapsed < this.duration) { this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, Math.min(.1, dt))); if (this.elapsed === this.duration) this.say('로컬 연습 시간이 끝났어요. 초기화해서 다시 확인할 수 있어요.') } }
  action(action: ChefAction) {
    if (action.type === 'ready' || action.type === 'greet' || action.type === 'exit') return
    if (action.type === 'pickup') { const dish = this.pass.shift(); return this.say(dish ? `${dish.table}번 접시를 샘플 서빙 담당이 수령했어요.` : '전달대가 비어 있어요.') }
    if (this.elapsed >= this.duration) return
    if (action.type === 'select') { this.ingredient = action.ingredient; this.revision++; return }
    if (action.type === 'choose') {
      if (!this.jobs.slice(0, 2).some(j => j.id === action.id)) return
      this.selectedJob = action.id; this.say('제출할 주문표를 선택했어요. 조립 중인 꼬치는 유지돼요.'); return
    }
    if (!this.jobs.length) return this.say('주문표를 전달받으면 조리를 시작할 수 있어요.')
    if (action.type === 'unthread') { const last = this.skewer.pop(); return this.say(last ? `끝에서 ${ingredientName(last)} 하나를 뺐어요.` : '아직 빈 꼬치예요.') }
    if (action.type === 'thread') {
      const id = action.ingredient ?? this.ingredient
      if (!canThreadCooperative(this.skewer, id)) return this.say('치즈·베이컨 사이에는 다른 재료가 정확히 한 개 필요해요. 재료별 최대 수량도 확인해 주세요.')
      this.skewer.push(id); this.started = true; this.say(`${ingredientName(id)} 하나를 꽂았어요.`); return
    }
    if (!validCooperativeRecipe(this.skewer)) return this.say('치즈·베이컨은 2~3개, 같은 큐브 사이에는 다른 재료가 정확히 한 개 필요해요.')
    const job = this.jobs.slice(0, 2).find(j => j.id === this.selectedJob)
    if (!job) return
    if (this.pass.length >= 2) return this.say('전달대가 가득 찼어요. 서빙 담당의 수령을 기다려 주세요.')
    this.pass.push({ ...job, recipe: [...this.skewer] })
    this.jobs = this.jobs.filter(j => j.id !== job.id)
    this.completed++; this.pantry = shuffledPantry(this.pantry); this.ingredient = this.pantry[0]
    this.selectedJob = this.jobs[0]?.id ?? null; this.skewer = []
    this.say(job.table + '번 접시를 전달대에 놓았어요.')
  }
}

/** Shared by the tracked VR input and deterministic spatial tests. */
export function insertionReady(distance: number, alignment: number) {
  return Number.isFinite(distance) && distance >= 0 && distance <= .16 && Number.isFinite(alignment) && Math.abs(alignment) >= .80
}
