# Database dumps

최종 평가 시점의 DEV·PROD 전체 DB 덤프입니다.

| 환경 | 파일 | 압축 크기 | SHA-256 |
| --- | --- | --- | --- |
| DEV | `ontop-dev-20261118T043852Z.sql.gz` | 7,808,461 bytes | `baf86bdb01493014d6c752de1263397b806ca05d3a0e80102418c7872f4a9055` |
| PROD | `ontop-prod-20261118T043911Z.sql.gz` | 68,944,408 bytes | `7bc288a2cdec86a6b57f1e9488d4cea3d193ae09727a152f47c960ee8c30242c` |

- 팀의 명시적 승인에 따라 비공개 최종 평가 저장소에만 포함합니다.
- 회원·원장 등 실제 서비스 데이터가 포함될 수 있으므로 공개 저장소·메신저·외부 파일 공유 서비스로 복제하지 않습니다.
- DB 비밀번호, OAuth/API Key, 서버 환경변수 파일은 덤프에 포함되지 않습니다.
- 두 덤프는 `--single-transaction --quick --routines --events --triggers --hex-blob`으로 생성했습니다.
- 체크섬 파일과 압축 무결성은 생성 서버와 로컬에서 확인했습니다.
- 향후 새로 생성하는 덤프는 `.gitignore`가 기본 차단하며, 승인된 최종본만 명시적으로 추가합니다.
