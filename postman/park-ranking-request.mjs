export const parkRankingRequest = {
  name: '공원 랭킹 7종 · 페이지 데이터',
  request: {
    method: 'GET', url: '{{baseUrl}}/api/v1/rankings/park', auth: { type: 'noauth' },
    header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }],
    description: '60초 스냅샷 7종 TOP10. 페이지 전환은 클라이언트에서 4+3열로 처리하며 추가 조회하지 않는다. 구구구는 KST2026-11-16 14:00 시작 이상~11/19 00:00 완료 미만, 기간 필터 뒤 개인최고 선택. 꼬치는 PC/VR 통합 같은 두 사람 최고 팀 한 건, 선정 기록 playMode=VR이면 두 이름 옆 VR. 지갑/보상/스키마 변경 없음. docs/park-ranking-api.md. 개인 환경의 baseUrl/accessToken 사용.',
  },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
    "pm.test('7종 TOP10과 이벤트 기간', () => { const r=pm.response.json(); ['balance','mole','speedMole','jumpRope','jumpmap','bungeoppang','skewer'].forEach(k=>{pm.expect(r[k]).to.be.an('array');pm.expect(r[k].length).to.be.at.most(10);}); pm.expect(r.jumpRopeStartsAt).to.eql('2026-11-16T05:00:00Z'); pm.expect(r.jumpRopeEndsAtExclusive).to.eql('2026-11-18T15:00:00Z'); });",
    "pm.test('꼬치 팀 중복과 선정 방식', () => { const rows=pm.response.json().skewer; const teams=rows.map(r=>[r.chefUserId,r.serverUserId].sort().join(':')); pm.expect(new Set(teams).size).to.eql(rows.length); rows.forEach(r=>pm.expect(['PC','VR']).to.include(r.playMode)); });",
  ] } }],
}
