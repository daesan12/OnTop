# OnTop 최종 평가 산출물

이 디렉터리는 최종 평가용 포팅 자료를 모아 둡니다.

| 구분 | 파일 |
| --- | --- |
| 빌드·배포·DB 복원 포팅 매뉴얼 | [포팅_매뉴얼.md](./포팅_매뉴얼.md) |
| 외부 서비스 가입·설정 정보 | [외부서비스_정보.md](./외부서비스_정보.md) |
| 최신 DEV·PROD DB 덤프 | [db-dumps/](./db-dumps/) |
| 발표·시연 순서 | [시연_시나리오.md](./시연_시나리오.md) |

## 비밀값 취급

- 실제 API Key, OAuth Client Secret, JWT·암호화 키, DB 비밀번호, Vercel·Docker Hub 토큰, Mattermost Webhook, PEM 개인키는 저장소에 기록하지 않습니다.
- 문서에는 환경변수 이름과 발급·적용 위치만 기록합니다.
- 실제 값이 필요한 평가 담당자에게는 별도 보안 채널로 전달하고, 평가가 끝나면 임시 토큰을 폐기합니다.
- DB 덤프는 팀의 명시적 승인으로 비공개 평가 저장소에만 포함합니다. 공개 저장소나 외부 파일 공유 서비스로 복제하지 않습니다.

## 덤프 기준

| 환경 | 파일 | 생성 시각(KST) | SHA-256 |
| --- | --- | --- | --- |
| DEV | `db-dumps/ontop-dev-20261118T043852Z.sql.gz` | 2026-11-18 13:38:52 | `baf86bdb01493014d6c752de1263397b806ca05d3a0e80102418c7872f4a9055` |
| PROD | `db-dumps/ontop-prod-20261118T043911Z.sql.gz` | 2026-11-18 13:39:11 | `7bc288a2cdec86a6b57f1e9488d4cea3d193ae09727a152f47c960ee8c30242c` |

두 파일은 MySQL `--single-transaction --quick --routines --events --triggers --hex-blob` 옵션으로 서비스 중단 없이 생성했고, 서버와 로컬에서 체크섬을 확인했습니다.
