export const ALKKAGI_FOV = 42

/** HUD 공간을 남기고 9×10 판 전체를 수직으로 내려다본다. */
export function alkkagiTopDownHeight(width: number, height: number, scale: number) {
  const aspect = Math.max(.1, width / Math.max(1, height))
  const fill = Math.max(.3, Math.min(.8, (height - 260) / Math.max(1, height)))
  return Math.max(1.4, 1.26 / aspect) * scale / fill / (2 * Math.tan(ALKKAGI_FOV * Math.PI / 360))
}
