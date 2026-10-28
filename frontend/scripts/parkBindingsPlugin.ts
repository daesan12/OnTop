import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

/** Package the canonical public layouts without a second startup request. */
export function parkBindingsPlugin(): Plugin {
  const id = '\0virtual:park-bindings'
  let config: ResolvedConfig
  return {
    name: 'park-bindings',
    configResolved(value) { config = value },
    resolveId(source) { if (source === 'virtual:park-bindings') return id },
    load(source) {
      if (source !== id) return
      const read = (name: string) => {
        const file = resolve(config.root, 'public', name)
        this.addWatchFile(file)
        return JSON.parse(readFileSync(file, 'utf8'))
      }
      return `export default ${JSON.stringify({ development: read('park-bindings.dev.json'), production: read('park-bindings.json') })}`
    },
  }
}
