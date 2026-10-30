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

지갑(wallets·wallet_transactions, 기능 테이블. 위 시나리오와 금액을 맞춘다)
- 가입 선물 100: 101~104는 1일차, 105는 하루 전(KST 2026-10-26)
- 오목(판돈 1): 101 +1, 102 −1 / 주사위(판돈 5): 101 −5, 105 +5. 시작할 때 예약, 끝날 때 정산
- 102 상점 구매 −20(아이템 7, 2개), 붕어빵 완료 판의 보상을 판 종료 시각에 지급
- 104는 탈퇴 회원(지갑은 남지만 잔액 분포에서 제외)
- 최종 잔액: 101=196, 102=109, 103=115, 104=100, 105=155
"""

import json
import uuid
from datetime import datetime

NAMESPACE = uuid.UUID("6f2f4d4e-6c0b-4b6e-9a51-3c1f0a0c1400")
# 11_zone_traffic.sql의 layouts 대응표에 있는 실제 해시(기존 맵·생성 맵)를 쓴다.
MAP_VERSION = "ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d"
GENERATED_MAP_VERSION = "cac3cb040a43630b0b40201ab089a4b328146c03211867b2a155d2b3614acc81"


def build_seed() -> str:
    events: list[tuple] = []
    positions: list[tuple] = []

    def event(at: str, event_type: str, user_id: int | None, *, channel: str | None = None,
              table: str | None = None, game: str | None = None, **props) -> None:
        events.append((at, event_type, user_id, channel, table, game, props))

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
        event("2026-10-27 01:07:00", "GAME_STARTED", user_id, table="t1", channel="one", game="g1",
              gameCode="OMOK", players=2, betAmountPerPlayer=1)
    event("2026-10-27 01:17:00", "GAME_ENDED", 101, table="t1", game="g1", gameCode="OMOK",
          endReason="FORFEIT", players=2, result="WIN")
    event("2026-10-27 01:17:00", "GAME_ENDED", 102, table="t1", game="g1", gameCode="OMOK",
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
        event("2026-10-28 01:02:30", "GAME_STARTED", user_id, table="t1", channel="one", game="g2",
              gameCode="DICE", players=2, targetScore=2000, betAmountPerPlayer=5)
    event("2026-10-28 01:07:30", "GAME_ENDED", 101, table="t1", game="g2", gameCode="DICE",
          endReason="TARGET_REACHED", players=2, result="LOSE")
    event("2026-10-28 01:07:30", "GAME_ENDED", 105, table="t1", game="g2", gameCode="DICE",
          endReason="TARGET_REACHED", players=2, result="WIN")
    event("2026-10-28 01:10:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")
    event("2026-10-28 01:20:00", "WS_DISCONNECTED", 105, reason="SOCKET_CLOSED")
    event("2026-10-28 05:00:00", "WS_CONNECTED", 103)
    event("2026-10-28 05:05:00", "WS_DISCONNECTED", 103, reason="SOCKET_CLOSED")

    # 8일차
    event("2026-11-03 01:00:00", "WS_CONNECTED", 101)
    event("2026-11-03 01:10:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")

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
    lines.extend(wallet_sql())
    for user_id, channel, created in [
        (101, "one", "2026-10-27 01:40:00"),
        (101, "one", "2026-10-27 02:00:00"),
        (102, "two", "2026-10-27 03:00:00"),
        (None, "one", "2026-10-27 04:00:00"),
        (103, "two", "2026-10-27 15:30:00"),
    ]:
        lines.append(
            "INSERT INTO feedback_messages (user_id, channel_id, body, created_at) VALUES "
            f"({sql_value(user_id)}, '{channel}', 'seed', '{timestamp(created)}');"
        )
    lines.extend(bungeoppang_version_sql())
    return "\n".join(lines) + "\n"


def wallet_sql() -> list[str]:
    """지갑 잔액은 원장 합계와 같게 둔다. 붕어빵 판 번호는 위 minigame_sessions의 입력 순서(1부터)다."""
    lines = []
    # (회원, 유형, 경기, 붕어빵 판, 아이템, 잔액 변화, 예약 변화, 시각)
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
    ]
    balances: dict[int, int] = {}
    for user_id, _, _, _, _, balance_delta, _, _ in entries:
        balances[user_id] = balances.get(user_id, 0) + balance_delta
    for user_id in sorted(balances):
        lines.append(f"INSERT INTO wallets (id, user_id, balance, reserved_balance) VALUES "
                     f"({user_id - 100}, {user_id}, {balances[user_id]}, 0);")
    for number, (user_id, kind, game, session, item, balance_delta, reserved_delta, at) in enumerate(entries):
        lines.append(
            "INSERT INTO wallet_transactions (wallet_id, game_session_id, minigame_session_id, item_id, "
            "transaction_type, balance_delta, reserved_delta, idempotency_key, created_at) VALUES "
            f"({user_id - 100}, {sql_value(game)}, {sql_value(session)}, {sql_value(item)}, '{kind}', "
            f"{balance_delta}, {reserved_delta}, 'seed-{number}', '{timestamp(at)}');"
        )
    return lines


def to_sql(events: list[tuple], positions: list[tuple]) -> str:
    lines = ["SET time_zone = '+00:00';"]
    for number, (at, event_type, user_id, channel, table, game, props) in enumerate(events):
        event_id = uuid.uuid5(NAMESPACE, str(number)).hex
        lines.append(
            "INSERT INTO behavior_events (event_id, event_type, schema_version, source, occurred_at, user_id, "
            "channel_id, table_id, game_id, props) VALUES ("
            f"UNHEX('{event_id}'), '{event_type}', 1, 'SERVER', '{timestamp(at)}', {sql_value(user_id)}, "
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
    # (판 번호, 설정 버전, 발급·카운트다운, 조리 시작, 조리 끝, 제출 기한, 만료). 조리 60초(v4)·180초(v5 3분)
    for session, config, issued, play_start, play_end, deadline, expires in [
        (7, "v4-20261027.1", "2026-10-28 05:01:00", "2026-10-28 05:01:03", "2026-10-28 05:02:03",
         "2026-10-28 05:02:33", "2026-10-28 05:03:33"),
        (8, "v5-20261027.1", "2026-10-28 01:03:00", "2026-10-28 01:03:03", "2026-10-28 01:06:03",
         "2026-10-28 01:06:33", "2026-10-28 01:07:33"),
    ]:
        times = ", ".join(f"'{timestamp(value)}'" for value in (issued, issued, play_start, play_end, deadline, expires))
        lines.append(
            "INSERT INTO bungeoppang_v4_rounds (minigame_session_id, config_version, config_json, issued_at, "
            "countdown_starts_at, play_starts_at, play_ends_at, submit_deadline, expires_at, approved_prefix_hash, "
            f"checkpoint_json) VALUES ({session}, '{config}', '{{}}', {times}, '{'0' * 64}', '{{}}');"
        )
    return lines


if __name__ == "__main__":
    print(build_seed(), end="")
