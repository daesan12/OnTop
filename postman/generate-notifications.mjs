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
    description: '소리함 답변·개인 알림함·엽전/의상 뽑기권 보상 발급/수령. 로컬 구현이며 DEV 미배포. V158/V160 번호·순서 확인 전 푸시·공용 DB 적용 보류. 뽑기권은 기존 V157 gacha_inventory 필요. 관리자 발급은 재화 지급 권한, 답변은 운영 권한. 민감 토큰은 개인 변수로만 설정. docs/notifications-api.md 참고.' },
  variable: [{ key: 'receiptId', value: '' }, { key: 'feedbackVersion', value: '0' },
    { key: 'replyOperationId', value: '' }, { key: 'notificationId', value: '' },
    { key: 'rewardOperationId', value: '' }, { key: 'rewardUserId', value: '' },
    { key: 'rewardKind', value: 'GACHA_TICKET' }, { key: 'rewardAmount', value: '1' },
    { key: 'rewardExpiresAt', value: '2030-01-01T00:00:00Z' }, { key: 'rewardNotificationId', value: '' }],
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
    item('07 지급 관리자 · 개인 보상 발송(동일 UUID 재시도)', 'POST', '/api/v1/admin/wallet-grants/rewards', 'adminAccessToken',
      '{\n  "operationId": "{{rewardOperationId}}",\n  "userId": "{{rewardUserId}}",\n  "kind": "{{rewardKind}}",\n  "amount": {{rewardAmount}},\n  "title": "소중한 의견 감사합니다",\n  "text": "온탑에서 보내는 작은 선물입니다.",\n  "expiresAt": "{{rewardExpiresAt}}"\n}',
      "if(!pm.collectionVariables.get('rewardOperationId'))pm.collectionVariables.set('rewardOperationId',pm.variables.replaceIn('{{$guid}}')); // 새 보상에는 키를 비우고 실행",
      "if(pm.response.code===200)pm.collectionVariables.set('rewardNotificationId',pm.response.json().notificationId);"),
    item('08 수신자 본인 · 보상 한 번 수령(재실행 동일 영수증)', 'POST', '/api/v1/notifications/{{rewardNotificationId}}/claim', 'accessToken', undefined, '',
      "if(pm.response.code===200){const r=pm.response.json();pm.test('요청한 보상 영수증',()=>pm.expect(r.notificationId).to.eql(pm.collectionVariables.get('rewardNotificationId')));pm.test('수령 시각',()=>pm.expect(r.claimedAt).to.be.a('string'));}"),
  ],
}
await writeFile(fileURLToPath(new URL('./OnTop-Notifications.postman_collection.json', import.meta.url)), JSON.stringify(collection, null, 2) + '\n')
console.log('OnTop Notifications: 8 requests (no secrets)')
