import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const base = '{{baseUrl}}', admin = '/api/v1/admin/operations/announcements'
const payload = { title: '행사 안내', text: '오늘도 즐거운 온탑 공원!', published: true, displayOrder: 1, startsAt: null, endsAt: null, expectedVersion: 0 }
const item = (name, method, url, body, before = '', status = 200, after = '') => ({ name, request: {
  method, url: base + url, header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }, ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
  ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
}, event: [...(before ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: before.split('\n') } }] : []),
  { listen: 'test', script: { type: 'text/javascript', exec: [`pm.test('HTTP ${status}',()=>pm.response.to.have.status(${status}));`, after] } }] })
const collection = { info: { name: 'OnTop Announcements', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  description: '로컬 구현 예제. V148은 아직 DB 미적용이며 DEV/운영 동작을 보장하지 않습니다. 관리자 JWT는 개인 변수만 사용. 02 생성 응답 유실 시 같은 ID로 02를 재전송, 새 공지는 announcementId를 비우세요. 03 목록에서 최신 version을 확인한 뒤 04·05 실행. docs/announcements-api.md 참고.' },
  variable: [{ key: 'announcementId', value: '' }, { key: 'announcementVersion', value: '0' }],
  item: [ item('01 회원 게시 공지 조회', 'GET', '/api/v1/announcements'),
    item('02 관리자 공지 생성·같은 ID 재시도', 'POST', admin + '/{{announcementId}}', payload,
      "if(!pm.collectionVariables.get('announcementId')) pm.collectionVariables.set('announcementId',pm.variables.replaceIn('{{$guid}}'));", 200,
      "if(pm.response.code===200) pm.collectionVariables.set('announcementVersion',pm.response.json().version);"),
    item('03 관리자 공지 목록', 'GET', admin, undefined, '', 200,
      "if(pm.response.code===200){pm.collectionVariables.set('announcementOrder',JSON.stringify(pm.response.json().map(x=>({id:x.id,expectedVersion:x.version}))));const value=pm.response.json().find(x=>x.id===pm.collectionVariables.get('announcementId'));if(value)pm.collectionVariables.set('announcementVersion',value.version);}"),
    item('04 관리자 공지 수정', 'PUT', admin + '/{{announcementId}}', { ...payload, text: '수정된 공지', expectedVersion: '{{announcementVersion}}' }, '', 200,
      "if(pm.response.code===200) pm.collectionVariables.set('announcementVersion',pm.response.json().version);"),
    item('05 관리자 공지 삭제', 'DELETE', admin + '/{{announcementId}}?version={{announcementVersion}}', undefined, '', 204),
    item('06 관리자 공지 표시 순서 일괄 저장', 'PUT', admin + '/order', undefined,
      "const items=JSON.parse(pm.collectionVariables.get('announcementOrder')||'[]');if(!items.length)throw new Error('03 목록을 먼저 조회하세요. announcementOrder 배열을 원하는 순서로 편집한 뒤 실행하세요.');", 204),
  ] }
collection.item[5].request.header.push({ key: 'Content-Type', value: 'application/json' })
collection.item[5].request.body = { mode: 'raw', raw: '{"items": {{announcementOrder}}}', options: { raw: { language: 'json' } } }
// expectedVersion은 JSON 숫자여야 하므로 Postman 변수 치환 구문만 따옴표 없이 둔다.
collection.item[3].request.body.raw = collection.item[3].request.body.raw.replace('"{{announcementVersion}}"', '{{announcementVersion}}')
await writeFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'OnTop-Announcements.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n')
console.log('생성: OnTop Announcements 6 requests (no secrets)')
