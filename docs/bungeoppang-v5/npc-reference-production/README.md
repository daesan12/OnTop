# 손님 NPC 레퍼런스 기반 제작

이 문서는 최초 PBR GLB 6개의 원본 제작 기록입니다. 2026-10-28 후속 작업으로 **6명 모두 경량화·리깅·대기/걷기·미니게임 v5 적용까지 완료**했습니다. 현재 상태와 비용은 [런타임 적용 기록](../npc-runtime-production/README.md)을 확인하세요. 아래의 비용과 검증은 최초 원본 생성 단계 기준입니다.

## 보기와 산출물

- 모델 모음: `http://127.0.0.1:5216/tests/bungeoppang-v5-e2e/customer-references.html`
- 회전 미리보기: `http://127.0.0.1:5216/tests/bungeoppang-v5-e2e/customer-preview.html`
- URL의 `?customer=student-brown-coat` 등으로 손님을 지정할 수 있습니다.
- 프로젝트용 GLB: `frontend/public/art/bungeoppang/customers/<id>-v1.glb`
- 제작용 PNG와 생성 프롬프트: 이 폴더의 `<id>-reference-v1.png` / `.prompt.txt`
- 원본 스타일 시트: `customer-style-reference-v1.png`
- 제공자 원본 모델/렌더/기록: `tripo-out/`의 작업별 폴더
- 5명 실행 계획·결과: `remaining-customers-v1.plan.json`
- 실행 재개 기록: `remaining-customers-v1.batch.yaml.state.json`
- 서버 확인 실제 비용: `remaining-customers-v1.billing.json`
- 바이너리·텍스처·해시 검사: `customer-models-v1.audit.json`

이미지 준비에는 built-in image_gen을 사용했고, 개별 프롬프트를 모두 보관합니다. 3D 변환은 CLI 0.7.0의 Tripo v3.1(`v3.1-20260211`)이며 각 이미지 1장, `face_limit=40000, texture=true, pbr=true, texture_quality=detailed, geometry_quality=detailed` 조건을 사용했습니다. 5명 비용 300 credits의 명시적 승인 후 배치를 실행했습니다. 자동 유료 재시도는 0회로 설정했고 모든 작업은 한 번에 성공했습니다.

## 모델과 실제 비용

각 작업은 `POST /v3/generation/image-to-model` 1회입니다.

| 손님 / ID | 작업 ID | 실제 청구 | triangles | GLB bytes |
| --- | --- | ---: | ---: | ---: |
| 활발한 아이 / boy-red-scarf | 084ca389-7068-4837-869c-3e7f3fe56e5a | 60 | 37,709 | 11,099,972 |
| 대학생 / student-brown-coat | b19be13f-03bb-4130-b77c-bfd4a7292668 | 60 | 38,830 | 9,071,972 |
| 귀마개 직장인 / worker-earmuffs | 48770dfd-133d-49a7-b2ff-9aff509e4a57 | 60 | 37,537 | 10,270,188 |
| 중년 손님 / older-flat-cap | f03c126e-69b7-4355-9f15-f447135b5af4 | 60 | 38,830 | 10,301,636 |
| 분홍 모자 아이 / girl-pink-hat | d09f37f2-32be-4064-bebf-8f3349979161 | 60 | 39,230 | 12,235,816 |
| 안경 쓴 여성 / woman-glasses-bun | 6f9d7137-e4d3-4ba6-9359-5adddef4df63 | 60 | 37,580 | 7,918,852 |

**원본 추가 5명 합계 300 credits**, 기존 아이를 포함한 원본 생성 누적 **360 credits**. 원본 생성 단계 종료 시 잔액은 **550 credits**, 동결 **0**이었습니다. 이후 별도 승인한 리깅·애니메이션 비용은 295 credits이며 현재 확인 잔액은 255 credits입니다.

## 형상과 미리보기

- GLB 2.0, 각각 mesh/material 1개, embedded 4096×4096 base color / metallic-roughness / normal 텍스처 각 1장
- 모든 위치 좌표가 유한하고 인덱스가 정점 범위 안에 있는지 검사했습니다. 모든 모델이 40,000 triangles 상한 안에 있습니다.
- 미리보기에서만 높이를 1.6으로 맞추고 원본 +X 정면을 +Z로 보정합니다. 게임에서의 성인/아이 키 비율이나 실제 크기는 아직 적용하지 않았습니다. 원본 GLB는 수정하지 않았습니다.
- 선택된 모델만 GPU에 올립니다. 교체 시 형상·재질·텍스처와 ImageBitmap을 해제하고, 늦게 끝난 이전 요청의 모델도 해제합니다.
- 제작 기준 이미지는 오른쪽에, 실제 GLB는 왼쪽에 표시합니다. 모음 화면과 선택 메뉴의 작은 그림은 실제 모델에서 제공자가 렌더링한 WebP이며, NPC 본체를 대체하는 빌보드가 아닙니다.
- 전신/얼굴, 정면/양쪽 옆면/뒷면, 드래그, 휠·터치 확대, 자동 회전/멈춤을 지원합니다. 모션 감소 설정으로 바뀌면 자동 회전을 멈춥니다.

## 레퍼런스와의 차이 및 남은 작업

- 얼굴·헤어·겨울옷의 유형과 색상은 반영했으나, 제작 이미지의 미세한 얼굴 윤곽과 부드러운 표면이 그대로 복제되지는 않습니다.
- 단일 입력에서 뒷면은 생성된 형태입니다. 직장인 배낭 뒷면에는 원본 이미지에 없던 작은 무늬가 생겼습니다.
- 안경 쓴 여성은 이후 팔을 움직이기 쉽도록 휴대폰을 손에 들지 않고 코트 주머니에 넣은 제작 이미지를 사용했습니다.
- 이 폴더의 원본은 리깅/애니메이션 없는 품질 검토 자료로 보존합니다. 후속 런타임 모델은 각각 Mixamo 뼈대 65개와 idle/walk 동작을 포함합니다.
- 실제 게임에서는 `customers/runtime/`의 경량화 파일을 사용합니다. 게임 조명·클릭·동시 표시와 자원 해제 검증은 런타임 적용 기록에 있습니다.

## 검증

Browser plugin not available로 Playwright + Edge를 사용했습니다.

| 확인 | 결과 |
| --- | --- |
| 페이지 제목/의미 있는 화면/오류 오버레이 없음 | 통과 |
| 6개 실제 GLB 로딩, HTTP 200, 콘솔 오류 0 | 통과 |
| 선택 메뉴와 제목/기준 이미지/URL 일치 | 통과 |
| 각 모델 전신/얼굴/정면/뒷면과 드래그·자동 회전/멈춤 | 통과 |
| 반복 전환 후 geometry 2, texture 7 유지 | 통과 |
| 이전 모델 응답을 지연시킨 뒤 다른 손님 선택, 늦은 응답 폐기 | 통과 |
| URL의 선택을 새로고침 후 복원 | 통과 |
| 1440×1050 및 390×844에서 가로 넘침 없음 | 통과 |
| 실제 모델 렌더 모음 → 개별 3D 보기 링크 | 통과 |
| 테스트 포함 타입 검사·프로덕션 빌드·경계 검사 | 통과 |

GPU 드라이버의 shader precision warning과 기존 큰 청크 빌드 경고는 남아 있습니다. 시각 이상이나 앱 오류는 확인되지 않았습니다. 임시 QA 스크립트·측정값·스크린샷은 저장소 외부 Codex visualizations의 `customer-remaining/`에 보관합니다.
