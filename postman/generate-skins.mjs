import { readFile, writeFile } from 'node:fs/promises'
const definition = { productCode: 'CHERRY_HANBOK', name: '봄꽃 한복', grade: 2, compatibility: 'ANY', wearMode: 'WHOLE', slots: ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] }
const methods = [
  ['01 등록 권한·설정', 'GET', '/admin/operations/skins/settings'],
  ['02 등록 목록', 'GET', '/admin/operations/skins'],
  ['03 새 상품 임시저장', 'POST', '/admin/operations/skins', definition],
  ['04 등록 상태 복구', 'GET', '/admin/operations/skins/{{skinId}}'],
  ['05 상품 정보 저장', 'PUT', '/admin/operations/skins/{{skinId}}', { version: '{{skinVersion}}', definition }],
  ['06 실제 파일 길이·해시로 업로드 URL 발급', 'POST', '/admin/operations/skins/{{skinId}}/uploads', { version: '{{skinVersion}}', model: { name: 'model.glb', bytes: '{{skinModelBytes}}', sha256: '{{skinModelSha256}}' }, image: { name: 'image.webp', bytes: '{{skinImageBytes}}', sha256: '{{skinImageSha256}}' } }],
  ['06b 남녀 별도 모델로 업로드 URL 발급 (06 대신 선택)', 'POST', '/admin/operations/skins/{{skinId}}/uploads', { version: '{{skinVersion}}', model: { name: 'male.glb', bytes: '{{skinModelBytes}}', sha256: '{{skinModelSha256}}' }, image: { name: 'image.webp', bytes: '{{skinImageBytes}}', sha256: '{{skinImageSha256}}' }, femaleModel: { name: 'female.glb', bytes: '{{skinFemaleModelBytes}}', sha256: '{{skinFemaleModelSha256}}' } }],
  ['07 PUT 완료 파일 검증', 'POST', '/admin/operations/skins/{{skinId}}/uploads/{{skinUploadId}}/verify'],
  ['08 검수한 상품 공개', 'POST', '/admin/operations/skins/{{skinId}}/publish', { version: '{{skinVersion}}', uploadId: '{{skinUploadId}}', reviewed: true }],
  ['09 신규 획득 중단', 'POST', '/admin/operations/skins/{{skinId}}/disable', { version: '{{skinVersion}}' }],
  ['10 회원 공개 파일 목록', 'GET', '/skins/assets'],
  ['11 착용 아이템 목록', 'GET', '/admin/operations/skins/components'],
  ['12 착용 아이템 임시저장', 'POST', '/admin/operations/skins/components', { ...definition, productCode: 'SCHOLAR_HEAD', name: '선비 머리', wearMode: 'PARTS', slots: ['HAIR','FACE'] }],
  ['13 세트 목록', 'GET', '/admin/operations/skins/sets'],
  ['14 세트 구성 저장', 'POST', '/admin/operations/skins/sets', { productCode:'SCHOLAR_SET',name:'선비 세트',grade:2,compatibility:'ANY',imageSkinId:'{{skinComponentA}}',itemIds:['{{skinComponentA}}','{{skinComponentB}}'] }],
  ['15 미공개 세트 수정', 'PUT', '/admin/operations/skins/sets/{{skinSetId}}', { version:'{{skinSetVersion}}',definition:{productCode:'SCHOLAR_SET',name:'선비 세트',grade:2,compatibility:'ANY',imageSkinId:'{{skinComponentA}}',itemIds:['{{skinComponentA}}','{{skinComponentB}}']}}],
  ['16 검수한 세트 공개', 'POST', '/admin/operations/skins/sets/{{skinSetId}}/publish', {version:'{{skinSetVersion}}'}],
  ['17 세트 신규 획득 중단', 'POST', '/admin/operations/skins/sets/{{skinSetId}}/disable', {version:'{{skinSetVersion}}'}],
]
const collection = { info: { name: 'OnTop Skin Registration', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'V164는 아이템 선등록/세트구성 확장입니다. 12로 만든 아이템은 기존 업로드·검증·공개 경로를 거친 뒤 14에서 UUID를 선택합니다. 구성품 썸네일을 세트 대표로 선택하며 겹치는 부위/성별은409, 공개 후 구성은 고정합니다. 기존 보유·영수증은 유지합니다. V161/V162 및 기존 상점·뽑기 스키마와 SKIN_REGISTRATION_ENABLED·등록자 권한이 필요합니다. AWS 미설정은 임시저장만 가능합니다. 실제 파일 bytes/SHA256을 입력하세요. 06(공용 파일) 또는06b(남녀 별도 파일)를 선택합니다. 서명 URL/headers로 선택한 파일을 모두 PUT한 뒤07을 실행합니다. 같은 파일은 같은 모델 ID를 남녀가 공유합니다. PUT에는 회원 토큰을 보내지 마세요. 08은 실제 미리보기/착용 검수 후 직접 실행하며 실제 획득 대상에 등록합니다. 409는 현재 상태를 재조회하고 사용자가 결정합니다. 컬렉션 생성 검사는 웹 저장/실제 AWS 검수가 아닙니다.' },
  variable: ['baseUrl', 'accessToken', 'skinId', 'skinUploadId', 'skinModelSha256', 'skinImageSha256', 'skinFemaleModelSha256'].map(key => ({ key, value: key === 'baseUrl' ? 'http://127.0.0.1:8080' : '' })).concat(['skinVersion', 'skinModelBytes', 'skinImageBytes', 'skinFemaleModelBytes'].map(key => ({ key, value: '0' }))),
  item: methods.map(([name, method, suffix, body]) => ({ name, request: { method,
    header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }, ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
    url: '{{baseUrl}}/api/v1' + suffix, ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2).replace(/"\{\{(skinVersion|skinModelBytes|skinImageBytes|skinFemaleModelBytes)\}\}"/g, '{{$1}}'), options: { raw: { language: 'json' } } } } : {}) },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      "pm.test('설정·권한·입력 결과 확인', () => pm.expect([200,400,401,403,404,409,503]).to.include(pm.response.code));",
      "if (pm.response.code === 200) { const r=pm.response.json(); const isSet=pm.request.url.toString().includes('/skins/sets'); if(r.id && r.definition) pm.environment.set(isSet?'skinSetId':'skinId',r.id); if(Number.isInteger(r.version)) pm.environment.set(isSet?'skinSetVersion':'skinVersion',String(r.version)); if(r.uploadId) pm.environment.set('skinUploadId',r.uploadId); }",
    ] } }],
  })),
}
const target = new URL('./OnTop-Skins.postman_collection.json', import.meta.url), content = JSON.stringify(collection, null, 2) + '\n'
if (process.argv.includes('--check')) { if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== content) throw new Error('스킨 컬렉션 재생성이 필요합니다.') }
else await writeFile(target, content)
console.log(`Skin Postman ${methods.length} requests ${process.argv.includes('--check') ? 'checked' : 'generated'}`)
