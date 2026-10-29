import { fileURLToPath } from 'node:url'
import { createMapArtifacts } from './map/artifacts.ts'
import { loadMapInput } from './map/load-input.ts'
import { withGenerationLock } from './map/generation-lock.ts'
import { syncArtifacts } from './map/write-artifacts.ts'

const root=fileURLToPath(new URL('../',import.meta.url))
const args=process.argv.slice(2)
if(args.some(a=>a!=='--check')) {
  console.error('Usage: node scripts/generate-park-map.mjs [--check]');process.exitCode=1
} else {
  try {
    const generate=async()=>{
      const input=await loadMapInput(root),result=createMapArtifacts(input.data,input.sources)
      const changed=await syncArtifacts(root,result.artifacts,args.includes('--check'))
      return {result,changed}
    }
    const {result,changed}=args.includes('--check')?await generate():await withGenerationLock(root,generate)
    console.log(`[park-map] ${args.includes('--check')?'verified':'generated'} ${result.manifest.mapId} ${result.mapVersion}`)
    console.log(`[park-map] ${result.manifest.counts.tables} tables, ${result.manifest.counts.obstacles} movement obstacles; ${changed.length} files updated`)
  } catch(error) {
    console.error('[park-map] '+(error instanceof Error?error.message:String(error)));process.exitCode=1
  }
}
