export function reindeerGallop(elapsed: number, index: number, leg: number) {
  const phase = elapsed / 1000 * Math.PI * 2 * 2.6 + index * .64
  const stride = phase + (leg < 2 ? 0 : Math.PI * .85) + (leg % 2) * .48
  return { hip: Math.sin(stride) * .72, knee: .16 + Math.max(0, Math.cos(stride)) * .95,
    lift: .055 + Math.sin(phase * 2) * .055, pitch: Math.sin(phase) * .045 }
}
