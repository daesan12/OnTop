import { build } from 'vite'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const result = await build({ root, configFile: false, publicDir: false, logLevel: 'silent', build: { ssr: path.join(root, 'src/features/jumpmap/course.ts'), write: false, minify: false } })
if (Array.isArray(result) || !('output' in result)) throw new Error('Unexpected course bundle')
const chunks = result.output.filter(o => o.type === 'chunk')
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error('Course data must bundle without runtime dependencies')
const course = await import('data:text/javascript;base64,' + Buffer.from(chunks[0].code).toString('base64'))
const sourcePaths = ['src/features/jumpmap/course.ts', 'src/layout-preview/jumpCourse.ts', 'src/map/park/definition.ts', 'src/map/park/resolve.ts']
const sources = []
for (const p of sourcePaths) sources.push({ path: p, sha256: createHash('sha256').update((await readFile(path.join(root, p), 'utf8')).replace(/\r\n?/g, '\n')).digest('hex') })
const data = { schemaVersion: 1, mapVersion: course.MAP_VERSION, courseVersion: course.COURSE_VERSION, rulesVersion: course.RULES_VERSION,
  physics: { tickRate: 30, coyoteTicks: 3, jumpBufferTicks: 4, colliderCoordinates: 'uninflated; metres; Y up; center = top - thickness/2', avatarCollision: false },
  stages: course.STAGES, start: course.START, finish: course.FINISH, returnTo: course.RETURN_TO,
  pads: course.COURSE, colliders: course.COURSE_COLLIDERS, sources }
const content = JSON.stringify(data, null, 2) + '\n', digest = createHash('sha256').update(content).digest('hex')
// Keep legacy FE handoff and BE classpath data identical. Renewal deployment uses
// its separate immutable 10-stage mount; the default course still serves legacy tests/builds.
const dirs = [path.join(root, 'docs/jumpmap'), path.join(root, '../backend/src/main/resources/world/jumpmap')]
if (process.argv.includes('--check')) {
  for (const dir of dirs) if (await readFile(path.join(dir, 'course.generated.json'), 'utf8') !== content || await readFile(path.join(dir, 'course.generated.sha256'), 'utf8') !== digest + '\n') throw new Error('Jump course handoff is stale; run pnpm jumpmap:export')
  console.log(`Verified jump course: ${digest}`)
} else {
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'course.generated.json'), content); await writeFile(path.join(dir, 'course.generated.sha256'), digest + '\n')
  }
  console.log(`Exported ${data.pads.length} pads: ${digest}`)
}
