"""가짜 데이터(seed.py)로 analytics/queries의 결과가 손으로 계산한 정답과 같은지 확인한다.

빈 검증 DB를 만들고 백엔드의 실제 마이그레이션(회원 V1, 지갑 V4, 행동 로그 V5·V6, 붕어빵 V110, 소리함 V127)을 적용하므로
테이블 구조가 바뀌면 이 검증이 먼저 깨진다.

    python analytics/scripts/verify.py --container <MySQL 8.4 컨테이너 이름>
"""

import argparse
import sys
from pathlib import Path

from mysql_cli import password_from_env, run_sql
from seed import build_seed

ROOT = Path(__file__).resolve().parents[2]
QUERIES = ROOT / "analytics" / "queries"
MIGRATIONS = [
    ROOT / "backend/src/main/resources/db/migration/V1__create_users.sql",
    ROOT / "backend/src/main/resources/db/migration/V4__create_wallets.sql",
    ROOT / "backend/src/main/resources/db/migration/V5__create_behavior_events.sql",
    ROOT / "backend/src/main/resources/db/migration/V6__create_world_position_samples.sql",
    ROOT / "backend/src/main/resources/db/minigame/V110__create_minigame_sessions.sql",
    ROOT / "backend/src/main/resources/db/migration/V127__create_feedback_messages.sql",
]
DATABASE = "analytics_verify"

# 쿼리 파일별 기대 결과. 나열한 열만 비교하고, 행 수와 순서는 그대로 맞아야 한다.
EXPECTED: dict[str, list[dict[str, str]]] = {
    "01_daily_active.sql": [
        {"kst_date": "2026-10-27", "active_users": "4", "new_users": "4", "connections": "4", "players": "2"},
        {"kst_date": "2026-10-28", "active_users": "3", "new_users": "0", "connections": "3", "players": "2"},
        {"kst_date": "2026-11-03", "active_users": "1", "new_users": "0", "connections": "1", "players": "0"},
    ],
    "02_new_user_funnel.sql": [
        {"step": "onboarded", "users": "4", "pct_of_onboarded": "100.0"},
        {"step": "channel_joined", "users": "3", "pct_of_onboarded": "75.0"},
        {"step": "table_joined", "users": "3", "pct_of_onboarded": "75.0"},
        {"step": "game_started", "users": "2", "pct_of_onboarded": "50.0"},
        {"step": "game_completed", "users": "1", "pct_of_onboarded": "25.0"},
    ],
    "03_retention.sql": [
        {"cohort_date": "2026-10-27", "users": "4", "d1_users": "2", "d7_users": "1"},
    ],
    "04_connection_sessions.sql": [
        {"kst_date": "2026-10-27", "sessions": "4", "users": "4", "avg_minutes": "15.3", "median_minutes": "15.0"},
        {"kst_date": "2026-10-28", "sessions": "3", "users": "3", "avg_minutes": "12.0", "median_minutes": "10.0"},
        {"kst_date": "2026-11-03", "sessions": "1", "users": "1", "avg_minutes": "10.0", "median_minutes": "10.0"},
    ],
    "05_table_wait.sql": [
        {"seatings": "5", "started": "4", "left_before_start": "1", "left_by_disconnect": "0",
         "left_by_host_timeout": "1", "unresolved": "0",
         "left_before_start_pct": "20.0", "avg_wait_seconds_started": "75.0", "avg_wait_seconds_left": "120.0"},
    ],
    "06_game_summary.sql": [
        {"game_code": "DICE", "games_started": "1", "games_ended": "1", "completion_pct": "100.0",
         "avg_minutes": "5.0", "participant_forfeit_pct": "0.0"},
        {"game_code": "OMOK", "games_started": "1", "games_ended": "1", "completion_pct": "100.0",
         "avg_minutes": "10.0", "participant_forfeit_pct": "50.0"},
    ],
    "07_social.sql": [
        {"kst_date": "2026-10-27", "chats": "3", "chatters": "3", "unheard_chat_pct": "33.3",
         "emotes": "1", "emoters": "1"},
    ],
    "08_shop.sql": [
        {"item_id": "7", "purchases": "1", "buyers": "1", "quantity": "2", "equips": "1"},
    ],
    "09_position_heatmap.sql": [
        {"cell_x": "5", "cell_z": "10", "moving_samples": "3", "stops": "1", "users": "1"},
        {"cell_x": "0", "cell_z": "30", "moving_samples": "1", "stops": "1", "users": "1"},
        {"cell_x": "0", "cell_z": "15", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "20", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "25", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "55", "cell_z": "-15", "moving_samples": "0", "stops": "1", "users": "1"},
    ],
    "10_stuck_points.sql": [
        {"map_version": "map-v1", "cell_x": "5", "cell_z": "10", "stuck_samples": "2", "users": "1"},
    ],
    "11_zone_traffic.sql": [
        {"zone_id": "central-pavilion", "visitors": "1", "moving_samples": "4", "stops": "1"},
        {"zone_id": "path", "visitors": "1", "moving_samples": "3", "stops": "1"},
        {"zone_id": "lake", "visitors": "1", "moving_samples": "0", "stops": "1"},
    ],
    "12_minigame_daily.sql": [
        {"kst_date": "2026-10-27", "sessions": "6", "players": "4", "completed": "4", "abandoned": "1",
         "expired": "1", "playing": "0", "completion_pct": "66.7", "avg_score": "35.0", "avg_minutes": "3.3",
         "rewards": "180"},
        {"kst_date": "2026-10-28", "sessions": "2", "players": "2", "completed": "1", "abandoned": "0",
         "expired": "0", "playing": "1", "completion_pct": "50.0", "avg_score": "10.0", "avg_minutes": "2.0",
         "rewards": "15"},
    ],
    "13_minigame_daily_cap.sql": [
        {"kst_date": "2026-10-27", "completers": "2", "cap_reached_users": "1", "cap_reached_pct": "50.0",
         "rewards": "130", "avg_reward_per_completer": "65.0"},
        {"kst_date": "2026-10-28", "completers": "2", "cap_reached_users": "0", "cap_reached_pct": "0.0",
         "rewards": "65", "avg_reward_per_completer": "32.5"},
    ],
    "14_feedback_daily.sql": [
        {"kst_date": "2026-10-27", "submissions": "4", "submitters": "2", "withdrawn_submissions": "1"},
        {"kst_date": "2026-10-28", "submissions": "1", "submitters": "1", "withdrawn_submissions": "0"},
    ],
    "15_feedback_channels.sql": [
        {"channel_id": "one", "submissions": "3", "submitters": "1"},
        {"channel_id": "two", "submissions": "2", "submitters": "2"},
    ],
    "16_facility_usage.sql": [
        {"kind": "BENCH", "facility_id": "bench-0", "uses": "2", "users": "2", "avg_minutes": "7.8",
         "disconnected_ends": "1", "unended": "0"},
        {"kind": "TELESCOPE", "facility_id": "telescope-1", "uses": "1", "users": "1", "avg_minutes": "1.0",
         "disconnected_ends": "0", "unended": "0"},
        {"kind": "FITNESS", "facility_id": "walker-1", "uses": "1", "users": "1", "avg_minutes": "NULL",
         "disconnected_ends": "0", "unended": "1"},
    ],
    "17_dashboard_funnel_daily.sql": [
        {"kst_date": "2026-10-27", "onboarded": "4", "channel_joined": "3", "table_joined": "3",
         "game_started": "2", "game_completed": "1"},
    ],
    "18_dashboard_game_daily.sql": [
        {"kst_date": "2026-10-27", "game_code": "OMOK", "games_started": "1", "games_ended": "1",
         "games_completed": "1", "forfeits": "1", "participants": "2", "duration_seconds": "600",
         "timed_games": "1"},
        {"kst_date": "2026-10-28", "game_code": "DICE", "games_started": "1", "games_ended": "1",
         "games_completed": "1", "forfeits": "0", "participants": "2", "duration_seconds": "300",
         "timed_games": "1"},
    ],
    "19_economy_daily.sql": [
        {"kst_date": "2026-10-26", "transaction_type": "SIGNUP_BONUS", "transactions": "1", "users": "1",
         "coins_in": "100", "coins_out": "0", "net_coins": "100"},
        {"kst_date": "2026-10-26", "transaction_type": "ALL", "transactions": "1", "users": "1",
         "coins_in": "100", "coins_out": "0", "net_coins": "100"},
        {"kst_date": "2026-10-27", "transaction_type": "GAME_RESERVE", "transactions": "2", "users": "2",
         "coins_in": "0", "coins_out": "0", "net_coins": "0"},
        {"kst_date": "2026-10-27", "transaction_type": "GAME_SETTLEMENT", "transactions": "2", "users": "2",
         "coins_in": "1", "coins_out": "1", "net_coins": "0"},
        {"kst_date": "2026-10-27", "transaction_type": "MINIGAME_REWARD", "transactions": "3", "users": "2",
         "coins_in": "130", "coins_out": "0", "net_coins": "130"},
        {"kst_date": "2026-10-27", "transaction_type": "SHOP_PURCHASE", "transactions": "1", "users": "1",
         "coins_in": "0", "coins_out": "20", "net_coins": "-20"},
        {"kst_date": "2026-10-27", "transaction_type": "SIGNUP_BONUS", "transactions": "4", "users": "4",
         "coins_in": "400", "coins_out": "0", "net_coins": "400"},
        {"kst_date": "2026-10-27", "transaction_type": "ALL", "transactions": "12", "users": "4",
         "coins_in": "531", "coins_out": "21", "net_coins": "510"},
        {"kst_date": "2026-10-28", "transaction_type": "GAME_RESERVE", "transactions": "2", "users": "2",
         "coins_in": "0", "coins_out": "0", "net_coins": "0"},
        {"kst_date": "2026-10-28", "transaction_type": "GAME_SETTLEMENT", "transactions": "2", "users": "2",
         "coins_in": "5", "coins_out": "5", "net_coins": "0"},
        {"kst_date": "2026-10-28", "transaction_type": "MINIGAME_REWARD", "transactions": "2", "users": "2",
         "coins_in": "65", "coins_out": "0", "net_coins": "65"},
        {"kst_date": "2026-10-28", "transaction_type": "ALL", "transactions": "6", "users": "3",
         "coins_in": "70", "coins_out": "5", "net_coins": "65"},
    ],
    "20_wallet_balances.sql": [
        {"wallets": "4", "total_balance": "575", "avg_balance": "143.8", "median_balance": "135.0",
         "max_balance": "196", "top10_share_pct": "34.1", "reserved_balance": "0"},
    ],
    "21_bet_amounts.sql": [
        {"game_code": "DICE", "games": "1", "min_bet": "5", "avg_bet": "5.0", "max_bet": "5", "avg_pot": "10.0"},
        {"game_code": "OMOK", "games": "1", "min_bet": "1", "avg_bet": "1.0", "max_bet": "1", "avg_pot": "2.0"},
    ],
}


def main() -> int:
    parser = argparse.ArgumentParser(description="행동 로그 분석 쿼리를 가짜 데이터로 검증한다.")
    parser.add_argument("--container", required=True, help="MySQL 8.4 Docker 컨테이너 이름")
    args = parser.parse_args()
    password = password_from_env()

    run_sql(args.container, None, f"DROP DATABASE IF EXISTS {DATABASE}; CREATE DATABASE {DATABASE};", password)
    for migration in MIGRATIONS:
        run_sql(args.container, DATABASE, migration.read_text(encoding="utf-8"), password)
    run_sql(args.container, DATABASE, build_seed(), password)

    failures = 0
    failures += check_data_quality(args.container, password)
    for name, expected in EXPECTED.items():
        actual = run_sql(args.container, DATABASE, (QUERIES / name).read_text(encoding="utf-8"), password)
        problem = compare(expected, actual)
        print(f"{'PASS' if problem is None else 'FAIL'} {name}" + ("" if problem is None else f": {problem}"))
        failures += problem is not None
    missing = sorted(path.name for path in QUERIES.glob("*.sql")
                     if path.name not in EXPECTED and path.name != "00_data_quality.sql")
    if missing:
        print(f"FAIL 기대값이 없는 쿼리: {', '.join(missing)}")
        failures += 1
    print(f"{'모두 통과' if failures == 0 else f'{failures}개 실패'}")
    return 1 if failures else 0


def check_data_quality(container: str, password: str) -> int:
    """시간대별 합계가 전체 행 수와 같은지 본다. 시간대 경계 계산이 행을 빠뜨리거나 중복하지 않는지 확인한다."""
    rows = run_sql(container, DATABASE, (QUERIES / "00_data_quality.sql").read_text(encoding="utf-8"), password)
    totals = run_sql(container, DATABASE, "SELECT (SELECT COUNT(*) FROM behavior_events) AS events, "
                                          "(SELECT COUNT(*) FROM world_position_samples) AS positions;",
                     password)[0]
    events = sum(int(row["events"]) for row in rows)
    positions = sum(int(row["position_rows"]) for row in rows)
    ok = str(events) == totals["events"] and str(positions) == totals["positions"]
    print(f"{'PASS' if ok else 'FAIL'} 00_data_quality.sql"
          + ("" if ok else f": 합계 events={events}/{totals['events']} positions={positions}/{totals['positions']}"))
    return 0 if ok else 1


def compare(expected: list[dict[str, str]], actual: list[dict[str, str]]) -> str | None:
    if len(expected) != len(actual):
        return f"행 수 {len(actual)}개, 기대 {len(expected)}개. 실제={actual}"
    for index, (want, got) in enumerate(zip(expected, actual)):
        for column, value in want.items():
            if got.get(column) != value:
                return f"{index + 1}행 {column}={got.get(column)!r}, 기대 {value!r}. 실제 행={got}"
    return None


if __name__ == "__main__":
    sys.exit(main())
