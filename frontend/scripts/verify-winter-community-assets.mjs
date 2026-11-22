import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/features/winter/community/assets/', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const roster = ['manifest.json', 'tree-collision.json']
if (manifest.license.tripo !== 'LicenseRef-Tripo-API-Output' || manifest.assets.length !== 5) throw Error('에셋 출처 기록을 확인해주세요.')
for (const asset of manifest.assets) {
  if (path.basename(asset.file) !== asset.file) throw Error('에셋 경로가 잘못됐습니다.')
  roster.push(asset.file)
  const bytes = fs.readFileSync(path.join(root, asset.file))
  if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256 || bytes.toString('ascii', 0, 4) !== 'glTF'
    || bytes.readUInt32LE(8) !== bytes.length) throw Error('에셋 바이트 불일치: ' + asset.id)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
  if ([...(gltf.images ?? []), ...(gltf.buffers ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw Error('외부 파일에 의존하는 에셋입니다.')
  const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0)
  if (triangles > (asset.id === 'tree' ? 150000 : 2500)) throw Error('장식 정점 예산 초과: ' + asset.id)
  if (asset.id === 'tree') {
    if (gltf.nodes.filter(node => node.name?.startsWith('Memo_Anchor_')).length !== 72) throw Error('기존 트리의 앵커가 변경됐습니다.')
    for (const name of ['MAT_Star_Emission', 'MAT_StringBulb_Emission']) {
      const material = gltf.materials.find(item => item.name === name)
      if (!material || (material.emissiveFactor ?? [0, 0, 0]).some(value => value !== 0)) throw Error('트리는 소등 상태여야 합니다.')
    }
  }
  if (asset.preview) {
    if (path.basename(asset.preview) !== asset.preview) throw Error('미리보기 경로가 잘못됐습니다.')
    roster.push(asset.preview)
    if (hash(fs.readFileSync(path.join(root, asset.preview))) !== asset.preview_sha256) throw Error('미리보기 해시 불일치')
  }
}
if (hash(fs.readFileSync(path.join(root, 'tree-collision.json'))) !== manifest.collision_sha256) throw Error('충돌 형상 해시 불일치')
if (fs.readdirSync(root).some(file => !roster.includes(file))) throw Error('기록되지 않은 에셋 파일이 있습니다.')
console.log(JSON.stringify({ files: roster.length, models: 5, integrity: 'verified', providerCalls: 0 }))
