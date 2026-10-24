/** Presentation gesture from the prototype. It never supplies random faces or score. */
export class ShakeTracker {
  distance = 0; reversals = 0
  private dx = 0; private dy = 0; private heading: [number, number] | null = null
  constructor(private x: number, private y: number) {}
  move(x: number, y: number) {
    const dx = x - this.x, dy = y - this.y; this.x = x; this.y = y
    this.distance += Math.hypot(dx, dy); this.dx += dx; this.dy += dy
    const length = Math.hypot(this.dx, this.dy)
    if (length >= 8) {
      const heading: [number, number] = [this.dx / length, this.dy / length]
      if (this.heading && heading[0] * this.heading[0] + heading[1] * this.heading[1] < -0.35) this.reversals++
      this.heading = heading; this.dx = this.dy = 0
    }
    return this.ready
  }
  get ready() { return this.distance >= 100 && this.reversals >= 1 }
}
