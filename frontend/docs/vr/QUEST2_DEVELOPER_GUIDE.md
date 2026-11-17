# Quest 2 개발자 가이드 — 기기 준비부터 공원·꼬치왕·점프맵까지

작성·소스 확인: **2026-11-04**

대상: Windows PC에서 OnTop을 개발하며 Quest 2 한 대로 직접 확인하는 개발자

함께 읽을 문서: [다른 플레이어에게 접속 방법 안내하기](QUEST2_PLAYER_GUIDE.md)

## 현재 VR 전용 작업 위치

- 브랜치: `feat/quest-vr`.
- 작업 폴더: `C:\Users\SSAFY\Desktop\OnTop\quest-vr`.
- 생성 기준: `origin/dev@12bc82c1cdfcf863f2c945303d79ea245aa20c35` (2026-11-04 확인).
- 이후 VR 개발은 이 브랜치에서 진행하고, dev 통합과 개발 사이트 배포는 별도 절차로 진행한다.
- 공원·점프맵 VR 코드와 두 가이드를 이 위치로 이관했다. 원본 미커밋 작업은 원래 worktree에 그대로 보존한다.
- 2026-11-04 사용자 승인으로 VR 코드·문서를 feat/quest-vr에 커밋·푸시한다. dev/master 머지 금지와 배포 보류는 유지한다.

> 목표는 Quest 안에 띄운 평면 모니터로 게임하는 것이 아니라, **양쪽 눈으로 공원과 게임 공간을 보고 고개·컨트롤러로 조작하는 WebXR VR 플레이**다.
>
> 작업·검수 대상은 **개발 환경**이다. 이 문서 작성만으로 VR 기능이 개발 사이트에 배포되거나, 운영 서버에 반영된 것은 아니다.

## 목차

1. [현재 상태와 세 가지 목표](#현재-상태와-세-가지-목표)
2. [주소·계정·접속 방식 이해하기](#주소계정접속-방식-이해하기)
3. [처음 한 번 — 기기와 계정 준비](#처음-한-번--기기와-계정-준비)
4. [개발자 계정·조직·인증](#개발자-계정조직인증)
5. [개발자 모드·USB 디버깅](#개발자-모드usb-디버깅)
6. [PowerShell과 ADB 준비](#powershell과-adb-준비)
7. [매번 작업할 때 — USB로 로컬 화면 열기](#매번-작업할-때--usb로-로컬-화면-열기)
8. [공원·꼬치왕·점프맵 검수](#공원꼬치왕점프맵-검수)
9. [문제 해결·디버깅](#문제-해결디버깅)
10. [다른 사람에게 열기 전 개발 서버 점검](#다른-사람에게-열기-전-개발-서버-점검)

## 현재 상태와 세 가지 목표

**소스 존재 → 로컬 검수 → 개발 서버 배포 → Quest 실기기 검수**는 서로 다른 완료 상태다.

| 목표 | 2026-11-04에 확인한 내용 | 남은 확인 |
| --- | --- | --- |
| 1. 공원 안에서 이동·점프 | 이전 독립 이동 화면은 사용자가 Quest 2에서 이동/A 점프 성공 확인. 공원 XR 연결 코드를 최신 dev 기반 feat/quest-vr에 이관 | 개발 서버 배포, 실제 서버·Quest 검수 |
| 2. VR 요리사 + PC 서빙 담당의 꼬치왕 | 최신 origin/dev에 2인 협동 클라이언트·엔진·VR 주방 코드가 있음. 기능 활성화 설정 필요 | 실제 개발 배포 설정·DB/서버·두 계정 연결·Quest 조작 검수 |
| 3. 게임 속 돌탑 점프맵 | 공원 XR과 돌탑 안내·완주·랭킹용 3D 패널을 feat/quest-vr에 이관 | 실제 도전/보상/랭킹·Quest 검수 |

공원·점프맵의 현재 로컬 작업은 `C:\Users\SSAFY\Desktop\OnTop\quest-vr`다. 이전 작업의 변경만 최신 origin/dev 기반에 이관했고, 최신 아바타·프레임 공유·맵 변경은 보존했다. **다음 개발을 시작할 때도 최신 origin/dev를 확인한다.** 개발 서버 배포와 실제 Quest 검수는 별도로 남아 있다.

초기 이동 테스트 `quest-locomotion-poc`의 화면·물리는 독립 PoC다. 이것을 실제 공원/협동 게임/점프맵의 서버 검수 성공으로 세지 않는다.

## 주소·계정·접속 방식 이해하기

### 이번에 사용하는 주소

| 용도 | 주소 | 누가 여는가 |
| --- | --- | --- |
| 개발 웹사이트 | https://dev.on-top.world/park | 개발 사이트에 배포된 버전을 PC·Quest에서 확인 |
| 개발 백엔드 | https://dev-api.on-top.world | 웹사이트가 API·실시간 통신에 사용 |
| 로컬 공원 VR | http://localhost:5288/park | 내 PC 서버를 USB로 연결한 Quest에서 확인 |
| 독립 이동 PoC | http://localhost:5286/quest-move.html | 입력·기기만 간단히 확인 |

Quest 주소창에는 **프론트 주소**를 넣는다. `dev-api` 주소는 게임 화면 주소가 아니다.

현재 작업 대상은 개발 서버다. 운영 주소 `www.on-top.world`·`api.on-top.world`를 테스트 주소로 사용하지 않는다. 개발 코드의 운영 반영과 개발 DB 데이터의 운영 DB 복사는 별개이므로, 이 가이드는 운영 데이터 복사·DB 초기화·운영 배포를 수행하는 절차를 포함하지 않는다.

### 두 계정은 역할이 다르다

- **Meta 계정:** 헤드셋·Meta Horizon 모바일 앱·개발자 설정에 사용한다. Facebook 계정 연결은 필수 조건이 아니다.
- **OnTop 게임 계정:** 공원 입장·캐릭터·꼬치왕 협동·기록·보상에 사용한다.
- 협동 플레이에서는 Quest와 PC에 **서로 다른 OnTop 계정**이 필요하다. 개발자 Meta 계정을 동료에게 공유하지 않는다.

Meta 계정과 Facebook 연결 선택 사항은 [Meta 개발자 FAQ](https://developers.meta.com/vr/faqs/)에서 확인할 수 있다.

### 개발자와 플레이어의 준비는 다르다

| 준비 | USB 로컬 개발·디버깅 | 배포된 HTTPS 사이트에서 일반 플레이 |
| --- | --- | --- |
| Meta 기기 계정 / OnTop 계정 | 필요 | 필요 |
| 개발자 등록·조직·개발자 모드 | USB 개발 경로에서 준비 | 일반 웹 플레이의 필수 조건 아님 |
| ADB / USB 케이블 / PC 개발 서버 | 필요 | 필요 없음 |
| 유효한 HTTPS 웹사이트 / WebXR 지원 | 로컬에서는 localhost 예외 이용 가능 | 필요 |
| APK 설치 / SideQuest / Quest Link·Air Link | 이 브라우저 개발 경로에서는 필요 없음 | 필요 없음 |

USB는 여기서 **PC VR 영상을 전송하는 Link 연결**이 아니라, 로컬 웹서버와 디버깅을 연결하는 용도다.

## 처음 한 번 — 기기와 계정 준비

준비물은 Quest 2, 양손 Touch 컨트롤러, Windows PC, 데이터 전송이 되는 USB 케이블, 스마트폰의 **Meta Horizon 앱**, 인터넷이다. 충전 전용 케이블이면 ADB에 나타나지 않을 수 있다.

1. Quest를 켜고 Wi-Fi·컨트롤러 연결·기본 기기 설정을 완료한다.
2. 헤드셋과 Meta Horizon 모바일 앱에서 같은 기기 관리용 Meta 계정을 사용한다.
3. 모바일 앱의 기기 추가/페어링에서 자신의 Quest 2를 선택한다. 코드 입력이 필요하면 헤드셋에 표시된 안내를 따른다.
4. 브라우저에서 일반 웹페이지가 열리고 홈 화면에 정상 진입하는지 확인한다.
5. OS·브라우저 업데이트가 있다면 기기에서 제공하는 정상 업데이트 절차를 따른다.
6. 현실의 플레이 경계와 바닥 높이를 맞춘다. 게임의 점프는 **A 버튼**으로 실행한다.

학교에서 빌린 기기가 이전 계정을 요구하면 기기 관리자에게 먼저 계정 상태를 확인한다. `meta.com/device`의 기기 연결 코드는 OnTop 로그인 코드가 아니다. 모르는 이전 계정의 인증을 우회하려 하지 않는다. 계정 재등록을 위한 초기화는 관리자가 허용한 경우에만 별도로 진행하며 기기 내 데이터가 삭제될 수 있다. **이미 내 계정으로 홈 화면에 들어갔다면 초기화할 필요가 없다.**

## 개발자 계정·조직·인증

> 이미 준비했더라도 계정이 다르면 개발자 모드가 안 보일 수 있다. 아래 세 곳의 계정을 맞춘다.
>
> Quest의 기기 관리 계정 = Meta Horizon 앱 계정 = Meta 개발자 등록 계정

1. PC 브라우저에서 [Meta Horizon 개발자 포털](https://developers.meta.com/horizon/)을 연다.
2. 기기에 연결한 Meta 계정으로 로그인한다.
3. 개발자 약관·등록 화면이 나오면 내용을 확인하고 필요한 등록을 진행한다.
4. 개발자 대시보드의 조직 관리에서 **기존 팀 조직의 초대를 수락**하거나, 허용된 경우 **조직 만들기 / Create organization**으로 개발 조직을 만든다.
5. 조직 이름·관리자 정보를 실제 팀 상황에 맞게 입력하고 가입된 조직이 표시되는지 확인한다.
6. 계정 인증 요청이 있으면 대시보드에서 요구하는 방법으로 완료한다. 현재 공식 정책에는 결제 수단 또는 2단계 인증 등의 방법이 안내되어 있으므로 실제 화면에 제공된 옵션을 따른다.
7. 조직 인증이 별도로 요구되면 계정 인증과 구분해 처리한다. 조직 인증은 관리자 신원 또는 사업체 확인 등의 절차다. 팀 조직이면 관리자와 진행한다.
8. 인증 완료 후 앱을 다시 열고 같은 계정으로 기기를 선택한다.

공식 기준은 [개발자 인증 정책](https://developers.meta.com/vr/policy/developer-verification/)과 [조직 인증 안내](https://developers.meta.com/vr/resources/publish-organization-verification/)를 따른다. 메뉴·인증 방식은 계정과 정책 변경에 따라 다를 수 있다.

**주의할 화면:** Facebook 로그인·Threads·광고·마케팅 API를 고르는 “앱 만들기” 화면은 이번 Quest USB 개발 준비 화면이 아니다. WebXR URL 플레이를 위해 그 목록에서 임의의 이용 사례를 선택하거나 Facebook 앱을 만들 필요는 없다. Meta Horizon/Quest 개발자 포털로 돌아간다.

## 개발자 모드·USB 디버깅

모바일 앱 메뉴 명칭은 버전에 따라 조금 다르다. “기기 → 내 Quest 2 → 헤드셋 설정 → 개발자 모드”에 해당하는 항목을 찾는다.

1. Quest를 켜고 모바일 앱에서 기기에 연결한다.
2. Meta Horizon 앱의 **기기 / Devices**에서 자신의 Quest 2를 선택한다.
3. **헤드셋 설정 / Headset settings → 개발자 모드 / Developer mode**를 연다.
4. 개발자 모드를 켠다. 조직·인증 안내가 나오면 앞 단계를 완료한다.
5. 필요하면 기기를 재시작한다.
6. Quest와 PC를 데이터 USB 케이블로 연결한다.
7. 헤드셋을 쓰고 **USB 디버깅을 허용할까요? / Allow USB debugging?** 안내를 확인한다.
8. 내 개발 PC라면 “이 컴퓨터에서 항상 허용”을 선택하고 허용한다. 공용 PC에서는 영구 허용 여부를 구분한다.

파일 접근/MTP 허용과 USB 디버깅 승인은 서로 다른 안내다. 파일 전송만 허용해도 ADB가 `unauthorized`라면 디버깅 승인은 아직 안 된 것이다. 팝업이 안 보이면 헤드셋의 개발자/USB 연결 알림 항목도 확인한다.

모바일 앱 경로와 USB 준비의 공식 참고: [Meta Quest Developer Hub 시작하기](https://developers.meta.com/vr/documentation/unreal/ts-mqdh-getting-started/). MQDH는 장치 관리·디버깅에 쓸 수 있는 선택 도구이며, 아래 ADB 경로와 함께 반드시 둘 다 설치할 필요는 없다.

## PowerShell과 ADB 준비

### ADB 설치

1. [Android SDK Platform-Tools 공식 다운로드](https://developer.android.com/tools/releases/platform-tools)에서 Windows용 ZIP을 받는다. Android Studio 전체 설치는 필수가 아니다.
2. 압축을 풀고 `adb.exe`가 있는 폴더를 찾는다.
3. 현재 PC의 예시 위치는 `C:\Users\SSAFY\Desktop\platform-tools\adb.exe`다. 다른 PC에서는 실제 위치로 바꾼다.
4. Windows에서 장치가 인식되지 않으면 [Meta Oculus ADB Drivers](https://developers.meta.com/vr/downloads/package/oculus-adb-drivers/)를 확인한다. 공식 패키지 압축을 풀어 `android_winusb.inf`를 설치하는 방식이다. 이미 ADB가 작동하면 다시 설치할 필요는 없다.

### 첫 확인 명령

Windows 시작 메뉴에서 PowerShell을 열고 아래 두 줄을 실행한다. `$questAdb`는 이번 문서에서 쓰는 ADB 경로 변수다.

~~~powershell
$questAdb = 'C:\Users\SSAFY\Desktop\platform-tools\adb.exe'
& $questAdb devices
~~~

정상이면 다음과 비슷하게 나온다.

~~~text
List of devices attached
기기일련번호    device
~~~

| 표시 | 뜻 / 다음 행동 |
| --- | --- |
| `device` | PC와 기기 연결·승인 완료 |
| `unauthorized` | 헤드셋을 쓰고 USB 디버깅 승인 |
| `offline` | 잠금 해제·케이블 재연결·기기 상태 확인 |
| 목록이 비어 있음 | 데이터 케이블·직결 USB 포트·드라이버·개발자 모드 확인 |
| 기기가 여러 대 | `-s 실제일련번호` 또는 스크립트의 `-QuestSerial`로 대상 지정 |

PowerShell에서는 따옴표로 감싼 실행 파일 경로 앞에 `&`를 붙인다. `adb` 명령을 못 찾으면 전역 PATH를 바꾸기 전에 위처럼 전체 경로로 실행한다.

[Android ADB 공식 문서](https://developer.android.com/tools/adb)는 연결 상태와 디버깅 승인의 의미를 설명한다. 일반 Android의 “빌드 번호 여러 번 누르기”를 Quest의 개발자 모드 준비 대신 적용하지 않는다.

## 매번 작업할 때 — USB로 로컬 화면 열기

### 1단계: 어떤 소스를 띄울지 확인

현재 참고할 공원·점프맵 로컬 작업 위치:

~~~text
C:\Users\SSAFY\Desktop\OnTop\quest-vr
~~~

문서 전용 위치 `quest2-guides-20261104`와 이전 원본 위치는 보관용이다. **이제 VR 코드와 가이드는 feat/quest-vr의 quest-vr 작업 폴더에서 함께 관리한다.**

실제 개발 재개 시에는 저장소 지침대로 `git fetch origin`을 하고 최신 dev를 반영한 안전한 작업 위치를 사용한다. 미커밋 작업이 있는 폴더를 강제로 reset/checkout하지 않는다. 지금 남아 있는 로컬 위치는 향후 재통합에 따라 달라질 수 있다.

### 2단계: 서버 준비

공원은 로그인·회원 정보·맵·실시간 서버가 필요하다.

- 기존 로컬 테스트 백엔드를 쓸 경우 기본값은 `http://127.0.0.1:8080`다.
- 220m 검수용 로컬 백엔드는 `WORLD_MAP_SOURCE=generated`, `WORLD_MAP_JSON_PATH`와 `WORLD_MAP_MANIFEST_PATH`에 `frontend/generated/park-renewal`의 `server-map.json`과 `manifest.json`을 지정한다. 돌탑을 검수할 때는 `WORLD_JUMPMAP_ENABLED=true`도 필요하다.
- 팀의 실제 개발 백엔드는 `https://dev-api.on-top.world`다.
- 로컬 프론트에서 개발 API로 프록시할 경우에도 **localhost:5288 허용 Origin·OAuth 시작/콜백·쿠키·WebSocket 설정**이 맞아야 한다. API 주소를 바꾸는 것만으로 로그인은 완성되지 않는다.
- 개발 사이트에서 로그인한 쿠키가 localhost에도 자동으로 전달된다고 가정하지 않는다.
- `/actuator/health`의 200은 서버 생존 확인일 뿐, 인증·맵 일치·게임 기능 활성화·정산 성공까지 뜻하지 않는다.

Java·DB·프로필 설정은 현재 팀의 백엔드 실행 문서를 따른다. 이미 정상 실행 중인 개발 서버를 임의로 재시작하거나 DB를 초기화할 필요는 없다.

### 3단계: 프론트 실행과 USB 연결

저장소 기준은 Node 24와 해당 lockfile에 맞는 의존성이다. 기존 설치된 의존성이 있으면 재설치하지 않고 확인한다.

**A. 로컬 백엔드 8080을 쓰는 경우:**

~~~powershell
Set-Location 'C:\Users\SSAFY\Desktop\OnTop\quest-vr\frontend'
$questAdb = 'C:\Users\SSAFY\Desktop\platform-tools\adb.exe'

.\scripts\start-park-xr.ps1 -ConnectQuest -AdbPath $questAdb
~~~

**B. 개발 API를 쓰는 경우 — 220m 맵이 적용되고 localhost 로그인이 허용된 환경:**

~~~powershell
.\scripts\start-park-xr.ps1 -ApiProxyTarget 'https://dev-api.on-top.world' -ConnectQuest -AdbPath $questAdb
~~~

기본 프론트 포트는 **5288**이다. 이전 맵을 사용하는 백엔드에서 VR을 확인할 때는 스크립트에 `-LegacyMap`을 추가한다. 프론트가 실행되는 PowerShell은 계속 열어 둔다.

스크립트가 실행 정책으로 차단된다면 팀이 허용하는 방법을 따른다. 전체 PC 실행 정책을 낮추는 대신, 같은 frontend 폴더에서 별도 PowerShell 창으로 아래 수동 명령을 사용할 수 있다.

~~~powershell
$questAdb = 'C:\Users\SSAFY\Desktop\platform-tools\adb.exe'
& $questAdb reverse tcp:5288 tcp:5288

# 실제 준비된 테스트 BE에 맞게 지정한다. 이 예시는 로컬 8080이다.
$env:API_PROXY_TARGET = 'http://127.0.0.1:8080'
node node_modules/vite/bin/vite.js --mode park-renewal-integration --host 127.0.0.1 --port 5288 --strictPort
~~~

수동 명령은 스크립트의 백엔드 health 사전 확인을 대신하지 않는다. 종료 후 이 PowerShell 창을 닫으면 이 창에서 지정한 환경 변수도 남지 않는다.

**프론트 서버가 이미 켜져 있고 Quest만 다시 연결할 때:**

~~~powershell
.\scripts\start-park-xr.ps1 -ConnectQuestOnly -AdbPath $questAdb
~~~

특정 기기를 고를 때는 `-QuestSerial '실제기기일련번호'`를 추가한다.

### 4단계: localhost의 의미

~~~text
Quest 브라우저의 localhost:5288
  → USB의 adb reverse
  → 내 PC에서 실행한 프론트 5288
  → 설정한 테스트 백엔드
~~~

다른 사람의 Quest나 다른 PC의 `localhost`는 내 PC가 아니다. USB reverse는 인터넷 공개나 다른 플레이어 초대 기능이 아니다.

WebXR은 보안 컨텍스트가 필요하다. **USB로 연결한 localhost는 로컬 개발 예외를 이용**한다. 일반 `http://192.168.…` LAN 주소를 열면 페이지는 보이더라도 VR 실행은 안 될 수 있다. 다른 사람에게는 신뢰 가능한 HTTPS 개발 주소를 제공한다. [MDN의 WebXR 시작 조건](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Startup_and_shutdown)을 참고한다.

### 5단계: 헤드셋에서 공원 열기

1. Quest 홈에서 **Meta Quest Browser / 브라우저**를 연다.
2. 주소창에 `http://localhost:5288/park`를 입력한다.
3. OnTop 계정으로 로그인하고 채널에 들어간다.
4. 공원이 보일 때까지 기다린다. 채팅 입력·메뉴·다른 게임을 닫는다.
5. **공원 VR 시작** 버튼을 컨트롤러 포인터로 가리키고 트리거로 클릭한다.
6. VR 권한/추적 안내가 나오면 사이트와 내용을 확인하고 진행 여부를 선택한다.
7. 화면 전체가 게임 공간으로 바뀌고 고개 움직임에 맞춰 보이면 몰입형 VR에 진입한 것이다.
8. 스틱을 중앙에 놓고 A를 뗀 뒤 조작한다.

단순 페이지 접속이나 브라우저 창의 전체 화면은 몰입형 VR 진입과 다르다. VR은 사용자의 버튼 클릭으로 시작한다.

### 6단계: 작업을 마칠 때

공원에서 B 또는 시스템 메뉴로 VR을 종료하고 프론트 서버 PowerShell에서 Ctrl+C를 누른다. USB 포트 연결만 제거하려면 다음을 쓴다.

~~~powershell
& $questAdb reverse --remove tcp:5288
~~~

5286 독립 화면 등 다른 테스트의 reverse 연결을 전부 지울 필요는 없다.

## 공원·꼬치왕·점프맵 검수

### 1. 공원 안에서 이동·점프

아래 조작은 **feat/quest-vr에 이관한 공원·점프맵 로컬 버전** 기준이다.

| 행동 | Quest Touch |
| --- | --- |
| 이동 | 왼쪽 스틱, 시선의 수평 방향 기준 |
| 달리기 | 왼손 그립을 누른 채 왼쪽 스틱 |
| 점프 | 오른손 A를 눌렀다 떼기 |
| 회전 | 오른쪽 스틱 좌우, 한 번 30도 |
| 돌탑 안내 | 왼손 X |
| 패널 클릭 | 양손 레이저 + 해당 손 트리거 |
| 공원 VR 종료 | 오른손 B |

검수 순서:

1. 고개를 좌우·상하로 움직여 화면이 따라오는지 확인한다.
2. 전진·후진·좌우 이동 후 스틱을 놓아 멈추는지 확인한다.
3. 고개를 돌린 뒤 전진 방향이 맞는지 확인한다.
4. A 한 번으로 상승·착지하고, 계속 누르면 자동으로 반복 점프하지 않는지 확인한다.
5. 공원 장애물·지면·경계에서 기존 캐릭터 충돌이 유지되는지 확인한다.
6. 다른 OnTop 계정으로 접속한 PC에서 Quest 캐릭터의 위치·점프가 보이는지 확인한다.
7. 시스템 메뉴를 열었다 닫은 뒤 중립 입력을 거쳐 다시 움직이는지 확인한다.
8. VR 종료 후 PC 키보드 조작·재진입이 정상인지 확인한다.

자연스러운 머리 추적과 실제 몸의 보행을 서버 캐릭터 이동으로 만드는 room-scale 기능은 구분한다. 현재 문서의 이동·점프는 컨트롤러 기준이다.

### 2. VR 요리사와 PC 서빙 담당의 꼬치왕

**Quest 한 대 + PC 한 대 + 서로 다른 게임 계정 두 개**로 목표 구성을 검수할 수 있다. 개발 PC를 PC 서빙용으로 함께 사용할 수도 있지만, 실행·로그·기기 연결 창은 유지한다.

사전 확인:

- 프론트 빌드 `VITE_SKEWER_COOP_ENABLED=true`.
- 백엔드 `ontop.games.skewer-coop.enabled=true` 및 필요한 실제 프로필·DB 설정.
- FE와 BE가 같은 협동 계약·최신 맵을 사용.
- 코드의 플래그 기본값만 보고 개발 서버에서 켜졌다고 가정하지 않는다.
- DB 변경은 별도 담당 절차를 따른다. 이 가이드는 migration 번호를 새로 정하거나 적용 SQL을 실행하지 않는다.

플레이 흐름:

1. 두 사람 모두 같은 개발 환경에 각자 로그인하고 **같은 공원 채널**을 고른다.
2. Quest 사용자는 공원 VR로 체험관 입구까지 이동한다.
3. Quest에서는 공원 VR 입구의 **꼬치왕 입장**을 트리거로 선택한다. PC는 E 키 또는 해당 화면 버튼을 쓸 수 있다.
4. 한 사람이 **방 만들기**, 다른 사람이 같은 가게의 **참가하기**를 선택한다. 비밀 방을 열었다면 비밀번호 입력도 확인한다.
5. Quest 사용자는 **VR 요리사**, PC 사용자는 **서빙 담당**을 선택한다.
6. Quest 사용자가 **VR 주방으로 들어가기**를 선택하면 현재 WebXR 세션에서 주방을 연다.
7. 주방 공간의 준비 버튼으로 준비하고 PC도 **준비 완료**를 누른다. 화면의 두 사람 준비 상태와 카운트다운을 확인한다.
8. PC가 주문을 받고 주방으로 전달하면 VR 요리사는 전달된 그림 주문을 보고 꼬치를 만든다.
9. VR에서 트리거로 음식을 집고 놓고, 그립으로 꼬치를 잡고, 끝 재료를 가리켜 트리거로 뺀다. 완성 후 오른쪽 전달대나 제출 안내를 가리켜 트리거를 누른다. 꼬치를 쥔 손으로도 제출되는지 확인한다.
10. PC: WASD 이동, E로 화면에 안내되는 접수·전달·수령·서빙·청소 등 상호작용을 수행한다.
11. 결과 확인 후 헤드셋에서 공원 VR로 돌아온다.

처음에는 주문 한 건으로 **접수 → 주방 전달 → VR 제작 → 전달대 제출 → PC 수령 → 손님 서빙**을 검수한다. 이후 두 사람 준비/인사, 접속 중단·복구, 결과·서버 지급/랭킹까지 확대한다. 보상·랭킹은 서버 확정값으로 확인한다.

**혼동하지 말 것:** 기존 `5187/skewer.html` 1인 연습과 `5238`·`5240`의 홀/요리사 프리뷰는 2인 온라인 경기의 완료 증거가 아니다. 테스트 계정 대역이 들어간 `5244/19185` 검수 앱을 일반 초대용 서버로 배포하지 않는다.

### 3. 돌탑 점프맵을 게임 안에서 플레이

로컬 공원 XR을 유지한 채 돌탑으로 간다. 현재 로컬 문서 기준으로 **첫 돌에 착지하면 도전 시작, 마지막 연잎 착지로 완주**한다. 최신 맵/서버 규칙이 바뀌었다면 화면 안내와 최신 계약을 우선한다.

1. X로 놀이 방법을 보고 패널에서 확인한다.
2. 왼쪽 스틱·왼손 그립·A로 이동·달리기·점프한다.
3. 시작·구간 통과·시간·실패/재도전이 실제 서버 상태와 맞는지 확인한다.
4. 완주 후 VR 공간 안의 결과·랭킹 패널을 확인한다.
5. A를 해제한 뒤 다시 누르거나 레이저/트리거로 계속하기·랭킹 이동을 조작한다.
6. 결과를 닫고 공원 이동으로 복귀한다.
7. 보상은 “확인 중”과 “지급 완료”를 구분하고 실제 지갑/랭킹과 맞춰 확인한다.

단순히 A 점프가 되는 것과 실제 점프맵 도전·완주·정산까지 연결되는 것은 다른 검수 항목이다.

## 문제 해결·디버깅

| 증상 | 먼저 확인 |
| --- | --- |
| 개발자 모드가 안 보임 | 기기·모바일 앱·개발자 포털의 계정 일치, 조직 가입·인증, 관리형 기기의 제한 |
| ADB가 unauthorized | 헤드셋 USB 디버깅 승인. 파일 접근 승인과 구분 |
| 로컬 페이지가 안 열림 | PC 서버 실행 유지, 포트 5288, USB와 reverse 연결 |
| 로그인 후 공개 dev 사이트로 이동함 | localhost OAuth 콜백·쿠키 설정. 공개 사이트로 이동하면 로컬 소스 검수가 아님 |
| 공원 VR 버튼이 없음 | VR 코드가 있는 소스/배포인지, Quest 기본 브라우저인지, WebXR 지원·보안 컨텍스트 |
| VR 버튼이 비활성 | 로그인·채널·맵 연결 완료, 착석/게임/열린 메뉴 종료 |
| 평면 창만 보임 | 사이트 내부의 VR 시작을 눌렀는지. Quest Link/화면 미러링으로 대신 진입하지 않음 |
| 움직이지 않음 | 양손 컨트롤러 연결, 스틱 중립/A 해제, 추적·창 포커스·서버 상태 |
| 꼬치왕이 1인 유료 화면임 | 협동 플래그·배포·BE 활성 상태. 2인 협동으로 연결됐다고 가정하지 않음 |
| 서로 방이 안 보임 | 같은 개발 사이트·채널, 다른 계정, 같은 협동 버전·대기 중인 방 |
| 점프맵 결과가 평면 UI로만 뜸 | 점프맵 XR 패널 코드가 해당 배포에 포함됐는지 확인 |
| 맵 버전 불일치 | FE/BE generated 맵·manifest 배포 버전 확인. 검증을 끄고 통과시키지 않음 |
| 코드 수정 후 Quest에는 옛 화면 | 주소가 localhost인지, 실행한 소스 위치·포트가 맞는지, 새로고침 후 재진입 |

### “Meta가 검토하지 않은 콘텐츠” 안내

앞서 보았던 WebXR 콘텐츠 검토 안내와, 앱 목록의 **알 수 없는 출처 APK**는 구분한다. 브라우저에서 우리 주소를 열어 VR을 요청하는 경로라면 APK 설치나 알 수 없는 출처 설정 변경을 기본 해결책으로 삼지 않는다. 안내 문구·현재 주소를 확인하고, 사이트를 신뢰할 수 있을 때 본인이 진행 여부를 선택한다. 실행 버튼이 없거나 오류로 중단되면 정확한 문구를 기록한다.

인증서 오류를 무시하거나 브라우저 보안 기능을 전역 해제해서 해결하지 않는다. 일반 플레이어에게 개발자 계정을 만들게 하는 방식도 사용하지 않는다.

### PC에서 Quest 브라우저 오류 보기

1. USB/ADB의 `device` 상태를 확인한다.
2. Quest 브라우저에서 문제가 난 페이지를 열어 둔다.
3. PC Chrome 주소창에 `chrome://inspect/#devices`를 입력한다.
4. **Discover USB devices**를 켜고 Quest의 해당 탭을 찾아 **inspect**를 누른다.
5. Console의 첫 오류, Network의 실패한 API·WebSocket 연결, 현재 URL·시간·게임 단계·양손 연결 여부를 기록한다.

선택 확인 코드:

~~~javascript
window.isSecureContext
typeof navigator.xr
await navigator.xr?.isSessionSupported('immersive-vr')
~~~

보안 컨텍스트와 지원 여부가 정상이어도 게임 서버/입력 오류는 별도일 수 있다. DevTools 콘솔에서 `requestSession`을 직접 호출하는 방식은 사용자 클릭 조건 때문에 실패할 수 있으므로 실제 사이트 버튼으로 진입을 재현한다.

참고: [Chrome 원격 디버깅](https://developer.chrome.com/docs/devtools/remote-debugging/), [Meta Browser 디버깅](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/).

## 다른 사람에게 열기 전 개발 서버 점검

로컬 검수가 끝나면 최신 dev 기반에서 변경을 통합·검증하고, **팀의 승인된 개발 배포 절차**를 거친다. 이번 사용자 승인은 feat/quest-vr의 커밋·푸시까지다. dev/master 머지와 개발/운영 배포는 진행하지 않는다.

공개 전 체크리스트:

- [ ] 공원 XR·점프맵 XR 변경이 같은 최신 dev 기준에 통합되어 있음.
- [ ] 개발 FE와 개발 BE에 맞는 버전이 배포됨. 빌드 번호/커밋 기록.
- [ ] HTTPS 인증서가 유효하고 WebXR 추적을 막는 응답 정책이 없음.
- [ ] iframe이면 해당 문서·부모의 정책도 확인. 기본 안내는 최상위 페이지 직접 접속.
- [ ] `dev.on-top.world`의 API와 WSS가 개발 BE에 연결됨.
- [ ] Quest 안에서 로그인 시작·콜백·쿠키·새로고침/복구가 정상.
- [ ] 협동 FE 빌드 플래그·BE 기능·실제 DB 설정이 준비됨.
- [ ] 최신 맵 확인과 기존 충돌/이동·입력 소유권 검증이 유지됨.
- [ ] Quest 2 한 대 + PC 한 대/두 계정으로 협동 한 판을 완주함.
- [ ] 공원·점프맵 실기기 도전/완주/복귀를 확인함.
- [ ] 개발 사이트에서 USB를 빼고도 VR 진입이 됨.
- [ ] 실제 기기 성능·컨트롤러 도달 거리·눈높이·추적 중단을 확인함.
- [ ] 일반 플레이어 가이드에 검증 버전·지원 기기·공유할 개발 URL을 적음.

`Permissions-Policy: xr-spatial-tracking=()`처럼 XR을 차단하는 정책을 배포 계층이 추가했는지 확인한다. 무조건 모든 출처를 허용하는 설정을 복사하는 대신 실제 배포 구조에 필요한 허용 범위를 정한다. [MDN의 XR 응답 정책 설명](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/xr-spatial-tracking)을 참고한다.

외부 플레이어가 각자 인터넷으로 개발 사이트에 접속하면 개발자 PC 서버·같은 Wi-Fi·USB·ADB가 필요하지 않다. PC 서빙 담당도 같은 개발 사이트/채널/방에 접속한다. 기기 한 대로는 **다른 Quest 소유자의 네트워크·기기에서의 접속**까지 실측할 수 없으므로 그 항목은 첫 외부 테스터에게 별도 확인받는다.

## 매번 꺼내 보는 재시작 체크리스트

- [ ] 최신 dev와 로컬 변경 보존 상태 확인.
- [ ] Quest 켜기 / 양손 컨트롤러 / Wi-Fi.
- [ ] 로컬 개발이면 USB 연결 → ADB `device`.
- [ ] 올바른 VR 소스 위치에서 테스트 FE·BE 준비.
- [ ] 로컬은 `localhost:5288`, 배포 검수는 `dev.on-top.world`.
- [ ] 로그인 → 채널 → 공원 VR 시작.
- [ ] 중립 입력 → 이동·A 점프 → 목표 게임 검수.
- [ ] 기기·브라우저 버전 / 서버 버전 / 성공·실패 / 오류 기록.

## 개발 기록과 근거

가이드 초판은 `origin/dev@f4423ec7` 기준의 `docs/quest2-guides-20261104`에서 작성했다. 현재는 `origin/dev@12bc82c1` 기반의 `feat/quest-vr`로 코드·문서를 이관했다. 기본 fetch의 삭제된 원격 브랜치 오류는 설정 변경 없이 dev ref를 명시한 fetch로 우회해 최신 기준을 확인했다.

확인한 로컬 소스:

- 공원·점프맵: `C:\Users\SSAFY\Desktop\OnTop\park-jumpmap-vr-20261104\frontend\docs\PARK_JUMPMAP_VR.md` 및 같은 작업 위치의 실제 입력·실행 스크립트.
- 초기 독립 이동: `C:\Users\SSAFY\Desktop\OnTop\quest-locomotion-poc\frontend\docs\QUEST_MOVE_POC.md`.
- 최신 dev의 [꼬치왕 협동 연결](../SKEWER_COOP_NETWORK.md), [협동 정산](../SKEWER_COOP_SETTLEMENT.md), [VR 존](../VR_ZONE_INTEGRATION.md).
- 최신 dev의 `CoopLobby`·`CoopHost`·`ChefPage`·`ChefScene`, 프론트 배포 설정, 실행 스크립트, 공통 개발 규칙.

Meta/Android/브라우저 절차는 위 공식 링크를 2026-11-04에 확인했다. 일부 Meta 문서는 공개 검색에 제공된 본문으로 확인했으며 로그인 후 개인 대시보드 화면을 직접 조작하지 않았다. 실제 표시 메뉴가 달라지면 화면의 공식 안내를 우선한다.

최초 가이드 작성 후 공원·점프맵 코드를 feat/quest-vr에 이관하고 실행 경로를 갱신했다. 상세 검증은 [이관 기록](../PARK_JUMPMAP_VR.md)을 따른다. 계정 등록·초기화·실제 배포·Quest 재연결·온라인 플레이를 대신 수행한 기록은 아니다.
