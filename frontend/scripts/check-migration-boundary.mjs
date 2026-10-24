import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => {
    const name = path.join(directory, entry.name)
    return entry.isDirectory() ? files(name) : [name]
  }))).flat()
}
const failures = []
const forbidden = /@(?:colyseus|tapgol)\/|(?:['"/])colyseus(?:['"/])|assets\/source\//i
for (const file of (await files(path.join(root, 'src'))).filter(file => /\.[cm]?[jt]sx?$/.test(file))) {
  if (forbidden.test(await readFile(file, 'utf8')))
    failures.push(`Prototype dependency: ${path.relative(root, file)}`)
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }))
  if (/colyseus|@tapgol\//i.test(name)) failures.push(`Prototype package: ${name}`)

// Run after a release build. The removed fake-entry app must not enter deployment output.
for (const file of (await files(path.join(root, 'dist'))).filter(file => /\.(js|css|html)$/.test(file))) {
  const content = await readFile(file, 'utf8')
  if (/M10_SURRENDER_MOCK_ONLY|수동 기권 목업|기권 의사 확인 미리보기 완료|기권 확인 \(목업\)|M09_PUBLIC_MATCH_MOCK_ONLY|공개 경기 참조만 목업|MockMigrationApp|migration-mock-banner|mock-player-[ab]|M00_FRONTEND_MOCK_ONLY|M01_BENCH_MOCK_ONLY|M05_FITNESS_MOCK_ONLY|M06_TELESCOPE_MOCK_ONLY|M07_FEEDBACK_MOCK_ONLY|M08_NOTES_MOCK_ONLY|익명 메모 목업 요청이 취소되었습니다|소리함 목업 요청이 취소되었습니다|망원경 목업 요청이 취소되었습니다|운동기구 목업 요청이 취소되었습니다|class MockBenchService|벤치 요청이 취소되었습니다|다른 이웃이 먼저 앉았습니다|감정표현 목업 요청이 취소되었습니다/.test(content))
    failures.push(`Mock leaked into release: ${path.relative(root, file)}`)
  if (forbidden.test(content)) failures.push(`Prototype dependency in release: ${path.relative(root, file)}`)
}
if (failures.length) throw new Error(failures.join('\n'))
console.log('M00–M13 boundary OK: frontend-local imports, no Colyseus/@tapgol dependency, no fake-entry app in release.')
