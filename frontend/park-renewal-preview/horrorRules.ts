// The rules of the underground (S15P31B105-450): a note at the way in, left by "the one who went down first", with
// five rules. No puzzles, nothing to work out: you only have to keep them, and keeping them is the frightening part,
// because every one of them asks you to stand still, or not to look, while something is there. Break one and it
// gets you (InteriorVisit.ambush); keep it and it lets you be, this time. A second note at the top of the labyrinth
// says rule 1 has changed. It has not (rule 5).
//
// This file is the pure part: the texts, the record of kept and broken rules, the checks (how far you have turned,
// how far you have moved) and which happening comes next. HorrorPresence runs the happenings, horrorRulesView draws
// the notes.

/** The note at the way in. Rule n is RULES[n - 1]. */
export const RULES = [
  '뒤에서 발소리가 다가오면, 그 자리에 멈춰 서세요. 절대 뒤돌아보지 마세요.',
  '불빛이 붉게 변하면, 원래대로 돌아올 때까지 움직이지 마세요.',
  '멀리 서 있는 사람과 눈이 마주쳤다면, 그것이 사라질 때까지 눈을 떼지 마세요.',
  '귓가에서 속삭임이 들리면, 그쪽을 보지 마세요.',
  '이 쪽지 말고 다른 쪽지는 믿지 마세요.',
] as const
export const NOTE = {
  title: '지하 미궁에서 지켜야 할 것',
  lead: '이 아래에서 길을 잃은 사람들이 남긴 규칙입니다. 하나라도 어기면, 그것들이 당신을 찾아옵니다.',
  sign: '— 먼저 내려간 사람',
  /** Under the rules: the chalk arrows (MazeArrows). */
  hint: '아래층은 미로예요. 갈림길 바닥에 분필로 화살표를 그려 두었어요. 그것만 따라오세요. 출구는 창살 너머에 있어요. 위로, 더 위로 올라가야 해요.',
}
/** The second note, at the top. It lies. */
export const TRAP_NOTE = {
  title: '관리실 공지',
  lines: ['안내드립니다.', '수칙 1번이 변경되었습니다.', '꼭대기까지 오신 분은 이제 뒤를 돌아보셔도 됩니다.', '뒤에 누가 서 있는지, 꼭 확인해 주세요.'],
  sign: '지하 미궁 관리실',
}
/** Where the second note lies: on the floor of the upper room (interiorAccess.upperRoom), feet height. */
export const TRAP_NOTE_AT = [-52.6, 14.2, -92.25] as const

/** What happens to you down here, between the scares. The first four test a rule; the rest are only the hall. */
export type Happening = 'approach' | 'redLight' | 'figure' | 'whisper' | 'footsteps' | 'lampsOut' | 'bang'
/** The rule each happening tests. */
export const RULE_OF: Partial<Record<Happening, number>> = { approach: 1, redLight: 2, figure: 3, whisper: 4 }
const WEIGHTS: readonly [Happening, number][] = [
  ['approach', .17], ['redLight', .17], ['figure', .2], ['whisper', .16], ['footsteps', .1], ['lampsOut', .12], ['bang', .08],
]
/** Seconds before the same rule is tested again. */
export const REST: Partial<Record<Happening, number>> = { approach: 70, redLight: 40, whisper: 20 }

/**
 * The next happening: one whose rule has not come up yet this visit more often than not, so a short visit still
 * meets every rule; never one still resting (`resting(h)`).
 */
export function pickHappening(seen: ReadonlySet<Happening>, resting: (h: Happening) => boolean, random: () => number = Math.random): Happening {
  const fresh = (Object.keys(RULE_OF) as Happening[]).filter(h => !seen.has(h) && !resting(h))
  if (fresh.length && random() < .65) return fresh[Math.floor(random() * fresh.length)]!
  const options = WEIGHTS.filter(([h]) => !resting(h))
  const total = options.reduce((sum, [, w]) => sum + w, 0)
  let r = random() * total
  for (const [h, w] of options) if ((r -= w) < 0) return h
  return 'bang'
}

/**
 * Radians the view has turned from `from` to `to` (flat directions, x and z), positive to the right: the same side
 * as a positive stereo pan (HorrorPresence.panOf).
 */
export function turnedBy(from: readonly [number, number], to: readonly [number, number]) {
  const rx = -from[1], rz = from[0]
  return Math.atan2(to[0] * rx + to[1] * rz, to[0] * from[0] + to[1] * from[1])
}
/** Looked back: turned more than this far round. */
export const LOOK_BACK = 1.75
/** Looked towards a whisper: turned this far towards its side. */
export const LOOK_SIDE = .85
/** Moved: walked further than this (m), once the grace is over. */
export const MOVED = .3
/** Seconds to stop after the run starts, or the light turns red. */
export const GRACE = { approach: .7, redLight: .85 } as const

/** Footsteps you walked, frame by frame, from a starting point. */
export class Stillness {
  private x = 0
  private z = 0
  moved = 0
  start(x: number, z: number) { this.x = x; this.z = z; this.moved = 0 }
  /** Add this frame; true once you have moved too far. */
  update(x: number, z: number) {
    this.moved += Math.hypot(x - this.x, z - this.z)
    this.x = x; this.z = z
    return this.moved > MOVED
  }
}

/** What you kept and broke this visit, rule by rule (index 0 is rule 1). */
export class RuleRecord {
  kept = [0, 0, 0, 0, 0]
  broken = [0, 0, 0, 0, 0]
  reset() { this.kept.fill(0); this.broken.fill(0) }
  keep(rule: number) { this.kept[rule - 1]!++ }
  break(rule: number) { this.broken[rule - 1]!++ }
  get keptCount() { return this.kept.reduce((a, b) => a + b, 0) }
  get brokenCount() { return this.broken.reduce((a, b) => a + b, 0) }
  /** The lines for the way out: what you kept, what you broke, and what that means. */
  summary(): string[] {
    const kept = this.keptCount, broken = this.brokenCount
    const lines = [`지킨 규칙 ${kept}번 · 어긴 규칙 ${broken}번`]
    if (this.broken[4]) lines.push('다른 쪽지를 믿었군요.')
    if (!kept && !broken) lines.push('그것들은 아직 당신을 시험하지 않았어요.')
    else if (!broken) lines.push('모든 규칙을 지켰어요. 그것들이 당신을 기억할 거예요.')
    else if (broken >= 3) lines.push('…그런데, 정말 혼자 나온 게 맞나요?')
    else lines.push('운이 좋았어요. 다음에도 그럴까요?')
    return lines
  }
}
export const ruleRecord = new RuleRecord()
