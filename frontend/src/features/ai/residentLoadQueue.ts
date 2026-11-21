type Job = { run: () => Promise<void>; priority: () => number; cancelled: boolean }

/** Keep GLB parsing and skeleton cloning out of the entrance burst. A task owns
 * its lease; cancelling a queued actor must not start its download. */
export class ResidentLoadQueue {
  private jobs: Job[] = []
  private running = false
  private scheduled = false

  enqueue(run: () => Promise<void>, priority: () => number) {
    const job: Job = { run, priority, cancelled: false }
    this.jobs.push(job)
    this.schedule()
    return () => { job.cancelled = true }
  }

  private schedule() {
    if (this.running || this.scheduled) return
    this.scheduled = true
    setTimeout(() => { this.scheduled = false; void this.next() }, 0)
  }

  private async next() {
    this.jobs = this.jobs.filter(job => !job.cancelled)
    this.jobs.sort((a, b) => a.priority() - b.priority())
    const job = this.jobs.shift()
    if (!job) return
    this.running = true
    try { await job.run() } catch { /* Actor reports its own load failure. Keep the queue moving. */ }
    finally {
      this.running = false
      if (this.jobs.length) this.schedule()
    }
  }
}
