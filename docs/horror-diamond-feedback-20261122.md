# 공포맵 보석 전시 피드백 (12번)

기준은 `origin/dev@3c8240eaf92a493edfea3e69e2aae665c8e32896`, 브랜치는
`feat/horror-diamond-display`다. 원래 검수한 `993daaf6`의 최종 외관만 이관했다.

- 첨부 레퍼런스에 맞춘 청색 타원 보석, 은색 테두리와 작은 흰 보석, 체인과 무광 목걸이 전시대다.
- 기존 받침대 위에 투명 유리관과 금속 테두리·상판을 배치한다.
- 보석 중심만 기존 기준에서 0.32m 올려 받침대에 가리지 않게 한다. 회전 대신 고정 전시한다.
- 기존 E 집기 기준·획득 판정·충돌·FE/BE 계약·생성 맵/버전은 유지한다.
  획득 시 보석과 체인만 숨겨지고 전시대와 유리관은 남는다.
- 런타임 수정은 `InteriorEncounters.tsx`의 표시 연결과 새 `DiamondPendant.tsx`,
  `DiamondDisplayCase.tsx`다. 인프라·DB/Flyway·새 의존성 변경은 없다.

원본 통합 브랜치와 다른 번호의 작업은 보존한다. 8번 썰매와 10번 오락실은 포함하지 않는다.
사용자 요청은 MR 생성까지이며 머지·배포·브랜치 삭제는 별도 승인 전까지 보류한다.

검증: horrorRules·horrorDressing·parkVisualPreservation 14개와 TypeScript 검사,
park-integration 프로덕션 빌드를 통과했다. Browser plugin 미제공으로 기존 Playwright/Chrome에서
실제 전시함·펜던트 컴포넌트를 렌더링했고, 획득 대상 ref를 숨기면 전시대·유리관이 남는 것을
확인했다. 앱 오류는 없었으며 검증 직후 해당 브라우저·서버를 종료했다.
독립 Canvas 검수로 운영 인증·실서버 E 획득·전체 공원 동선·VR 헤드셋 검수를 보장하지 않는다.
