export function followStoneYaw(current: number, target: number, delta: number, response: number, maxSpeed: number) {
  const difference = target - current
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference))
  const eased = turn * (1 - Math.exp(-delta * response))
  const limit = delta * maxSpeed
  return (current + Math.max(-limit, Math.min(limit, eased))) % (2 * Math.PI)
}
