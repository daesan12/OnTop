import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const admin = '/api/v1/admin/operations/feedback/{{receiptId}}'
const item = (name, method, path, token, body, before = '', after = '') => ({ name,
  request: { method, url: '{{baseUrl}}' + path,
    header: [{ key: 'Authorization', value: `Bearer {{${token}}}` }, ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
    ...(body ? { body: { mode: 'raw', raw: body, options: { raw: { language: 'json' } } } } : {}) },
  event: [...(before ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: before.split('\n') } }] : []),
    { listen: 'test', script: { type: 'text/javascript', exec: ["pm.test('HTTP 200',()=>pm.response.to.have.status(200));", after] } }] })
const collection = {
  info: { name: 'OnTop Notifications', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: '소리함 답변 → 개인 알림함. 로컬 구현/격리 MySQL 검증 완료, DEV 미배포. V158 팀 번호·적용 순서 확인 전 푸시·공용 DB 적용 보류. adminAccessToken은 운영 관리자, accessToken은 작성자 개인 변수로만 설정. 다른 회원 토큰으로 상세/읽음 요청은 404. 보상 지급은 미구현. docs/notifications-api.md 참고.' },
  variable: [{ key: 'receiptId', value: '' }, { key: 'feedbackVersion', value: '0' },
    { key: 'replyOperationId', value: '' }, { key: 'notificationId', value: '' }],
  item: [
    item('01 관리자 소리함 목록·닉네임·최신 버전', 'GET', '/api/v1/admin/feedback?limit=20', 'adminAccessToken', undefined, '',
      "if(pm.response.code===200){const id=pm.collectionVariables.get('receiptId');const row=pm.response.json().items.find(x=>x.receiptId===id);if(row)pm.collectionVariables.set('feedbackVersion',row.version);}"),
    item('02 운영진 답변·동일 UUID 재시도', 'POST', admin + '/replies', 'adminAccessToken',
      '{\n  "operationId": "{{replyOperationId}}",\n  "text": "알려주신 문제를 수정했습니다. 소중한 의견 감사합니다!",\n  "status": "RESOLVED",\n  "expectedVersion": {{feedbackVersion}}\n}',
      "if(!pm.collectionVariables.get('receiptId'))throw new Error('01 목록에서 답변할 receiptId를 지정하세요.');\nif(!pm.collectionVariables.get('replyOperationId'))pm.collectionVariables.set('replyOperationId',pm.variables.replaceIn('{{$guid}}'));",
      "if(pm.response.code===200){const x=pm.response.json();pm.collectionVariables.set('notificationId',x.notificationId);pm.collectionVariables.set('feedbackVersion',x.version);}"),
    item('03 작성자 알림 목록·미읽음 개수', 'GET', '/api/v1/notifications?limit=20', 'accessToken'),
    item('04 작성자 알림 상세·읽음 변경 없음', 'GET', '/api/v1/notifications/{{notificationId}}', 'accessToken'),
    item('05 작성자 읽음 처리·상세 반환', 'PATCH', '/api/v1/notifications/{{notificationId}}/read', 'accessToken', undefined, '',
      "if(pm.response.code===200)pm.test('읽음 시각',()=>pm.expect(pm.response.json().readAt).to.be.a('string'));"),
    item('06 관리자 처리 상태만 변경·알림 없음', 'PATCH', admin + '/status', 'adminAccessToken',
      '{\n  "status": "REVIEWING",\n  "expectedVersion": {{feedbackVersion}}\n}', '',
      "if(pm.response.code===200)pm.collectionVariables.set('feedbackVersion',pm.response.json().version);"),
  ],
}
await writeFile(fileURLToPath(new URL('./OnTop-Notifications.postman_collection.json', import.meta.url)), JSON.stringify(collection, null, 2) + '\n')
console.log('OnTop Notifications: 6 requests (no secrets)')
