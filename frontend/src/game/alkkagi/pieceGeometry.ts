import { LatheGeometry, Vector2 } from 'three'

/** 서버 원형 반경 안에 들어가는 팔각 외형. 높이 .27과 충돌 반경은 바꾸지 않는다. */
export function createPieceGeometry(radius: number) {
  return new LatheGeometry([
    [0, .008], [.82, .008], [.94, .025], [1, .055], [1, .195], [.96, .235], [.88, .27], [0, .27],
  ].map(([r, y]) => new Vector2(r * radius, y)), 8)
}
