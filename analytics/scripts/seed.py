"""쿼리 검증용 가짜 행동 데이터. 서버가 남기는 형식(behavior_events, world_position_samples)을 그대로 따른다.

정답을 손으로 계산할 수 있게 작게 만든 시나리오다. verify.py의 기대값이 이 시나리오를 기준으로 한다.
시각은 UTC이며 한국 시간은 +9시간이다.

1일차(KST 2026-10-27)
- 101: 가입 → 접속 30분, 채널 입장, 채팅(수신 1), 테이블 착석 2분 대기 → 오목 시작 → 10분 뒤 승리
- 102: 가입 → 접속 20분, 채널 입장, 채팅(수신 1), 착석 1분 대기 → 같은 오목에서 기권, 감정표현, 아이템 7을 2개 구매·장착
- 103: 가입 → 접속 10분, 채널 입장, 채팅(수신 0), 착석 2분 뒤 시작 전 이탈
- 104: 가입 → 접속 1분 뒤 종료
- local 개발 사용자(user_id 없음) 접속 1건
2일차(KST 2026-10-28)
- 101: 로그인 → 접속 10분, 착석 30초 대기 → 주사위(판돈 5) 시작 → 5분 뒤 패배
- 105(기존 회원): 접속 21분, 착석 90초 대기 → 같은 주사위에서 승리
- 103: 접속 5분
8일차(KST 2026-11-03)
- 101: 접속 10분
위치: 101이 스폰 후 남쪽으로 이동하다 (5, 10) 근처에서 2초 동안 막힌 뒤 멈춤, 102는 호수 가운데에서 스폰(이상 기존 맵)
     2일차 103은 새 생성 맵에서 전망대로 걸어가 멈춘 뒤 점프맵 공중(높이 20m)을 지나감,
     105는 구역 대응표에 없는 맵 버전에서 멈춤
시설: 1일차 101·102가 bench-0 두 좌석 이용(101은 5분 뒤 하차, 102는 10분 30초 뒤 연결 끊김),
     103은 walker-1 이용 후 종료 기록 없음, 2일차 101이 telescope-1을 1분 이용

붕어빵(minigame_sessions, 행동 로그가 아닌 기능 테이블)
- 1일차(모두 v2): 101 완료 2판(보상 60+40으로 일일 한도 100 도달), 102 포기 1판·완료 1판, 103 기한 초과 1판,
  104 입력 기록 거절 1판
- 105: 1일차 23:59에 시작해 2일차 00:02에 완료(시작일과 보상일이 다름, v2)
- 2일차: 103 완료 1판(v4, 60초), 101 진행 중 1판(v5 3분)

소리함(feedback_messages, 기능 테이블. 본문은 쿼리가 읽지 않으므로 고정 문구만 넣는다)
- 1일차: 101이 one에 2건, 102가 two에 1건, 탈퇴로 회원 번호가 지워진 1건(one)
- 103: 1일차 UTC 15:30(한국 2일차 00:30)에 two에 1건
- 답변(feedback_replies, V158): 101의 첫 건은 2시간 뒤 첫 답변(확인 중)·4시간 뒤 두 번째 답변으로 해결,
  102 건은 6시간 뒤 답변으로 해결, 103 건은 12시간 뒤 답변으로 해결. 101의 둘째 건은 답변 없이 확인 중,
  탈퇴 회원 건은 손대지 않음

지갑(wallets·wallet_transactions, 기능 테이블. 위 시나리오와 금액을 맞춘다)
- 가입 선물 100: 101~104는 1일차, 105는 하루 전(KST 2026-10-26)
- 오목(판돈 1): 101 +1, 102 −1 / 주사위(판돈 5): 101 −5, 105 +5. 시작할 때 예약, 끝날 때 정산
- 102 상점 구매 −20(아이템 7, 2개), 붕어빵 완료 판의 보상을 판 종료 시각에 지급
- 2일차 오목(판돈 1, 경기 3): 103 +1, 104 −1
- 1일차 101 점프맵 7구간 보상(2+4+7+11+16+24+36=100)과 꼬치 보상 300: 붕어빵 100과 합쳐 공동 한도 500 도달
- 가위바위보 룰렛: 1일차 101 참가비 10(첫 대결 패)·20(1회 도전 성공 뒤 1.5배 30 지급), 102 참가비 30(바로 받아 2칸 60 지급),
  2일차 105 참가비 10(진행 중), 102 참가비 10(도전 실패)
- 주간 추첨(10/26 주): 101 2장·102 1장, 장당 100
- 2일차 103 점프맵 3구간 보상(2+4+7=13)
- 두더지: 1일차 102 30냥, 101은 이미 공동 한도 500에 닿아 계산 20냥이 0냥으로 깎임(둘 다 규칙 1)
  2일차는 규칙 2(45점당 1냥)·규칙 3(40점당 1냥) 판. 정산된 판은 점수가 낮아 계산 보상이 0냥이라 원장에 없다
- 스피드 두더지(V151, 5점당 1냥, 원장은 같은 MOLE_REWARD에 키 mole:reward:speed:<판>):
  1일차 101 0점 판과 260점 판(이미 한도 500이라 52냥이 0냥으로 깎임, 원장 없음),
  2일차 103 60점 판 12냥 지급, 104 미정산 판
- 플러스마이너스(참가비 30): 1일차 102 꽝, 2일차 103 지급 40, 101 잭팟 500
- 꼬치 협동: 1일차 101·102 팀이 VR로 끝까지(4분) 300점 → 각 300냥(101의 꼬치 보상이 이 판)
  2일차 103·105 팀은 PC로 하다 중도 종료(V156 play_mode)
- 104는 탈퇴 회원(지갑은 남지만 잔액 분포에서 제외)
- 최종 잔액: 101=866, 102=329, 103=151, 104=99, 105=145

점프맵(jump_runs, 기능 테이블. 코스 course-1, 8일차만 구간 수가 다른 course-2)
- 1일차: 101 7구간 완주(175초, 100냥), 102 출발 직후 낙하
- 2일차: 103 3구간 뒤 호수 착수(13냥), 104 1구간 뒤 연결 끊김(의심 판), 105 진행 중
- 1일차 102 낙하 판에는 finish_ms가 0으로 남은 오염 데이터를 넣는다(24번 최고 기록 방어 확인)
- 8일차: 101 course-2에서 2구간 뒤 낙하(25번 구간 번호가 코스별 최대 구간까지만 나오는지 확인)
- 1일차 KST 12:00: 101 새 공원 10단계 코스(park220-jump10-v1, V167) 완주 410초. 이미 하루 한도라 지급 0냥

클라이언트 로그(source=CLIENT, 접속해 있던 시간 안에만 넣는다)
- 성능 보고: 1일차 101 desktop·nvidia 2건(fps 60·50), 102 desktop·intel 1건(fps 25),
  103 mobile·adreno 1건(fps 40) / 2일차 101 desktop·nvidia 1건(fps 58), 103 mobile·adreno 1건(fps 20)
- 첫 입장 체험 투어: 101 모든 단계 완료(중간에 접었다 이어 함), 102 걷기까지 하고 인사하기에서 닫음,
  103 환영 비행 중 이탈, 104는 투어 기록 없음 / 2일차 101 다시 보기(replay) 걷기 뒤 닫음(깔때기에서 제외)

의상 뽑기(gacha_receipts, V157. 원장 GACHA_* 행은 넣지 않아 19·20번 기대값은 그대로다)
- 1일차: 101 뽑기권 2장 구매 → 엽전 캡슐(20냥)·3등 상자 → 3등 상자 열기(새 의상), 102 1장 구매 → 4등 상자(1회차)
- 2일차: 102 4등 상자 열기(이미 가진 의상이라 50냥 환급), 103 알림함 뽑기권으로 1등 상자(2회차)
- 10/29: 105 상자 열기 영수증에 금액 필드가 없음(33번 합계가 NULL 대신 0인지 확인)

경기(game_sessions·game_participants, 기능 테이블. 행동 로그 game_id는 경기 번호와 같다)
- 경기 1(1일차 오목)·경기 2(2일차 주사위)는 위 행동 로그와 같은 경기
- 경기 3: 2일차 KST 12:00 103·104 오목. 행동 로그가 없는 경기(로그 유실 구간 가정)
- 경기 4: 2일차 주사위 시작 시도가 잔액 부족으로 거절(예약·참가자 없음)
"""

import json
import uuid
from datetime import datetime

NAMESPACE = uuid.UUID("6f2f4d4e-6c0b-4b6e-9a51-3c1f0a0c1400")
# 11_zone_traffic.sql의 layouts 대응표에 있는 실제 해시(기존 맵·생성 맵)를 쓴다.
MAP_VERSION = "ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d"
GENERATED_MAP_VERSION = "c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07"
RENEWAL_MAP_VERSION = "b1a69e7d26d34bbb56cc88e110d7b4495b5d833669dfd708cf3c416d71a42404"


def build_seed() -> str:
    events: list[tuple] = []
    positions: list[tuple] = []

    def event(at: str, event_type: str, user_id: int | None, *, channel: str | None = None,
              table: str | None = None, game: str | None = None, **props) -> None:
        events.append((at, event_type, user_id, channel, table, game, props, "SERVER"))

    def perf(at: str, user_id: int, device: str, gpu: str, fps: float, p95: float, frames: int,
             slow: int) -> None:
        events.append((at, "PERF_REPORT", user_id, None, None, None, dict(
            windowSec=60, frames=frames, slowFrames=slow, fps=fps, p95Ms=p95, p99Ms=p95 * 2, drawCalls=300,
            triangles=120000, dpr=1.0, renderMode="continuous", quality="low", device=device, gpu=gpu), "CLIENT"))

    def tour(at: str, user_id: int, action: str, step: str | None = None, *, done: int = 0,
             replay: bool = False) -> None:
        props = dict(flow="welcome_tour", action=action, replay=replay, doneCount=done, elapsedSec=0)
        if step:
            props["step"] = step
        events.append((at, "ONBOARDING_STEP", user_id, None, None, None, props, "CLIENT"))

    def facility(at: str, user_id: int, lease_id: str, facility_id: str, kind: str, seat: int,
                 end_reason: str | None = None, duration_ms: int | None = None) -> None:
        props = dict(leaseId=lease_id, facilityId=facility_id, kind=kind, seatIndex=seat)
        if end_reason:
            props.update(endReason=end_reason, durationMs=duration_ms)
        event(at, "FACILITY_RELEASED" if end_reason else "FACILITY_USED", user_id, channel="one", **props)

    def position(at: str, user_id: int, x: float, z: float, moving: bool, *,
                 map_version: str = MAP_VERSION, y: float = 0.84) -> None:
        positions.append((at, user_id, x, y, z, moving, map_version))

    # 1일차
    event("2026-10-27 00:59:00", "USER_ONBOARDED", 101, gender="MALE", provider="SSAFY")
    event("2026-10-27 00:59:30", "USER_ONBOARDED", 102, gender="FEMALE", provider="NAVER")
    event("2026-10-27 01:00:00", "WS_CONNECTED", 101)
    event("2026-10-27 01:00:05", "CHANNEL_JOINED", 101, channel="one", currentUsers=1)
    event("2026-10-27 01:01:00", "CHAT_SENT", 101, channel="one", length=5, recipients=1)
    event("2026-10-27 01:01:00", "WS_CONNECTED", 102)
    event("2026-10-27 01:01:05", "CHANNEL_JOINED", 102, channel="one", currentUsers=2)
    event("2026-10-27 01:02:00", "CHAT_SENT", 102, channel="one", length=3, recipients=1)
    event("2026-10-27 01:05:00", "TABLE_JOINED", 101, table="t1", channel="one")
    event("2026-10-27 01:05:30", "GAME_SELECTED", 101, table="t1", gameCode="OMOK", startMode="AUTO")
    event("2026-10-27 01:05:40", "TABLE_READY_SET", 101, table="t1", ready=True)
    event("2026-10-27 01:06:00", "TABLE_JOINED", 102, table="t1", channel="one")
    event("2026-10-27 01:06:30", "TABLE_READY_SET", 102, table="t1", ready=True)
    for user_id in (101, 102):
        event("2026-10-27 01:07:00", "GAME_STARTED", user_id, table="t1", channel="one", game="1",
              gameCode="OMOK", players=2, betAmountPerPlayer=1)
    event("2026-10-27 01:17:00", "GAME_ENDED", 101, table="t1", game="1", gameCode="OMOK",
          endReason="FORFEIT", players=2, result="WIN")
    event("2026-10-27 01:17:00", "GAME_ENDED", 102, table="t1", game="1", gameCode="OMOK",
          endReason="FORFEIT", players=2, result="FORFEIT", leaveReason="DISCONNECT_TIMEOUT")
    event("2026-10-27 01:18:00", "EMOTE_SENT", 102, channel="one", emoteCode="WAVE")
    event("2026-10-27 01:19:00", "SHOP_PURCHASED", 102, itemId=7, quantity=2, purchaseId="p-1")
    event("2026-10-27 01:19:30", "ITEM_EQUIPPED", 102, itemId=7)
    event("2026-10-27 01:21:00", "WS_DISCONNECTED", 102, reason="SOCKET_CLOSED")
    event("2026-10-27 01:21:00.001", "CHANNEL_LEFT", 102, channel="one", byDisconnect=True)
    event("2026-10-27 01:21:00.002", "TABLE_LEFT", 102, table="t1", channel="one", byDisconnect=True,
          reason="DISCONNECT")
    event("2026-10-27 01:30:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")
    event("2026-10-27 01:30:00.001", "CHANNEL_LEFT", 101, channel="one", byDisconnect=True)
    event("2026-10-27 01:30:00.002", "TABLE_LEFT", 101, table="t1", channel="one", byDisconnect=True,
          reason="DISCONNECT")
    event("2026-10-27 01:59:00", "USER_ONBOARDED", 103, gender="FEMALE", provider="SSAFY")
    event("2026-10-27 02:00:00", "WS_CONNECTED", 103)
    event("2026-10-27 02:00:05", "CHANNEL_JOINED", 103, channel="one", currentUsers=1)
    event("2026-10-27 02:01:00", "CHAT_SENT", 103, channel="one", length=8, recipients=0)
    event("2026-10-27 02:02:00", "TABLE_JOINED", 103, table="t2", channel="one")
    # 태블릿 방장이 시작하지 않아 좌석에서 빠진 경우(참가자 구성은 단순화)
    event("2026-10-27 02:04:00", "TABLE_LEFT", 103, table="t2", channel="one", byDisconnect=False,
          reason="HOST_START_TIMEOUT")
    event("2026-10-27 02:10:00", "WS_DISCONNECTED", 103, reason="SOCKET_CLOSED")
    event("2026-10-27 02:10:00.001", "CHANNEL_LEFT", 103, channel="one", byDisconnect=True)
    event("2026-10-27 02:59:00", "USER_ONBOARDED", 104, gender="MALE", provider="NAVER")
    event("2026-10-27 03:00:00", "WS_CONNECTED", 104)
    event("2026-10-27 03:01:00", "WS_DISCONNECTED", 104, reason="SOCKET_CLOSED")
    event("2026-10-27 03:30:00", "WS_CONNECTED", None)
    facility("2026-10-27 01:10:00", 101, "lease-1", "bench-0", "BENCH", 0)
    facility("2026-10-27 01:10:30", 102, "lease-2", "bench-0", "BENCH", 1)
    facility("2026-10-27 01:15:00", 101, "lease-1", "bench-0", "BENCH", 0, "RELEASED", 300_000)
    facility("2026-10-27 01:21:00", 102, "lease-2", "bench-0", "BENCH", 1, "DISCONNECTED", 630_000)
    facility("2026-10-27 02:05:00", 103, "lease-3", "walker-1", "FITNESS", 0)

    # 2일차
    event("2026-10-28 00:59:00", "WS_CONNECTED", 105)
    event("2026-10-28 00:59:05", "CHANNEL_JOINED", 105, channel="one", currentUsers=1)
    event("2026-10-28 00:59:59", "AUTH_LOGIN", 101, provider="SSAFY")
    event("2026-10-28 01:00:00", "WS_CONNECTED", 101)
    event("2026-10-28 01:00:05", "CHANNEL_JOINED", 101, channel="one", currentUsers=2)
    facility("2026-10-28 01:00:10", 101, "lease-4", "telescope-1", "TELESCOPE", 0)
    facility("2026-10-28 01:01:10", 101, "lease-4", "telescope-1", "TELESCOPE", 0, "RELEASED", 60_000)
    event("2026-10-28 01:01:00", "TABLE_JOINED", 105, table="t1", channel="one")
    event("2026-10-28 01:02:00", "TABLE_JOINED", 101, table="t1", channel="one")
    for user_id in (101, 105):
        event("2026-10-28 01:02:30", "GAME_STARTED", user_id, table="t1", channel="one", game="2",
              gameCode="DICE", players=2, targetScore=2000, betAmountPerPlayer=5)
    event("2026-10-28 01:07:30", "GAME_ENDED", 101, table="t1", game="2", gameCode="DICE",
          endReason="TARGET_REACHED", players=2, result="LOSE")
    event("2026-10-28 01:07:30", "GAME_ENDED", 105, table="t1", game="2", gameCode="DICE",
          endReason="TARGET_REACHED", players=2, result="WIN")
    event("2026-10-28 01:10:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")
    event("2026-10-28 01:20:00", "WS_DISCONNECTED", 105, reason="SOCKET_CLOSED")
    event("2026-10-28 05:00:00", "WS_CONNECTED", 103)
    event("2026-10-28 05:05:00", "WS_DISCONNECTED", 103, reason="SOCKET_CLOSED")

    # 8일차
    event("2026-11-03 01:00:00", "WS_CONNECTED", 101)
    event("2026-11-03 01:10:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")

    # 클라이언트 로그
    perf("2026-10-27 01:01:00", 101, "desktop", "nvidia", 60.0, 18.0, 3600, 0)
    perf("2026-10-27 01:02:00", 101, "desktop", "nvidia", 50.0, 25.0, 3000, 30)
    perf("2026-10-27 01:02:05", 102, "desktop", "intel", 25.0, 60.0, 1500, 300)
    perf("2026-10-27 02:01:05", 103, "mobile", "adreno", 40.0, 33.3, 2400, 24)
    perf("2026-10-28 01:01:00", 101, "desktop", "nvidia", 58.0, 20.0, 3480, 0)
    perf("2026-10-28 05:01:00", 103, "mobile", "adreno", 20.0, 70.0, 1200, 240)
    tour("2026-10-27 01:00:10", 101, "start")
    tour("2026-10-27 01:00:16", 101, "step_done", "flight")
    tour("2026-10-27 01:00:40", 101, "step_done", "walk", done=1)
    tour("2026-10-27 01:01:00", 101, "step_done", "greet", done=2)
    tour("2026-10-27 01:03:00", 101, "collapse", done=2)
    tour("2026-10-27 01:04:00", 101, "resume", done=2)
    tour("2026-10-27 01:05:00", 101, "step_done", "table", done=3)
    tour("2026-10-27 01:12:00", 101, "step_done", "map", done=4)
    tour("2026-10-27 01:14:00", 101, "step_done", "minigame", done=5)
    tour("2026-10-27 01:14:00.001", 101, "finish", done=5)
    tour("2026-10-27 01:01:10", 102, "start")
    tour("2026-10-27 01:01:16", 102, "step_done", "flight")
    tour("2026-10-27 01:01:40", 102, "step_done", "walk", done=1)
    tour("2026-10-27 01:01:50", 102, "abandon", "greet", done=1)
    tour("2026-10-27 02:00:10", 103, "start")
    tour("2026-10-27 02:00:12", 103, "abandon", "flight")
    tour("2026-10-28 01:00:20", 101, "start", replay=True)
    tour("2026-10-28 01:00:40", 101, "step_done", "walk", done=1, replay=True)
    tour("2026-10-28 01:01:00", 101, "abandon", "greet", done=1, replay=True)

    # 위치
    position("2026-10-27 01:00:05", 101, 0, 34, False)
    for second, (x, z) in enumerate([(0, 33), (0, 27), (0, 21), (0, 15), (5, 10), (5.1, 10), (5.2, 10)]):
        position(f"2026-10-27 01:00:{10 + second:02d}", 101, x, z, True)
    position("2026-10-27 01:00:16.500", 101, 5.2, 10, False)
    position("2026-10-27 01:01:05", 102, 56, -12, False)
    position("2026-10-28 05:00:10", 103, 55, 56, True, map_version=GENERATED_MAP_VERSION)
    position("2026-10-28 05:00:11", 103, 62, 56, False, map_version=GENERATED_MAP_VERSION)
    position("2026-10-28 05:00:20", 103, -20, -30, True, map_version=GENERATED_MAP_VERSION, y=20)
    position("2026-10-28 01:00:00", 105, 0, 6, False, map_version="unknown-map")
    # 새 공원: 101은 03:00~03:07 점프맵 도전 중(호수 위 공중·결승 발판은 jump-course), 끝난 뒤 호수 결승 근처에 멈춤,
    # 광장·소리함·빈 길. 103은 같은 시각 도전 없이 점프맵 입구에 있다(다른 회원의 도전 시간은 섞이지 않는다).
    position("2026-10-27 03:01:00", 101, -20, 42, True, map_version=RENEWAL_MAP_VERSION, y=48)
    position("2026-10-27 03:05:00", 101, 62, -5, False, map_version=RENEWAL_MAP_VERSION, y=4.3)
    position("2026-10-27 03:08:00", 101, 62, -5, False, map_version=RENEWAL_MAP_VERSION, y=4.3)
    position("2026-10-27 03:10:00", 101, 0, 38, True, map_version=RENEWAL_MAP_VERSION, y=4.8)
    position("2026-10-27 03:10:01", 101, -22, 24, False, map_version=RENEWAL_MAP_VERSION, y=4.8)
    position("2026-10-27 03:12:00", 101, 40, 80, True, map_version=RENEWAL_MAP_VERSION, y=4.8)
    position("2026-10-27 03:02:00", 103, -66, 13, True, map_version=RENEWAL_MAP_VERSION, y=4.8)

    return to_sql(events, positions) + feature_sql()


def feature_sql() -> str:
    """행동 로그 밖의 기능 테이블. 외래 키 때문에 회원을 먼저 넣는다."""
    lines = []
    for user_id, provider, gender in [(101, "SSAFY", "MALE"), (102, "NAVER", "FEMALE"), (103, "SSAFY", "FEMALE"),
                                      (104, "NAVER", "MALE"), (105, "SSAFY", "MALE")]:
        deleted = "'2026-10-29 00:00:00.000'" if user_id == 104 else "NULL"
        lines.append(
            "INSERT INTO users (id, login_provider, provider_user_id, nickname, character_gender, created_at, "
            f"updated_at, deleted_at) VALUES ({user_id}, '{provider}', 'p{user_id}', 'u{user_id}', '{gender}', "
            f"'2026-10-27 00:00:00.000', '2026-10-27 00:00:00.000', {deleted});"
        )
    # (회원, 상태, 점수, 보상, 시작, 종료)
    for user_id, status, score, reward, started, ended in [
        (101, "COMPLETED", 40, 60, "2026-10-27 01:20:00", "2026-10-27 01:23:00"),
        (101, "COMPLETED", 50, 40, "2026-10-27 01:24:00", "2026-10-27 01:27:00"),
        (102, "ABANDONED", None, 0, "2026-10-27 01:25:00", "2026-10-27 01:26:00"),
        (102, "COMPLETED", 20, 30, "2026-10-27 01:30:00", "2026-10-27 01:34:00"),
        (103, "INVALID", None, 0, "2026-10-27 02:05:00", "2026-10-27 02:15:00"),
        (105, "COMPLETED", 30, 50, "2026-10-27 14:59:00", "2026-10-27 15:02:00"),
        (103, "COMPLETED", 10, 15, "2026-10-28 05:01:00", "2026-10-28 05:03:00"),
        (101, "PLAYING", None, 0, "2026-10-28 01:03:00", None),
        (104, "INVALID", None, 0, "2026-10-27 03:00:00", "2026-10-27 03:02:00"),
    ]:
        lines.append(
            "INSERT INTO minigame_sessions (user_id, minigame_type, status, score, reward_amount, started_at, "
            f"ended_at) VALUES ({user_id}, 'BUNGEOPPANG', '{status}', {sql_value(score)}, {reward}, "
            f"'{timestamp(started)}', {sql_value(ended and timestamp(ended))});"
        )
    lines.extend(game_sql())
    lines.extend(wallet_sql())
    lines.extend(minigame_extra_sql())
    # (회원, 채널, 제출 시각, 백업 시점 처리 상태). 의견 번호는 입력 순서(1부터)다.
    for user_id, channel, created, status in [
        (101, "one", "2026-10-27 01:40:00", "RESOLVED"),
        (101, "one", "2026-10-27 02:00:00", "REVIEWING"),
        (102, "two", "2026-10-27 03:00:00", "RESOLVED"),
        (None, "one", "2026-10-27 04:00:00", "RECEIVED"),
        (103, "two", "2026-10-27 15:30:00", "RESOLVED"),
    ]:
        lines.append(
            "INSERT INTO feedback_messages (user_id, channel_id, body, created_at, status) VALUES "
            f"({sql_value(user_id)}, '{channel}', 'seed', '{timestamp(created)}', '{status}');"
        )
    # 답변 (의견 번호, 답변 시각, 답변 뒤 상태). 본문은 쿼리가 읽지 않으므로 고정 문구다.
    for index, (feedback_id, replied, status) in enumerate([
        (1, "2026-10-27 03:40:00", "REVIEWING"),
        (1, "2026-10-27 05:40:00", "RESOLVED"),
        (3, "2026-10-27 09:00:00", "RESOLVED"),
        (5, "2026-10-28 03:30:00", "RESOLVED"),
    ], start=1):
        lines.append(
            "INSERT INTO feedback_replies (id, feedback_id, administrator_id, body, resulting_status, created_at) "
            f"VALUES ('reply-{index}', {feedback_id}, NULL, 'seed', '{status}', '{timestamp(replied)}');"
        )
    lines.extend(gacha_sql())
    lines.extend(bungeoppang_version_sql())
    return "\n".join(lines) + "\n"


def wallet_sql() -> list[str]:
    """지갑 잔액은 원장 합계와 같게 둔다. 붕어빵 판 번호는 위 minigame_sessions의 입력 순서(1부터)다."""
    lines = []
    # (회원, 유형, 경기, 붕어빵 판, 아이템, 잔액 변화, 예약 변화, 시각[, 원장 키]). 키가 없으면 seed-<순번>.
    entries = [
        (105, "SIGNUP_BONUS", None, None, None, 100, 0, "2026-10-26 01:00:00"),
        (101, "SIGNUP_BONUS", None, None, None, 100, 0, "2026-10-27 00:59:00"),
        (102, "SIGNUP_BONUS", None, None, None, 100, 0, "2026-10-27 00:59:30"),
        (103, "SIGNUP_BONUS", None, None, None, 100, 0, "2026-10-27 01:59:00"),
        (104, "SIGNUP_BONUS", None, None, None, 100, 0, "2026-10-27 02:59:00"),
        (101, "GAME_RESERVE", 1, None, None, 0, 1, "2026-10-27 01:07:00"),
        (102, "GAME_RESERVE", 1, None, None, 0, 1, "2026-10-27 01:07:00"),
        (101, "GAME_SETTLEMENT", 1, None, None, 1, -1, "2026-10-27 01:17:00"),
        (102, "GAME_SETTLEMENT", 1, None, None, -1, -1, "2026-10-27 01:17:00"),
        (102, "SHOP_PURCHASE", None, None, 7, -20, 0, "2026-10-27 01:19:00"),
        (101, "MINIGAME_REWARD", None, 1, None, 60, 0, "2026-10-27 01:23:00"),
        (101, "MINIGAME_REWARD", None, 2, None, 40, 0, "2026-10-27 01:27:00"),
        (102, "MINIGAME_REWARD", None, 4, None, 30, 0, "2026-10-27 01:34:00"),
        (105, "MINIGAME_REWARD", None, 6, None, 50, 0, "2026-10-27 15:02:00"),
        (101, "GAME_RESERVE", 2, None, None, 0, 5, "2026-10-28 01:02:30"),
        (105, "GAME_RESERVE", 2, None, None, 0, 5, "2026-10-28 01:02:30"),
        (101, "GAME_SETTLEMENT", 2, None, None, -5, -5, "2026-10-28 01:07:30"),
        (105, "GAME_SETTLEMENT", 2, None, None, 5, -5, "2026-10-28 01:07:30"),
        (103, "MINIGAME_REWARD", None, 7, None, 15, 0, "2026-10-28 05:03:00"),
        (103, "GAME_RESERVE", 3, None, None, 0, 1, "2026-10-28 03:00:00"),
        (104, "GAME_RESERVE", 3, None, None, 0, 1, "2026-10-28 03:00:00"),
        (103, "GAME_SETTLEMENT", 3, None, None, 1, -1, "2026-10-28 03:08:00"),
        (104, "GAME_SETTLEMENT", 3, None, None, -1, -1, "2026-10-28 03:08:00"),
        *[(101, "JUMP_GATE_REWARD", None, None, None, coins, 0, f"2026-10-27 01:40:{gate * 5:02d}")
          for gate, coins in enumerate([2, 4, 7, 11, 16, 24, 36], start=1)],
        (101, "SKEWER_REWARD", None, None, None, 300, 0, "2026-10-27 01:50:00"),
        (102, "MINIGAME_ENTRY_FEE", None, None, None, -30, 0, "2026-10-27 01:10:00"),
        (102, "RPS_ROULETTE_PAYOUT", None, None, None, 60, 0, "2026-10-27 01:11:00"),
        (102, "RAFFLE_PURCHASE", None, None, None, -100, 0, "2026-10-27 01:12:00"),
        (101, "MINIGAME_ENTRY_FEE", None, None, None, -10, 0, "2026-10-27 01:45:00"),
        (101, "MINIGAME_ENTRY_FEE", None, None, None, -20, 0, "2026-10-27 01:46:00"),
        (101, "RPS_ROULETTE_PAYOUT", None, None, None, 30, 0, "2026-10-27 01:47:00"),
        (101, "RAFFLE_PURCHASE", None, None, None, -100, 0, "2026-10-27 01:55:00"),
        (101, "RAFFLE_PURCHASE", None, None, None, -100, 0, "2026-10-27 01:56:00"),
        (105, "MINIGAME_ENTRY_FEE", None, None, None, -10, 0, "2026-10-28 01:16:00"),
        *[(103, "JUMP_GATE_REWARD", None, None, None, coins, 0, f"2026-10-28 05:04:{gate * 10:02d}")
          for gate, coins in enumerate([2, 4, 7], start=1)],
        (102, "MOLE_REWARD", None, None, None, 30, 0, "2026-10-27 01:06:00", "mole:reward:1"),
        (102, "MINIGAME_ENTRY_FEE", None, None, None, -30, 0, "2026-10-27 01:07:00"),
        (102, "SKEWER_REWARD", None, None, None, 300, 0, "2026-10-27 01:50:00"),
        (103, "MINIGAME_ENTRY_FEE", None, None, None, -30, 0, "2026-10-28 05:07:00"),
        (103, "PLUS_MINUS_PAYOUT", None, None, None, 40, 0, "2026-10-28 05:07:30"),
        (101, "MINIGAME_ENTRY_FEE", None, None, None, -30, 0, "2026-10-28 01:08:00"),
        (101, "PLUS_MINUS_PAYOUT", None, None, None, 500, 0, "2026-10-28 01:08:30"),
        (103, "MOLE_REWARD", None, None, None, 12, 0, "2026-10-28 05:06:03", "mole:reward:speed:1"),
        (102, "MINIGAME_ENTRY_FEE", None, None, None, -10, 0, "2026-10-28 02:00:00"),
    ]
    balances: dict[int, int] = {}
    for user_id, _, _, _, _, balance_delta, _, _, *_ in entries:
        balances[user_id] = balances.get(user_id, 0) + balance_delta
    for user_id in sorted(balances):
        lines.append(f"INSERT INTO wallets (id, user_id, balance, reserved_balance) VALUES "
                     f"({user_id - 100}, {user_id}, {balances[user_id]}, 0);")
    for number, (user_id, kind, game, session, item, balance_delta, reserved_delta, at, *key) in enumerate(entries):
        lines.append(
            "INSERT INTO wallet_transactions (wallet_id, game_session_id, minigame_session_id, item_id, "
            "transaction_type, balance_delta, reserved_delta, idempotency_key, created_at) VALUES "
            f"({user_id - 100}, {sql_value(game)}, {sql_value(session)}, {sql_value(item)}, '{kind}', "
            f"{balance_delta}, {reserved_delta}, '{key[0] if key else f'seed-{number}'}', '{timestamp(at)}');"
        )
    # 추첨 티켓은 원장 번호를 참조한다. 원장 id는 위 입력 순서(1부터)이고, 잔액은 입력 순서대로 누적한다.
    lines.append("INSERT INTO raffle_rounds (id, week_start_date, sales_starts_at, sales_ends_at, ticket_price, "
                 "weekly_ticket_limit, sales_status) VALUES (1, '2026-10-26', '2026-10-25 15:00:00.000', "
                 "'2026-11-01 15:00:00.000', 100, 10, 'CLOSED');")
    # 판매가 없는 다음 주 회차. 27번에서 0으로 나와야 한다.
    lines.append("INSERT INTO raffle_rounds (id, week_start_date, sales_starts_at, sales_ends_at, ticket_price, "
                 "weekly_ticket_limit, sales_status) VALUES (2, '2026-11-02', '2026-11-01 15:00:00.000', "
                 "'2026-11-08 15:00:00.000', 100, 10, 'OPEN');")
    running: dict[int, int] = {}
    ticket = 0
    for number, (user_id, kind, _, _, _, balance_delta, _, at, *_) in enumerate(entries, start=1):
        running[user_id] = running.get(user_id, 0) + balance_delta
        if kind == "RAFFLE_PURCHASE":
            ticket += 1
            lines.append(
                "INSERT INTO raffle_tickets (round_id, user_id, ticket_number, purchase_price, balance_after, "
                f"wallet_transaction_id, idempotency_key, purchased_at) VALUES (1, {user_id}, {ticket}, "
                f"{-balance_delta}, {running[user_id]}, {number}, 'raffle:seed-{ticket}', '{timestamp(at)}');"
            )
    return lines


def minigame_extra_sql() -> list[str]:
    """점프맵 도전과 가위바위보 룰렛 판. 지급 금액은 wallet_sql의 원장과 맞춘다."""
    lines = []
    # (도전, 회원, 상태, 종료 사유, 시작, 종료, 통과 구간, 완주 ms, 지급, 의심, 코스)
    for run, user_id, status, reason, started, ended, gates, finish, coins, suspicious, course in [
        ("jr-1", 101, "ENDED", "FINISH", "2026-10-27 01:38:00", "2026-10-27 01:41:00", 7, 175000, 100, False,
         "course-1"),
        ("jr-2", 102, "ENDED", "FALL", "2026-10-27 01:14:00", "2026-10-27 01:14:20", 0, 0, 0, False, "course-1"),
        ("jr-3", 103, "ENDED", "LAKE", "2026-10-28 05:04:00", "2026-10-28 05:04:50", 3, None, 13, False,
         "course-1"),
        ("jr-4", 104, "ENDED", "DISCONNECT", "2026-10-28 03:20:00", "2026-10-28 03:21:00", 1, None, 0, True,
         "course-1"),
        ("jr-5", 105, "STARTED", None, "2026-10-28 01:15:00", None, 0, None, 0, False, "course-1"),
        ("jr-6", 101, "ENDED", "FALL", "2026-11-03 01:05:00", "2026-11-03 01:05:40", 2, None, 0, False,
         "course-2"),
        ("jr-7", 101, "ENDED", "FINISH", "2026-10-27 03:00:00", "2026-10-27 03:07:00", 10, 410000, 0, False,
         "park220-jump10-v1"),
    ]:
        lines.append(
            "INSERT INTO jump_runs (id, user_id, channel_id, status, end_reason, rules_version, course_version, "
            "is_first_run, started_at, ended_at, gates_passed, gate_times_ms, final_reached, coins_granted, "
            f"elapsed_ms, finish_ms, suspicious) VALUES ('{run}', {user_id}, 'one', '{status}', {sql_value(reason)}, "
            f"'v1', '{course}', 1, '{timestamp(started)}', {sql_value(ended and timestamp(ended))}, {gates}, '[]', "
            f"{int(reason == 'FINISH')}, {coins}, {sql_value(finish)}, {sql_value(finish)}, {int(suspicious)});"
        )
    # (회원, 요청 키, 참가비, KST 날짜, 단계, 결과, 지급, 시작, 정산, 도전 단계, 도전 중)
    # 도전 중인 채로 지면 도전 실패, 아니면 첫 대결 패배다. 지급 = 참가비 × 칸 × 배수(이전 규칙 ×1.0/×1.5/×2.0).
    for user_id, key, fee, day, phase, outcome, payout, started, settled, stake, challenging in [
        (101, "r-1", 10, "2026-10-27", "SETTLED", "LOST", 0, "2026-10-27 01:45:00", "2026-10-27 01:45:40", 0, False),
        (101, "r-2", 20, "2026-10-27", "SETTLED", "PAID", 30, "2026-10-27 01:46:00", "2026-10-27 01:47:00", 1, False),
        (102, "r-3", 30, "2026-10-27", "SETTLED", "PAID", 60, "2026-10-27 01:10:00", "2026-10-27 01:11:00", 0, False),
        (105, "r-4", 10, "2026-10-28", "DUEL", None, 0, "2026-10-28 01:16:00", None, 0, False),
        (102, "r-5", 10, "2026-10-28", "SETTLED", "LOST", 0, "2026-10-28 02:00:00", "2026-10-28 02:00:30", 0, True),
    ]:
        active = "NULL" if phase == "SETTLED" else str(user_id)
        deadline = "NULL" if phase == "SETTLED" else f"'{timestamp(started)}'"
        lines.append(
            "INSERT INTO rps_roulette_rounds (user_id, request_key, active_user_id, fee, play_date, phase, outcome, "
            "payout, deadline_at, started_at, settled_at, stake_level, challenging) VALUES "
            f"({user_id}, '{key}', {active}, {fee}, '{day}', "
            f"'{phase}', {sql_value(outcome)}, {payout}, {deadline}, '{timestamp(started)}', "
            f"{sql_value(settled and timestamp(settled))}, {stake}, {int(challenging)});"
        )
    # 두더지 (회원, 요청 키, 규칙, 상태, 시작, 정산, 점수, 최대 콤보, 잡은 수, 지급).
    # 계산 보상은 규칙 1은 30점, 2는 45점, 3은 40점당 1냥(V149·V150 CHECK와 같다).
    for user_id, key, rules, status, started, settled, score, combo, caught, reward in [
        (102, "m-1", 1, "SETTLED", "2026-10-27 01:05:00", "2026-10-27 01:06:00", 900, 12, 40, 30),
        (101, "m-2", 1, "SETTLED", "2026-10-27 01:52:00", "2026-10-27 01:53:00", 600, 8, 25, 0),
        (103, "m-5", 2, "SETTLED", "2026-10-28 05:01:30", "2026-10-28 05:02:30", 44, 3, 2, 0),
        (103, "m-3", 2, "EXPIRED", "2026-10-28 05:06:00", "2026-10-28 05:08:00", None, None, None, None),
        (105, "m-6", 3, "SETTLED", "2026-10-28 01:10:00", "2026-10-28 01:11:00", 39, 2, 3, 0),
        (105, "m-4", 3, "ACTIVE", "2026-10-28 01:17:00", None, None, None, None, None),
    ]:
        calculated = None if score is None else score // {1: 30, 2: 45, 3: 40}[rules]
        lines.append(
            "INSERT INTO mole_rounds (user_id, request_key, seed, rules_version, status, started_at, settled_at, "
            f"score, max_combo, caught, calculated_reward, reward) VALUES ({user_id}, '{key}', 1, {rules}, "
            f"'{status}', "
            f"'{timestamp(started)}', {sql_value(settled and timestamp(settled))}, {sql_value(score)}, "
            f"{sql_value(combo)}, {sql_value(caught)}, {sql_value(calculated)}, {sql_value(reward)});"
        )
    # 스피드 두더지 (회원, 요청 키, 상태, 시작, 완료, 점수, 적중, 실수). 입력 순서대로 판 번호 1부터.
    # 지급은 원장(키 mole:reward:speed:<판>)에만 있다. 1번 판 12냥, 101의 260점 판은 한도에 막혀 원장이 없다.
    for user_id, key, status, started, completed, score, hits, misses in [
        (103, "s-1", "SETTLED", "2026-10-28 05:05:00", "2026-10-28 05:06:03", 60, 66, 2),
        (101, "s-2", "SETTLED", "2026-10-27 01:56:00", "2026-10-27 01:57:03", 0, 3, 5),
        (101, "s-3", "SETTLED", "2026-10-27 01:58:00", "2026-10-27 01:59:03", 260, 272, 4),
        (104, "s-4", "ACTIVE", "2026-10-28 03:22:00", None, None, None, None),
    ]:
        lines.append(
            "INSERT INTO speed_mole_rounds (user_id, request_key, seed, rules_version, status, started_at, "
            f"completed_at, score, hits, misses) VALUES ({user_id}, '{key}', 1, 1, '{status}', '{timestamp(started)}', "
            f"{sql_value(completed and timestamp(completed))}, {sql_value(score)}, {sql_value(hits)}, "
            f"{sql_value(misses)});"
        )
    # 플러스마이너스 (회원, 요청 키, KST 날짜, 결과, 결과값, 지급, 시각). 참가비 30 고정, 지급 = 결과값 × 10.
    for user_id, key, day, outcome, value, payout, at in [
        (102, "p-1", "2026-10-27", "LOST", -2, 0, "2026-10-27 01:07:00"),
        (103, "p-2", "2026-10-28", "PAID", 4, 40, "2026-10-28 05:07:00"),
        (101, "p-3", "2026-10-28", "JACKPOT", None, 500, "2026-10-28 01:08:00"),
    ]:
        lines.append(
            "INSERT INTO plus_minus_rounds (user_id, request_key, fee, play_date, first_cell, operator_cell, "
            f"second_cell, result_value, outcome, payout, played_at) VALUES ({user_id}, '{key}', 30, '{day}', "
            f"1, 0, 2, {sql_value(value)}, '{outcome}', {payout}, '{timestamp(at)}');"
        )
    # 꼬치 협동 (판, 낮은·높은 회원, 요리사, 서버, 점수, 서빙, 경과 ms, 종료 사유, 랭킹 인정, 종료 시각, 조작 방식)
    for game, low, high, chef, server, score, served, elapsed, reason, eligible, ended, mode in [
        ("sk-1", 101, 102, 101, 102, 300, 15, 240000, "SKEWER_TIME_UP", True, "2026-10-27 01:49:30", "VR"),
        ("sk-2", 103, 105, None, None, 40, 2, 60000, "SKEWER_PLAYER_LEFT", False, "2026-10-28 03:30:00", "PC"),
    ]:
        lines.append(
            "INSERT INTO skewer_coop_results (game_id, result_hash, rules_version, table_id, team_low_id, "
            "team_high_id, chef_user_id, server_user_id, team_score, served, elapsed_ms, duration_ms, end_reason, "
            f"ranking_eligible, ranking_reason, ended_at, play_mode) VALUES ('{game}', '{'0' * 64}', 'coop-v1', 't9', {low}, "
            f"{high}, {sql_value(chef)}, {sql_value(server)}, {score}, {served}, {elapsed}, 240000, '{reason}', "
            f"{int(eligible)}, '{'ELIGIBLE' if eligible else 'NOT_TIME_UP'}', '{timestamp(ended)}', '{mode}');"
        )
    # 꼬치 협동 보상: 1번 판 두 사람 각 300냥(원장 SKEWER_REWARD와 같음)
    for user_id, role, earned, balance in [(101, "chef", 500, 596), (102, "server", 360, 409)]:
        lines.append(
            "INSERT INTO skewer_coop_rewards (game_id, user_id, player_role, coins_calculated, coins_granted, "
            f"earned_at_settlement, balance_after, reward_date, settled_at) VALUES ('sk-1', {user_id}, '{role}', "
            f"300, 300, {earned}, {balance}, '2026-10-27', '2026-10-27 01:50:00.000');"
        )
    return lines


def gacha_sql() -> list[str]:
    """뽑기 확정 영수증. result_json은 서버(GachaDtos.Result)와 같은 이름을 쓰고 쿼리가 읽는 값만 채운다."""
    lines = []
    # (회원, 작업 ID, 종류, 대상, 등급, 중복, 낸 엽전, 받은 엽전, 회차, 시각)
    for user_id, key, kind, target, grade, duplicate, paid, awarded, round_id, at in [
        (101, "b1", "BUY", "", 0, False, 100, 0, None, "2026-10-27 05:00:00"),
        (101, "b2", "BUY", "", 0, False, 100, 0, None, "2026-10-27 05:00:10"),
        (101, "d1", "DRAW", "1", 5, False, 0, 20, "1", "2026-10-27 05:01:00"),
        (101, "d2", "DRAW", "1", 3, False, 0, 0, "1", "2026-10-27 05:02:00"),
        (101, "o1", "OPEN", "3", 3, False, 0, 0, None, "2026-10-27 05:03:00"),
        (102, "b3", "BUY", "", 0, False, 100, 0, None, "2026-10-27 06:00:00"),
        (102, "d3", "DRAW", "1", 4, False, 0, 0, "1", "2026-10-27 06:01:00"),
        (102, "o2", "OPEN", "4", 4, True, 0, 50, None, "2026-10-28 02:00:00"),
        (103, "d4", "DRAW", "2", 1, False, 0, 0, "2", "2026-10-28 06:00:00"),
        # 금액 필드가 빠진 영수증(결과 형식이 바뀐 경우 가정). 그날 합계가 NULL이 아니라 0이어야 한다.
        (105, "o3", "OPEN", "2", 2, False, None, None, None, "2026-10-29 03:00:00"),
    ]:
        result = {"operationId": key, "kind": kind, "roundId": round_id, "grade": grade, "product": None,
                  "duplicate": duplicate}
        if paid is not None:
            result.update(paidCoins=paid, awardedCoins=awarded)
        lines.append(
            "INSERT INTO gacha_receipts (user_id, operation_id, operation_kind, operation_target, result_json, "
            f"created_at) VALUES ({user_id}, '{key}', '{kind}', '{target}', '{json.dumps(result)}', "
            f"'{timestamp(at)}');"
        )
    return lines


def game_sql() -> list[str]:
    """확정·거절된 경기와 참가자. 지갑 원장이 경기 번호를 참조하므로 원장보다 먼저 넣는다."""
    lines = []
    # (번호, 게임, 목표, 테이블, 판돈, 상태, 거절 사유, 종료 사유, 시작(또는 시도), 종료)
    games = [
        (1, "OMOK", None, "t1", 1, "FINISHED", None, "FORFEIT", "2026-10-27 01:07:00", "2026-10-27 01:17:00"),
        (2, "DICE", 2000, "t1", 5, "FINISHED", None, "TARGET_REACHED", "2026-10-28 01:02:30", "2026-10-28 01:07:30"),
        (3, "OMOK", None, "t2", 1, "FINISHED", None, "FIVE_IN_ROW", "2026-10-28 03:00:00", "2026-10-28 03:08:00"),
        (4, "DICE", 4000, "t3", 5, "REJECTED", "INSUFFICIENT_BALANCE", None, "2026-10-28 06:00:00", None),
    ]
    for number, code, target, table, bet, status, rejection, end_reason, started, ended in games:
        confirmed = status != "REJECTED"
        at = f"'{timestamp(started)}'"
        done = sql_value(ended and timestamp(ended))
        lines.append(
            "INSERT INTO game_sessions (id, start_attempt_id, request_fingerprint, table_id, table_version, game_code, "
            "target_score, participant_count, bet_amount_per_player, total_pot, status, settlement_status, "
            "rejection_code, end_reason, owner_instance_id, owner_boot_id, created_at, reserved_at, started_at, "
            f"ended_at, settled_at) VALUES ({number}, UNHEX(LPAD('{number}', 32, '0')), UNHEX(REPEAT('0', 64)), "
            f"'{table}', 0, '{code}', {sql_value(target)}, 2, {bet}, {bet * 2}, '{status}', "
            f"{sql_value('SETTLED' if confirmed else None)}, {sql_value(rejection)}, {sql_value(end_reason)}, "
            f"'seed', UNHEX(REPEAT('0', 32)), {at}, {at if confirmed else 'NULL'}, {at if confirmed else 'NULL'}, "
            f"{done}, {done});"
        )
    # (경기, 회원, 좌석, 상태, 결과, 이탈 사유, 엽전 증감)
    for game, user_id, seat, status, result, leave, delta in [
        (1, 101, 1, "FINISHED", "WIN", None, 1), (1, 102, 2, "LEFT", "FORFEIT", "DISCONNECT_TIMEOUT", -1),
        (2, 101, 1, "FINISHED", "LOSE", None, -5), (2, 105, 2, "FINISHED", "WIN", None, 5),
        (3, 103, 1, "FINISHED", "WIN", None, 1), (3, 104, 2, "FINISHED", "LOSE", None, -1),
    ]:
        ended = f"'{timestamp(games[game - 1][9])}'"
        bet = games[game - 1][4]
        lines.append(
            "INSERT INTO game_participants (game_session_id, user_id, seat_number, participant_order, "
            "participant_status, result, leave_reason, left_at, reserved_amount, coin_delta, "
            f"reservation_released_at) VALUES ({game}, {user_id}, {seat}, {seat - 1}, '{status}', '{result}', "
            f"{sql_value(leave)}, {ended if leave else 'NULL'}, {bet}, {delta}, {ended});"
        )
    return lines


def to_sql(events: list[tuple], positions: list[tuple]) -> str:
    lines = ["SET time_zone = '+00:00';"]
    for number, (at, event_type, user_id, channel, table, game, props, source) in enumerate(events):
        event_id = uuid.uuid5(NAMESPACE, str(number)).hex
        lines.append(
            "INSERT INTO behavior_events (event_id, event_type, schema_version, source, occurred_at, user_id, "
            "channel_id, table_id, game_id, props) VALUES ("
            f"UNHEX('{event_id}'), '{event_type}', 1, '{source}', '{timestamp(at)}', {sql_value(user_id)}, "
            f"{sql_value(channel)}, {sql_value(table)}, {sql_value(game)}, "
            f"{sql_value(json.dumps(props) if props else None)});"
        )
    for at, user_id, x, y, z, moving, map_version in positions:
        lines.append(
            "INSERT INTO world_position_samples (user_id, channel_id, sampled_at, x, y, z, moving, running, "
            f"swimming, map_version) VALUES ({user_id}, 'one', '{timestamp(at)}', {x}, {y}, {z}, "
            f"{int(moving)}, 0, 0, '{map_version}');"
        )
    return "\n".join(lines) + "\n"


def timestamp(value: str) -> str:
    return datetime.fromisoformat(value).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def sql_value(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def bungeoppang_version_sql() -> list[str]:
    """판마다 규칙 버전 기록을 두고, v4·v5 판에는 판 테이블(설정 버전·조리 시간)을 둔다.
    판 번호는 feature_sql의 minigame_sessions 입력 순서(1부터)다."""
    lines = []
    # (판 번호, 규칙 버전, 기록 거절 여부)
    for session, rules, rejected in [(1, "v2", False), (2, "v2", False), (3, "v2", False), (4, "v2", False),
                                     (5, "v2", False), (6, "v2", False), (7, "v4", False), (8, "v5", False),
                                     (9, "v2", True)]:
        lines.append(
            "INSERT INTO bungeoppang_records (minigame_session_id, rules_version, heats, is_first_game, "
            f"rejection_detail) VALUES ({session}, '{rules}', '[]', 0, {sql_value('seed' if rejected else None)});"
        )
    # (판 번호, 설정 버전, 발급·카운트다운, 조리 시작, 조리 끝, 제출 기한, 만료, 수동 일시정지 ms)
    # 조리 60초(v4)·180초(v5 3분). 7번 판은 사용자가 30초 멈췄다.
    for session, config, issued, play_start, play_end, deadline, expires, paused in [
        (7, "v4-20261027.1", "2026-10-28 05:01:00", "2026-10-28 05:01:03", "2026-10-28 05:02:03",
         "2026-10-28 05:02:33", "2026-10-28 05:03:33", 30000),
        (8, "v5-20261027.1", "2026-10-28 01:03:00", "2026-10-28 01:03:03", "2026-10-28 01:06:03",
         "2026-10-28 01:06:33", "2026-10-28 01:07:33", 0),
    ]:
        times = ", ".join(f"'{timestamp(value)}'" for value in (issued, issued, play_start, play_end, deadline, expires))
        lines.append(
            "INSERT INTO bungeoppang_v4_rounds (minigame_session_id, config_version, config_json, issued_at, "
            "countdown_starts_at, play_starts_at, play_ends_at, submit_deadline, expires_at, approved_prefix_hash, "
            f"checkpoint_json, manual_paused_ms) VALUES ({session}, '{config}', '{{}}', {times}, '{'0' * 64}', '{{}}', "
            f"{paused});"
        )
    return lines


if __name__ == "__main__":
    print(build_seed(), end="")
