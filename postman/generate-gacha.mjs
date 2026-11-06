import { readFile, writeFile } from 'node:fs/promises';
const check = process.argv.includes('--check');
const url = suffix => `{{baseUrl}}/api/v1/gacha${suffix}`;
const request = (name, method, suffix, body, variable) => ({
  name,
  request: { method, header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' },
    ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
    url: url(suffix), ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}) },
  event: [...(variable ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    `if (!pm.environment.get('${variable}')) pm.environment.set('${variable}', pm.variables.replaceIn('{{$guid}}'));`,
  ] } }] : []), { listen: 'test', script: { type: 'text/javascript', exec: [
    "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
    ...(suffix === '' ? ["if (pm.response.code === 200) pm.environment.set('gachaRoundId', pm.response.json().machine.roundId);"] : []),
    ...(body ? ["if (pm.response.code === 200) pm.environment.set('gachaLastOperationId', pm.response.json().operationId);"] : []),
  ] } }],
});
const collection = { info: { name: 'OnTop Gacha', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  description: 'V156·상점 스키마·실제 상품 등록 후 GACHA_ENABLED=true인 검수 환경에서 실행합니다. 실제 엽전을 소비합니다. 새 작업은 해당 operationId 환경변수를 비우고, 응답 유실 재시도는 그대로 유지하세요. DRAW는 직전 조회의 회차를 사용하며 회차 변경이면 권이 소비되지 않습니다. OPEN의 gachaBoxGrade는 실제 보유한 등급(1~4)을 지정합니다. 인증·403·429·타임아웃은 기존 복구키를 유지합니다. 웹 컬렉션 저장·실행과 파일 생성은 별개입니다.' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:8080' }, { key: 'accessToken', value: '' }, { key: 'gachaBoxGrade', value: '1' }],
  item: [request('01 기계·본인 보관함 조회', 'GET', ''),
    request('02 뽑기권 한 장 구매 (100냥)', 'POST', '/tickets', { operationId: '{{gachaBuyOperationId}}' }, 'gachaBuyOperationId'),
    request('03 뽑기권 사용', 'POST', '/draws', { operationId: '{{gachaDrawOperationId}}', roundId: '{{gachaRoundId}}' }, 'gachaDrawOperationId'),
    request('04 의상 상자 개봉', 'POST', '/boxes/open', { operationId: '{{gachaOpenOperationId}}', grade: '{{gachaBoxGrade}}' }, 'gachaOpenOperationId'),
    request('05 확정 결과 복구', 'GET', '/operations/{{gachaLastOperationId}}')],
};
// grade는 문자열이 아닌 JSON 정수다. 변수 치환 이후에도 따옴표로 감싸지 않는다.
collection.item[3].request.body.raw = collection.item[3].request.body.raw.replace('"{{gachaBoxGrade}}"', '{{gachaBoxGrade}}');
const target = new URL('./OnTop-Gacha.postman_collection.json', import.meta.url);
const output = JSON.stringify(collection, null, 2) + '\n';
if (check) { if (await readFile(target, 'utf8') !== output) throw new Error('가챠 컬렉션이 최신 생성물과 다릅니다.'); }
else await writeFile(target, output);
console.log(`가챠 컬렉션 ${check ? '검사' : '생성'}: 5개 요청`);
