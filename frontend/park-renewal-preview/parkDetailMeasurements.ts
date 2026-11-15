import type { ParkDetailId } from './parkDetailMeshes'

// Isolated WebGL render of each scope at 1440 × 900. File sizes include both LODs.
export const detailMeasurements = {
  jump: { calls: [20, 20], triangles: [212792, 138063], size: ['1.58', '0.53'], unit: 'MiB', scope: '입구 돌탑과 10단계 발판' },
  pagoda: { calls: [3, 3], triangles: [40776, 34216], size: ['2.51', '0.84'], unit: 'MiB', scope: '대석탑·정원·돌난간' },
  fountain: { calls: [15, 15], triangles: [101360, 76915], size: ['6.75', '1.64'], unit: 'MiB', scope: '분수대 석재·화단' },
  bench: { calls: [30, 30], triangles: [10854, 6804], size: ['405.40', '77.17'], unit: 'KiB', scope: '공원·분수·전망대·낚시터 벤치' },
  lamp: { calls: [5, 5], triangles: [15664, 14564], size: ['19.47', '9.57'], unit: 'KiB', scope: '공원 가로등 전체' },
  mailbox: { calls: [6, 6], triangles: [9872, 4860], size: ['745.64', '227.23'], unit: 'KiB', scope: '소리함' },
  ranking: { calls: [5, 5], triangles: [1280, 1266], size: ['131.88', '55.60'], unit: 'KiB', scope: '랭킹보드 구조물' },
  notes: { calls: [7, 7], triangles: [16240, 7812], size: ['973.71', '296.34'], unit: 'KiB', scope: '전망대 메모함' },
  telescope: { calls: [18, 18], triangles: [10632, 9016], size: ['225.23', '100.28'], unit: 'KiB', scope: '전망대 망원경 2대' },
  table: { calls: [14, 14], triangles: [2772, 2394], size: ['23.91', '11.95'], unit: 'KiB', scope: '광장·점프맵 입구 돌테이블' },
  gacha: { calls: [5, 5], triangles: [53720, 25815], size: ['1.85', '0.55'], unit: 'MiB', scope: '뽑기기계 본체와 유리' },
  fence: { calls: [7, 7], triangles: [153644, 78340], size: ['15.19', '1.19'], unit: 'MiB', scope: '운동마당·점프맵·호숫가·오름길 울타리' },
  fortress: { calls: [8, 8], triangles: [72904, 36036], size: ['2.21', '0.46'], unit: 'MiB', scope: '언덕 성벽과 석축' },
  boundary: { calls: [13, 13], triangles: [34726, 28622], size: ['2.16', '0.96'], unit: 'MiB', scope: '공원 외벽과 정문' },
  city: { calls: [21, 21], triangles: [10464, 9144], size: ['38.45', '21.06'], unit: 'KiB', scope: '도로 바깥 배경 건물' },
  stairs: { calls: [2, 2], triangles: [3744, 3368], size: ['297.29', '86.83'], unit: 'KiB', scope: '석탑 앞 95단 계단과 양옆 석축' },
} as const satisfies Record<ParkDetailId, {
  calls: readonly [number, number]
  triangles: readonly [number, number]
  size: readonly [string, string]
  unit: 'KiB' | 'MiB'
  scope: string
}>
