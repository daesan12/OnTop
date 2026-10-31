export const ALKKAGI_FOV = 42

/** PC에서는 손패를 우측에 두고 판에 높이를 더 배정한다. 작은 화면은 기존 하단 여백을 유지한다. */
export function alkkagiTopDownFrame(width: number, height: number, scale: number) {
  const w = Math.max(1, width), h = Math.max(1, height), wide = w >= 1280
  const top = wide ? 128 : 130, bottom = wide ? 32 : 130
  const usableHeight = Math.max(h * .3, h - top - bottom)
  const usableWidth = wide ? Math.max(w * .3, w - 480) : w * .88
  // Include the raised piece faces and a rim around the 1.26 x 1.4 board.
  // Fitting only the flat board clips elevated pieces through perspective.
  const vertical = Math.max(1.48 * scale * h / usableHeight, 1.34 * scale * w / usableWidth / (w / h))
  return { height: vertical / (2 * Math.tan(ALKKAGI_FOV * Math.PI / 360)),
    offset: (top - bottom) / (2 * h) * vertical }
}
export function alkkagiTopDownHeight(width: number, height: number, scale: number) {
  return alkkagiTopDownFrame(width, height, scale).height
}
