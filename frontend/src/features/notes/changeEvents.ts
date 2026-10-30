import type { Envelope } from '../../network/protocol'

/** One revision stream per shared park connection; never carries memo content. */
export class NotesChangeEvents {
  private revision = 0n
  private listeners = new Set<() => void>()

  subscribe = (changed: () => void) => {
    this.listeners.add(changed)
    return () => { this.listeners.delete(changed) }
  }

  reset() { this.revision = 0n }

  accept(message: Envelope) {
    const value = message.payload.revision
    if (message.type !== 'NOTES_CHANGED' || message.requestId !== null
      || Object.keys(message.payload).length !== 1 || typeof value !== 'string'
      || !/^[1-9]\d{0,18}$/.test(value)) return
    const revision = BigInt(value)
    if (revision > 9223372036854775807n || revision <= this.revision) return
    this.revision = revision
    for (const changed of this.listeners) changed()
  }
}
