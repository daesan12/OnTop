// 현재 서버가 읽는 park.json에서 FE 전달용 매핑만 생성한다. 맵·FE·DB는 변경하지 않는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const map = JSON.parse(await readFile(resolve(root, 'backend/src/main/resources/world/park.json'), 'utf8'));
if (map.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(map.sourceSha256) || map.tables.length !== 16) {
  throw new Error('현재 legacy 맵의 버전과 16개 테이블을 확인해주세요.');
}
const ids = new Set();
for (const anchor of map.tables) {
  if (!/^table-([1-9]|1[0-6])$/.test(anchor.id) || ids.has(anchor.id)
      || !Array.isArray(anchor.position) || anchor.position.length !== 3
      || !anchor.position.every(Number.isFinite)) throw new Error('테이블 ID·XYZ 좌표가 잘못됐습니다.');
  ids.add(anchor.id);
}
function tableId(channel, anchor) {
  const hash = createHash('md5').update(channel + '\0' + anchor).digest();
  hash[6] = (hash[6] & 15) | 48;
  hash[8] = (hash[8] & 63) | 128;
  const hex = hash.toString('hex');
  return `table-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const outputs = new Map();
for (const [profile, channels] of [['dev', ['channel-1']], ['frontend-test', ['channel-1', 'channel-2']]]) {
  const bindings = channels.flatMap(channelId => map.tables.map(anchor => ({
    channelId, tableId: tableId(channelId, anchor.id), anchorId: anchor.id,
    x: anchor.position[0], y: anchor.position[1], z: anchor.position[2], watchRadius: 20,
  })));
  outputs.set(`bindings.${profile}.json`, JSON.stringify({
    mapId: map.mapId ?? 'park', schemaVersion: 1, mapVersion: map.sourceSha256, units: 'm', upAxis: 'Y', bindings,
  }, null, 2) + '\n');
  outputs.set(`bindings.${profile}.csv`, 'channelId,tableId,anchorId,x,y,z,watchRadius\n'
    + bindings.map(row => [row.channelId, row.tableId, row.anchorId, row.x, row.y, row.z, row.watchRadius].join(','))
      .join('\n') + '\n');
  outputs.set(`bindings.${profile}.md`, `# 현재 맵 테이블 매핑 (${profile})\n\n`
    + `맵 버전: \`${map.sourceSha256}\`\n\n`
    + '좌표는 테이블 중심·m·Y-up이며 관전은 XZ 거리 20m 경계를 포함합니다. 캐릭터 캡슐 중심 좌표가 아닙니다.\n\n'
    + '| channelId | tableId | anchorId | X | Y | Z | 관전 반경 |\n'
    + '| --- | --- | --- | ---: | ---: | ---: | ---: |\n'
    + bindings.map(row => `| ${row.channelId} | ${row.tableId} | ${row.anchorId} | ${row.x} | ${row.y} | ${row.z} | 20m |`)
      .join('\n') + '\n\n'
    + 'FE는 JSON의 bindings 배열을 기존 tableBindings 입력으로 사용합니다. UUID나 조회 순서로 anchorId를 추측하지 않습니다.\n'
    + '이 파일은 등록·좌표 계약이며 실제 배포 완료나 DB 예약·정산 성공을 뜻하지 않습니다.\n');
}
const destination = resolve(root, 'docs/integration/legacy-tables');
await mkdir(destination, { recursive: true });
for (const [name, body] of outputs) {
  const file = resolve(destination, name);
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n') !== body) throw new Error(`매핑이 오래됐습니다: ${name}`);
  } else await writeFile(file, body);
}
console.log(`${process.argv.includes('--check') ? '검사' : '생성'}: dev 16개 / frontend-test 32개, 현재 맵 유지`);
