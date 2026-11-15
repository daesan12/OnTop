import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'

/** Publish the map and bindings together when dev opts into the 220m build. */
export function renewalParkAssetsPlugin(): Plugin {
  let root: string | undefined
  return {
    name: 'renewal-park-assets',
    apply: 'build',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir, 'VITE_')
      if (!config.build.ssr && config.mode === 'park-integration' && env.VITE_PARK_RENEWAL_ENABLED === 'true') {
        root = config.root
      }
    },
    async generateBundle() {
      if (!root) return
      for (const name of ['server-map.json', 'park-bindings.json']) {
        const fileName = `generated/park-renewal/${name}`
        this.emitFile({ type: 'asset', fileName, source: await readFile(resolve(root, fileName)) })
      }
    },
  }
}
