import { positiveModulo, type WorldEnvironmentConfig } from '../config/environment'

type Pair = readonly [number, number]
type Constellation = {
  name: string
  azimuth: number
  elevation: number
  horizontalScale: number
  bounds: readonly [number, number, number]
  label: Pair
  stars: readonly Pair[]
  edges: readonly Pair[]
}

// The figures use stylized positions suited to the park's view. -Z is north.
function figure(name: string, azimuth: number, elevation: number, stars: readonly Pair[], edges: readonly Pair[]): Constellation {
  // Leave room for the label below the figure in the telescope's circular view.
  const points = stars.map(([x, y]) => [x * .8, y * .8 + .023] as const)
  const low = Math.min(...points.map(([, y]) => y))
  const high = Math.max(...points.map(([, y]) => y))
  return {
    name, azimuth, elevation, horizontalScale: Math.cos(elevation),
    bounds: [Math.max(.08, ...points.map(([x]) => Math.abs(x) + .012)), low - .052, high + .012],
    label: [0, low - .03], stars: points, edges,
  }
}

const northern: readonly Constellation[] = [
  {
    name: '북두칠성', azimuth: -1.93, elevation: .42, horizontalScale: .91,
    bounds: [.18, -.14, .11], label: [.015, -.116],
    stars: [[-.154, .055], [-.105, .032], [-.059, .003], [-.009, -.013], [.018, -.079], [.108, -.074], [.13, .003]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: '카시오페이아자리', azimuth: -1.18, elevation: .58, horizontalScale: .84,
    bounds: [.15, -.12, .09], label: [0, -.082],
    stars: [[-.123, .039], [-.068, -.04], [-.005, .052], [.052, -.019], [.111, .058]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
]

// Winter, spring, summer, autumn. The first figure represents its season every night.
const seasonal = [
  [
    {
      name: '오리온자리', azimuth: Math.PI / 2, elevation: .44, horizontalScale: .91,
      bounds: [.15, -.16, .14], label: [0, -.135],
      stars: [[-.039, -.009], [0, .001], [.035, .012], [-.094, .086], [.076, .118], [-.083, -.097], [.105, -.084]],
      edges: [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [0, 5], [5, 6], [6, 2]],
    },
    figure('황소자리', .64, .57,
      [[-.13, .105], [-.056, .023], [.005, -.067], [.058, -.008], [.122, .093], [.043, -.025]],
      [[0, 1], [1, 2], [2, 5], [5, 3], [3, 4]]),
    figure('쌍둥이자리', -.34, .46,
      [[-.052, .104], [-.072, .042], [-.091, -.02], [-.122, -.084], [.058, .106], [.064, .043], [.083, -.022], [.12, -.086]],
      [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [1, 5], [2, 6]]),
    figure('큰개자리', 2.55, .34,
      [[-.084, .06], [-.047, .097], [.001, .034], [.031, -.026], [.107, -.016], [.108, -.082], [-.031, -.093]],
      [[0, 1], [1, 2], [0, 2], [2, 3], [3, 4], [4, 5], [3, 6]]),
  ],
  [
    figure('사자자리', 1.57, .52,
      [[-.12, .09], [-.076, .109], [-.037, .074], [-.065, .021], [-.071, -.058], [.035, -.032], [.113, -.049], [.062, .035]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 5]]),
    figure('목동자리', .64, .62,
      [[-.014, -.098], [-.076, -.004], [-.057, .077], [.017, .108], [.069, .052], [.058, -.014]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]),
    figure('처녀자리', 2.55, .37,
      [[-.12, .064], [-.059, .03], [.006, .013], [.059, .078], [.022, -.066], [.105, -.093], [.117, .019]],
      [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [2, 6]]),
    figure('북쪽왕관자리', -.34, .62,
      [[-.116, .053], [-.091, .005], [-.054, -.039], [-.004, -.05], [.042, -.035], [.083, -.001], [.111, .052]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]),
  ],
  [
    figure('백조자리', .64, .63,
      [[-.019, .12], [0, .047], [.023, -.038], [.056, -.12], [-.07, .013], [-.137, -.013], [.075, .076], [.131, .09]],
      [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7]]),
    figure('거문고자리', -.34, .59,
      [[-.073, .09], [-.021, .04], [.052, .042], [.078, -.053], [.004, -.055]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]]),
    figure('독수리자리', 1.57, .50,
      [[-.004, .103], [.019, .057], [.041, .006], [-.055, .019], [-.123, -.039], [.085, -.03], [.119, -.073], [.001, -.084]],
      [[0, 1], [1, 2], [1, 3], [3, 4], [2, 5], [5, 6], [2, 7]]),
    figure('전갈자리', 2.55, .36,
      [[-.135, .077], [-.124, .022], [-.082, .038], [-.029, .011], [-.003, -.06], [.042, -.098], [.098, -.077], [.129, -.027], [.107, .004]],
      [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]),
  ],
  [
    figure('페가수스자리', 1.57, .58,
      [[-.056, .085], [.068, .083], [.063, -.035], [-.061, -.047], [-.117, .026], [-.143, -.012], [-.105, -.085]],
      [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 5], [3, 6]]),
    figure('안드로메다자리', .64, .64,
      [[-.13, -.053], [-.061, -.024], [.005, .006], [.067, .033], [.131, .072], [.051, .063], [.083, .108]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]]),
    figure('페르세우스자리', -.34, .61,
      [[-.116, .083], [-.059, .058], [-.007, .016], [.035, -.041], [.079, -.094], [.046, .052], [.101, .073], [-.063, -.063]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [2, 7]]),
    figure('물고기자리', 2.55, .40,
      [[-.144, .048], [-.111, .072], [-.074, .052], [-.088, .014], [-.032, -.026], [.039, -.076], [.079, -.009], [.099, .066], [.13, .104], [.146, .059]],
      [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 7]]),
  ],
] as const satisfies readonly (readonly Constellation[])[]

export const constellations: readonly Constellation[] = [...northern, ...seasonal.flat()]
const northernIndices = northern.map(pattern => constellations.indexOf(pattern))
const seasonalIndices = seasonal.map(group => group.map(pattern => constellations.indexOf(pattern)))

const gameCalendarStart = Date.UTC(2026, 0, 1)
const calendarDayMs = 86_400_000

export function constellationNightIndex(serverTime: number, { epochMs, dayDurationMs }: WorldEnvironmentConfig) {
  // The evening's date applies until the following dawn, including after midnight.
  return Math.floor((serverTime - epochMs) / dayDurationMs - .5)
}

export function selectConstellations(nightIndex: number) {
  const month = new Date(gameCalendarStart + nightIndex * calendarDayMs).getUTCMonth()
  const season = Math.floor(((month + 1) % 12) / 3)
  const group = seasonalIndices[season]!
  const hidden = group[1 + positiveModulo(nightIndex, group.length - 1)]!
  return { season, hidden, visible: [...northernIndices, ...group.filter(index => index !== hidden)] }
}
