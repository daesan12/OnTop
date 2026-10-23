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
- 101: 로그인 → 접속 10분, 착석 30초 대기 → 주사위 시작 → 5분 뒤 패배
- 105(기존 회원): 접속 21분, 착석 90초 대기 → 같은 주사위에서 승리
- 103: 접속 5분
8일차(KST 2026-11-03)
- 101: 접속 10분
위치: 101이 스폰 후 남쪽으로 이동하다 (5, 10) 근처에서 2초 동안 막힌 뒤 멈춤, 102는 호수 가운데에서 스폰
"""

import json
import uuid
from datetime import datetime

NAMESPACE = uuid.UUID("6f2f4d4e-6c0b-4b6e-9a51-3c1f0a0c1400")
MAP_VERSION = "map-v1"


def build_seed() -> str:
    events: list[tuple] = []
    positions: list[tuple] = []

    def event(at: str, event_type: str, user_id: int | None, *, channel: str | None = None,
              table: str | None = None, game: str | None = None, **props) -> None:
        events.append((at, event_type, user_id, channel, table, game, props))

    def position(at: str, user_id: int, x: float, z: float, moving: bool) -> None:
        positions.append((at, user_id, x, z, moving))

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
    event("2026-10-27 01:05:30", "GAME_SELECTED", 101, table="t1", gameCode="OMOK")
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
    event("2026-10-27 01:21:00.002", "TABLE_LEFT", 102, table="t1", channel="one", byDisconnect=True)
    event("2026-10-27 01:30:00", "WS_DISCONNECTED", 101, reason="SOCKET_CLOSED")
    event("2026-10-27 01:30:00.001", "CHANNEL_LEFT", 101, channel="one", byDisconnect=True)
    event("2026-10-27 01:30:00.002", "TABLE_LEFT", 101, table="t1", channel="one", byDisconnect=True)
    event("2026-10-27 01:59:00", "USER_ONBOARDED", 103, gender="FEMALE", provider="SSAFY")
    event("2026-10-27 02:00:00", "WS_CONNECTED", 103)
    event("2026-10-27 02:00:05", "CHANNEL_JOINED", 103, channel="one", currentUsers=1)
    event("2026-10-27 02:01:00", "CHAT_SENT", 103, channel="one", length=8, recipients=0)
    event("2026-10-27 02:02:00", "TABLE_JOINED", 103, table="t2", channel="one")
    event("2026-10-27 02:04:00", "TABLE_LEFT", 103, table="t2", channel="one", byDisconnect=False)
    event("2026-10-27 02:10:00", "WS_DISCONNECTED", 103, reason="SOCKET_CLOSED")
    event("2026-10-27 02:10:00.001", "CHANNEL_LEFT", 103, channel="one", byDisconnect=True)
    event("2026-10-27 02:59:00", "USER_ONBOARDED", 104, gender="MALE", provider="NAVER")
    event("2026-10-27 03:00:00", "WS_CONNECTED", 104)
    event("2026-10-27 03:01:00", "WS_DISCONNECTED", 104, reason="SOCKET_CLOSED")
    event("2026-10-27 03:30:00", "WS_CONNECTED", None)

    # 2일차
    event("2026-10-28 00:59:00", "WS_CONNECTED", 105)
    event("2026-10-28 00:59:05", "CHANNEL_JOINED", 105, channel="one", currentUsers=1)
    event("2026-10-28 00:59:59", "AUTH_LOGIN", 101, provider="SSAFY")
    event("2026-10-28 01:00:00", "WS_CONNECTED", 101)
    event("2026-10-28 01:00:05", "CHANNEL_JOINED", 101, channel="one", currentUsers=2)
    event("2026-10-28 01:01:00", "TABLE_JOINED", 105, table="t1", channel="one")
    event("2026-10-28 01:02:00", "TABLE_JOINED", 101, table="t1", channel="one")
    for user_id in (101, 105):
        event("2026-10-28 01:02:30", "GAME_STARTED", user_id, table="t1", channel="one", game="g2",
              gameCode="DICE", players=2, targetScore=2000, betAmountPerPlayer=1)
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

    return to_sql(events, positions)


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
    for at, user_id, x, z, moving in positions:
        lines.append(
            "INSERT INTO world_position_samples (user_id, channel_id, sampled_at, x, y, z, moving, running, "
            f"swimming, map_version) VALUES ({user_id}, 'one', '{timestamp(at)}', {x}, 0.84, {z}, "
            f"{int(moving)}, 0, 0, '{MAP_VERSION}');"
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


if __name__ == "__main__":
    print(build_seed(), end="")
