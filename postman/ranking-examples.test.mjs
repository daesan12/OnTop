import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

// 생성된 실제 Postman 스크립트를 순서대로 실행한다. 서버/DB/회원 인증을 대체하는 시험은 아니다.
const collection = JSON.parse(await readFile(new URL('./OnTop-Bungeoppang-Ranking.postman_collection.json', import.meta.url), 'utf8'));
function run(number, environment, body, status = 200, phase = 'test') {
    const item = collection.item.find(item => item.name.startsWith(number + ' '));
    assert.ok(item, `예제 ${number}`);
    const failures = [];
    const pm = {
        test: (name, check) => { try { check(); } catch { failures.push(name); } },
        expect: value => ({ to: {
            eql: expected => assert.deepEqual(value, expected),
            include: part => assert.ok(value.includes(part)),
            be: { an: type => assert.equal(Array.isArray(value) ? 'array' : typeof value, type),
                at: { most: maximum => assert.ok(value <= maximum) } }
        } }),
        response: { code: status, json: () => body, headers: { get: () => 'no-store' },
            to: { have: { status: expected => assert.equal(status, expected) } } },
        environment: { name: 'Test', get: key => environment.get(key), set: (key, value) => environment.set(key, value) }
    };
    for (const event of item.event.filter(event => event.listen === phase)) {
        vm.runInNewContext(event.script.exec.join('\n'), { pm }, { timeout: 1000 });
    }
    return failures;
}
const page = (rulesVersion, nextCursor, snapshotId) => ({ basis: 'PERSONAL_BEST', period: 'ALL_TIME',
    rulesVersion, items: [], nextCursor, snapshotId });

test('v4 조회는 진행 중인 v5 커서와 스냅샷을 덮어쓰지 않는다', () => {
    const environment = new Map();
    assert.deepEqual(run(33, environment, page('v5', 'v5-next', 'snapshot-v5')), []);
    assert.deepEqual(run(35, environment, page('v4', 'v4-next', 'snapshot-v4')), []);
    assert.equal(environment.get('bungeoRankingCursor'), 'v5-next');
    assert.equal(environment.get('bungeoRankingSnapshotId'), 'snapshot-v5');
    assert.deepEqual(run(34, environment, null, 200, 'prerequest'), []);
    assert.deepEqual(run(34, environment, page('v5', null, 'snapshot-v5')), []);
    assert.equal(environment.get('bungeoRankingCursor'), '');
    assert.equal(environment.get('bungeoRankingSnapshotId'), 'snapshot-v5');
});

test('만료 응답은 기존 커서를 성공처럼 갱신하지 않고 새 첫 조회로 복구한다', () => {
    const environment = new Map();
    run(33, environment, page('v5', 'old-next', 'old-snapshot'));
    assert.ok(run(34, environment, { code: 'RANKING_SNAPSHOT_EXPIRED' }, 409).length > 0);
    assert.equal(environment.get('bungeoRankingCursor'), 'old-next');
    assert.equal(environment.get('bungeoRankingSnapshotId'), 'old-snapshot');
    assert.deepEqual(run(33, environment, page('v5', 'fresh-next', 'fresh-snapshot')), []);
    assert.equal(environment.get('bungeoRankingCursor'), 'fresh-next');
    assert.equal(environment.get('bungeoRankingSnapshotId'), 'fresh-snapshot');
});

test('다음 페이지가 없으면 사전 검사 오류이며 v4 조회만으로 v5 커서를 만들지 않는다', () => {
    const environment = new Map();
    run(35, environment, page('v4', 'v4-next', 'snapshot-v4'));
    assert.equal(environment.has('bungeoRankingCursor'), false);
    assert.throws(() => run(34, environment, null, 200, 'prerequest'), /다음 페이지가 없습니다/);
    run(33, environment, page('v5', null, 'empty-v5'));
    assert.throws(() => run(34, environment, null, 200, 'prerequest'), /다음 페이지가 없습니다/);
});
