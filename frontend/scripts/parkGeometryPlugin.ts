import { createServer, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { MeshoptEncoder } from 'meshoptimizer/encoder'
import { parkBindingsPlugin } from './parkBindingsPlugin.ts'

/** Build the existing static props in Node, once per deployment, not per login. */
export function parkGeometryPlugin(): Plugin {
  const id = '\0virtual:park-geometry'
  let config: ResolvedConfig, reference: string | undefined, scene: string | undefined
  return {
    name: 'park-geometry',
    configResolved(value) { config = value },
    resolveId(source) { if (source === 'virtual:park-geometry') return id },
    load(source) {
      if (source === id) return reference
        ? `export default import.meta.ROLLUP_FILE_URL_${reference}; export const sceneUrl = import.meta.ROLLUP_FILE_URL_${scene}`
        : 'export default null; export const sceneUrl = null'
    },
    async buildStart() {
      if (config.command !== 'build' || config.build.ssr) return
      const server = await createServer({
        root: config.root, configFile: false, mode: config.mode,
        plugins: [react(), parkBindingsPlugin(), parkGeometryPlugin()], server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true, entries: [] },
        appType: 'custom', logLevel: 'error',
      })
      try {
        const codec = await server.ssrLoadModule('/src/world/art/bakedProps.ts')
        const props = codec.capturePropBuilds()
        // Only CPU-only static art modules run here; no renderer or auth boot.
        for (const module of [
          'art/activityPropGeometry.ts', 'art/fishCartGeometry.ts', 'art/mailboxGeometry.ts', 'art/notesBoardGeometry.ts',
          'art/LandmarkRefinements.tsx', 'art/ReferenceBenchFrames.tsx',
          'art/ReferenceStreetProps.tsx', 'art/FitnessStyle.tsx', 'art/TelescopeModel.tsx',
          'art/TraditionalPavilionLanterns.tsx', 'pigeons/pigeonGeometry.ts', 'art/Pavilion.tsx', 'art/StonePagoda.tsx',
        ]) {
          const source = await server.ssrLoadModule(`/src/world/${module}`)
          source.prebuildStaticSurfaces?.()
        }
        if (!props.size) throw new Error('No static park props were built')
        await MeshoptEncoder.ready
        const encoded = codec.encodeBakedProps(props, (bytes: Uint8Array, count: number, stride: number, mode: string) =>
          mode === 'INDICES' ? MeshoptEncoder.encodeIndexSequence(bytes, count, stride)
            : MeshoptEncoder.encodeVertexBufferLevel(bytes, count, stride, 3))
        reference = this.emitFile({ type: 'asset', name: 'park-props.bin.gz', source: gzipSync(encoded, { level: 9 }) })
        scene = this.emitFile({ type: 'chunk', id: resolve(config.root, 'src/world/WorldCanvas.tsx'), name: 'WorldCanvas' })
        this.info(`Prebuilt ${props.size} static park props`)
      } finally { await server.close() }
    },
  }
}
