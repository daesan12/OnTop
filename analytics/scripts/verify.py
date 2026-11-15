"""가짜 데이터(seed.py)로 analytics/queries의 결과가 손으로 계산한 정답과 같은지 확인한다.

빈 검증 DB를 만들고 백엔드의 실제 마이그레이션(회원 V1, 지갑 V4, 행동 로그 V5·V6, 붕어빵 V110, 소리함 V127)을 적용하므로
테이블 구조가 바뀌면 이 검증이 먼저 깨진다.

    python analytics/scripts/verify.py --container <MySQL 8.4 컨테이너 이름>
"""

import argparse
import sys
from pathlib import Path

from mole_review import Detection, apply_review, check_settled_rounds
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
    ROOT / "backend/src/main/resources/db/minigame/V111__create_bungeoppang_replay_records.sql",
    ROOT / "backend/src/main/resources/db/minigame/V124__create_bungeoppang_v4_rounds_and_orders.sql",
    ROOT / "backend/src/main/resources/db/minigame/V132__add_bungeoppang_manual_pause.sql",
    ROOT / "backend/src/main/resources/db/migration/V127__create_feedback_messages.sql",
    ROOT / "backend/src/main/resources/db/migration/V112__create_game_sessions_and_participants.sql",
    ROOT / "backend/src/main/resources/db/migration/V122__support_game_bets_and_explicit_leave.sql",
    ROOT / "backend/src/main/resources/db/migration/V123__add_game_result_outbox_and_departure_receipts.sql",
    ROOT / "backend/src/main/resources/db/minigame/V131__create_jumpmap_runs_and_rewards.sql",
    ROOT / "backend/src/main/resources/db/minigame/V136__create_rps_roulette_rounds.sql",
    ROOT / "backend/src/main/resources/db/migration/V140__create_weekly_raffle_tickets.sql",
    ROOT / "backend/src/main/resources/db/minigame/V141__increase_jumpmap_run_reward_cap.sql",
    ROOT / "backend/src/main/resources/db/minigame/V143__create_plus_minus_rounds.sql",
    ROOT / "backend/src/main/resources/db/minigame/V145__create_skewer_coop_results.sql",
    ROOT / "backend/src/main/resources/db/minigame/V147__create_mole_rounds.sql",
    ROOT / "backend/src/main/resources/db/minigame/V149__mole_rules_v2_reward_rate.sql",
    ROOT / "backend/src/main/resources/db/minigame/V150__mole_rules_v3_reward_rate.sql",
    ROOT / "backend/src/main/resources/db/minigame/V151__create_speed_mole_rounds.sql",
    ROOT / "backend/src/main/resources/db/minigame/V156__add_skewer_coop_play_mode.sql",
    ROOT / "backend/src/main/resources/db/migration/V157__create_shared_gacha.sql",
    ROOT / "backend/src/main/resources/db/migration/V158__create_feedback_replies_and_personal_notifications.sql",
    ROOT / "backend/src/main/resources/db/migration/V159__add_gacha_refill_deadline.sql",
    ROOT / "backend/src/main/resources/db/minigame/V164__raise_rps_roulette_payout_cap.sql",
    ROOT / "backend/src/main/resources/db/minigame/V167__extend_jumpmap_to_ten_stages.sql",
    ROOT / "backend/src/main/resources/db/minigame/V179__raise_jumpmap_run_reward_cap.sql",
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
        {"cell_x": "-70", "cell_z": "10", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "-20", "cell_z": "-30", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "-20", "cell_z": "40", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "15", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "20", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "25", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "0", "cell_z": "35", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "40", "cell_z": "80", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "55", "cell_z": "55", "moving_samples": "1", "stops": "0", "users": "1"},
        {"cell_x": "60", "cell_z": "-5", "moving_samples": "0", "stops": "2", "users": "1"},
        {"cell_x": "-25", "cell_z": "20", "moving_samples": "0", "stops": "1", "users": "1"},
        {"cell_x": "0", "cell_z": "5", "moving_samples": "0", "stops": "1", "users": "1"},
        {"cell_x": "55", "cell_z": "-15", "moving_samples": "0", "stops": "1", "users": "1"},
        {"cell_x": "60", "cell_z": "55", "moving_samples": "0", "stops": "1", "users": "1"},
    ],
    "10_stuck_points.sql": [
        {"map_version": "ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d",
         "cell_x": "5", "cell_z": "10", "stuck_samples": "2", "users": "1"},
    ],
    "11_zone_traffic.sql": [
        {"layout": "generated", "zone_id": "jump-course", "visitors": "1", "moving_samples": "1", "stops": "0"},
        {"layout": "generated", "zone_id": "tower", "visitors": "1", "moving_samples": "1", "stops": "1"},
        {"layout": "legacy", "zone_id": "central-pavilion", "visitors": "1", "moving_samples": "4", "stops": "1"},
        {"layout": "legacy", "zone_id": "path", "visitors": "1", "moving_samples": "3", "stops": "1"},
        {"layout": "legacy", "zone_id": "lake", "visitors": "1", "moving_samples": "0", "stops": "1"},
        {"layout": "renewal", "zone_id": "jump-course", "visitors": "1", "moving_samples": "1", "stops": "1"},
        {"layout": "renewal", "zone_id": "jump-start", "visitors": "1", "moving_samples": "1", "stops": "0"},
        {"layout": "renewal", "zone_id": "path", "visitors": "1", "moving_samples": "1", "stops": "0"},
        {"layout": "renewal", "zone_id": "plaza", "visitors": "1", "moving_samples": "1", "stops": "0"},
        {"layout": "renewal", "zone_id": "lake", "visitors": "1", "moving_samples": "0", "stops": "1"},
        {"layout": "renewal", "zone_id": "mailbox", "visitors": "1", "moving_samples": "0", "stops": "1"},
        {"layout": "unmapped", "zone_id": "unmapped", "visitors": "1", "moving_samples": "0", "stops": "1"},
    ],
    "12_minigame_daily.sql": [
        {"kst_date": "2026-10-27", "game_version": "v2", "play_seconds": "NULL", "sessions": "7", "players": "5",
         "completed": "4", "abandoned": "1", "expired": "1", "rejected": "1", "playing": "0",
         "completion_pct": "57.1", "avg_score": "35.0", "avg_minutes": "3.3", "rewards": "180"},
        {"kst_date": "2026-10-28", "game_version": "v4-20261027.1", "play_seconds": "60", "sessions": "1",
         "players": "1", "completed": "1", "abandoned": "0", "expired": "0", "rejected": "0", "playing": "0",
         "completion_pct": "100.0", "avg_score": "10.0", "avg_minutes": "1.5", "rewards": "15"},
        {"kst_date": "2026-10-28", "game_version": "v5-20261027.1", "play_seconds": "180", "sessions": "1",
         "players": "1", "completed": "0", "abandoned": "0", "expired": "0", "rejected": "0", "playing": "1",
         "completion_pct": "0.0", "avg_score": "NULL", "avg_minutes": "NULL", "rewards": "0"},
    ],
    "13_minigame_daily_cap.sql": [
        {"kst_date": "2026-10-27", "daily_cap": "500", "earners": "2", "cap_reached_users": "1", "cap_reached_pct": "50.0",
         "rewards": "860", "avg_reward_per_earner": "430.0", "bungeoppang_rewards": "130",
         "jumpmap_rewards": "100", "skewer_rewards": "600", "mole_rewards": "30", "speed_mole_rewards": "0",
         "rank_rewards": "0"},
        {"kst_date": "2026-10-28", "daily_cap": "500", "earners": "2", "cap_reached_users": "0", "cap_reached_pct": "0.0",
         "rewards": "90", "avg_reward_per_earner": "45.0", "bungeoppang_rewards": "65",
         "jumpmap_rewards": "13", "skewer_rewards": "0", "mole_rewards": "0", "speed_mole_rewards": "12",
         "rank_rewards": "0"},
        # 105: 순위 보상 400 + 꼬치 300 = 700냥. 한도 1000냥이라 도달이 아니다.
        {"kst_date": "2026-11-13", "daily_cap": "1000", "earners": "1", "cap_reached_users": "0", "cap_reached_pct": "0.0",
         "rewards": "700", "avg_reward_per_earner": "700.0", "bungeoppang_rewards": "0",
         "jumpmap_rewards": "0", "skewer_rewards": "300", "mole_rewards": "0", "speed_mole_rewards": "0",
         "rank_rewards": "400"},
    ],
    "14_feedback_daily.sql": [
        {"kst_date": "2026-10-27", "submissions": "4", "submitters": "2", "withdrawn_submissions": "1",
         "replied_submissions": "2", "reply_pct": "50.0", "avg_first_reply_hours": "4.0",
         "max_first_reply_hours": "6.0", "resolved": "2", "reviewing": "1", "received": "1"},
        {"kst_date": "2026-10-28", "submissions": "1", "submitters": "1", "withdrawn_submissions": "0",
         "replied_submissions": "1", "reply_pct": "100.0", "avg_first_reply_hours": "12.0",
         "max_first_reply_hours": "12.0", "resolved": "1", "reviewing": "0", "received": "0"},
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
        {"kst_date": "2026-10-27", "transaction_type": "JUMP_GATE_REWARD", "transactions": "7", "users": "1",
         "coins_in": "100", "coins_out": "0", "net_coins": "100"},
        {"kst_date": "2026-10-27", "transaction_type": "MINIGAME_ENTRY_FEE", "transactions": "4", "users": "2",
         "coins_in": "0", "coins_out": "90", "net_coins": "-90"},
        {"kst_date": "2026-10-27", "transaction_type": "MINIGAME_REWARD", "transactions": "3", "users": "2",
         "coins_in": "130", "coins_out": "0", "net_coins": "130"},
        {"kst_date": "2026-10-27", "transaction_type": "MOLE_REWARD", "transactions": "1", "users": "1",
         "coins_in": "30", "coins_out": "0", "net_coins": "30"},
        {"kst_date": "2026-10-27", "transaction_type": "RAFFLE_PURCHASE", "transactions": "3", "users": "2",
         "coins_in": "0", "coins_out": "300", "net_coins": "-300"},
        {"kst_date": "2026-10-27", "transaction_type": "RPS_ROULETTE_PAYOUT", "transactions": "2", "users": "2",
         "coins_in": "90", "coins_out": "0", "net_coins": "90"},
        {"kst_date": "2026-10-27", "transaction_type": "SHOP_PURCHASE", "transactions": "1", "users": "1",
         "coins_in": "0", "coins_out": "20", "net_coins": "-20"},
        {"kst_date": "2026-10-27", "transaction_type": "SIGNUP_BONUS", "transactions": "4", "users": "4",
         "coins_in": "400", "coins_out": "0", "net_coins": "400"},
        {"kst_date": "2026-10-27", "transaction_type": "SKEWER_REWARD", "transactions": "2", "users": "2",
         "coins_in": "600", "coins_out": "0", "net_coins": "600"},
        {"kst_date": "2026-10-27", "transaction_type": "ALL", "transactions": "31", "users": "4",
         "coins_in": "1351", "coins_out": "411", "net_coins": "940"},
        {"kst_date": "2026-10-28", "transaction_type": "GAME_RESERVE", "transactions": "4", "users": "4",
         "coins_in": "0", "coins_out": "0", "net_coins": "0"},
        {"kst_date": "2026-10-28", "transaction_type": "GAME_SETTLEMENT", "transactions": "4", "users": "4",
         "coins_in": "6", "coins_out": "6", "net_coins": "0"},
        {"kst_date": "2026-10-28", "transaction_type": "JUMP_GATE_REWARD", "transactions": "3", "users": "1",
         "coins_in": "13", "coins_out": "0", "net_coins": "13"},
        {"kst_date": "2026-10-28", "transaction_type": "MINIGAME_ENTRY_FEE", "transactions": "4", "users": "4",
         "coins_in": "0", "coins_out": "80", "net_coins": "-80"},
        {"kst_date": "2026-10-28", "transaction_type": "MINIGAME_REWARD", "transactions": "2", "users": "2",
         "coins_in": "65", "coins_out": "0", "net_coins": "65"},
        {"kst_date": "2026-10-28", "transaction_type": "MOLE_REWARD", "transactions": "1", "users": "1",
         "coins_in": "12", "coins_out": "0", "net_coins": "12"},
        {"kst_date": "2026-10-28", "transaction_type": "PLUS_MINUS_PAYOUT", "transactions": "2", "users": "2",
         "coins_in": "540", "coins_out": "0", "net_coins": "540"},
        {"kst_date": "2026-10-28", "transaction_type": "ALL", "transactions": "20", "users": "5",
         "coins_in": "636", "coins_out": "86", "net_coins": "550"},
        {"kst_date": "2026-11-13", "transaction_type": "GAME_RANK_REWARD", "transactions": "1", "users": "1",
         "coins_in": "400", "coins_out": "0", "net_coins": "400"},
        {"kst_date": "2026-11-13", "transaction_type": "SKEWER_REWARD", "transactions": "1", "users": "1",
         "coins_in": "300", "coins_out": "0", "net_coins": "300"},
        {"kst_date": "2026-11-13", "transaction_type": "ALL", "transactions": "2", "users": "1",
         "coins_in": "700", "coins_out": "0", "net_coins": "700"},
    ],
    "20_wallet_balances.sql": [
        {"wallets": "4", "total_balance": "2191", "avg_balance": "547.8", "median_balance": "587.0",
         "max_balance": "866", "top10_share_pct": "39.5", "reserved_balance": "0"},
    ],
    "21_bet_amounts.sql": [
        {"game_code": "DICE", "games": "1", "min_bet": "5", "avg_bet": "5.0", "max_bet": "5", "avg_pot": "10.0"},
        {"game_code": "OMOK", "games": "1", "min_bet": "1", "avg_bet": "1.0", "max_bet": "1", "avg_pot": "2.0"},
    ],
    "22_game_log_coverage.sql": [
        {"kst_date": "2026-10-27", "game_code": "OMOK", "start_attempts": "1", "rejected_starts": "0",
         "confirmed_games": "1", "with_start_log": "1", "finished_games": "1", "with_end_log": "1",
         "start_log_pct": "100.0", "end_log_pct": "100.0"},
        {"kst_date": "2026-10-28", "game_code": "DICE", "start_attempts": "2", "rejected_starts": "1",
         "confirmed_games": "1", "with_start_log": "1", "finished_games": "1", "with_end_log": "1",
         "start_log_pct": "100.0", "end_log_pct": "100.0"},
        {"kst_date": "2026-10-28", "game_code": "OMOK", "start_attempts": "1", "rejected_starts": "0",
         "confirmed_games": "1", "with_start_log": "0", "finished_games": "1", "with_end_log": "0",
         "start_log_pct": "0.0", "end_log_pct": "0.0"},
    ],
    "23_game_results.sql": [
        {"game_code": "DICE", "end_reason": "TARGET_REACHED", "games": "1", "avg_minutes": "5.0",
         "participants": "2", "forfeits": "0", "disconnect_leaves": "0", "explicit_leaves": "0",
         "settled_games": "1"},
        {"game_code": "OMOK", "end_reason": "FIVE_IN_ROW", "games": "1", "avg_minutes": "8.0",
         "participants": "2", "forfeits": "0", "disconnect_leaves": "0", "explicit_leaves": "0",
         "settled_games": "1"},
        {"game_code": "OMOK", "end_reason": "FORFEIT", "games": "1", "avg_minutes": "10.0",
         "participants": "2", "forfeits": "1", "disconnect_leaves": "1", "explicit_leaves": "0",
         "settled_games": "1"},
    ],
    "24_jumpmap_daily.sql": [
        {"kst_date": "2026-10-27", "runs": "3", "players": "2", "ended": "3", "finished": "2", "finish_pct": "66.7",
         "avg_gates_passed": "5.7", "fall": "1", "lake": "0", "disconnect": "0", "other_end": "0",
         "in_progress": "0", "best_finish_seconds": "175.0", "avg_finish_seconds": "292.5", "coins": "100",
         "suspicious_runs": "0"},
        {"kst_date": "2026-10-28", "runs": "3", "players": "3", "ended": "2", "finished": "0", "finish_pct": "0.0",
         "avg_gates_passed": "2.0", "fall": "0", "lake": "1", "disconnect": "1", "other_end": "0",
         "in_progress": "1", "best_finish_seconds": "NULL", "avg_finish_seconds": "NULL", "coins": "13",
         "suspicious_runs": "1"},
        {"kst_date": "2026-11-03", "runs": "1", "players": "1", "ended": "1", "finished": "0", "finish_pct": "0.0",
         "avg_gates_passed": "2.0", "fall": "1", "lake": "0", "disconnect": "0", "other_end": "0",
         "in_progress": "0", "best_finish_seconds": "NULL", "avg_finish_seconds": "NULL", "coins": "0",
         "suspicious_runs": "0"},
    ],
    "25_jumpmap_gates.sql": [
        {"course_version": "course-1", "gate": "0", "runs_reached": "3", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "course-1", "gate": "1", "runs_reached": "2", "reached_pct": "66.7",
         "lost_from_previous": "1"},
        {"course_version": "course-1", "gate": "2", "runs_reached": "2", "reached_pct": "66.7",
         "lost_from_previous": "0"},
        {"course_version": "course-1", "gate": "3", "runs_reached": "2", "reached_pct": "66.7",
         "lost_from_previous": "0"},
        {"course_version": "course-1", "gate": "4", "runs_reached": "1", "reached_pct": "33.3",
         "lost_from_previous": "1"},
        {"course_version": "course-1", "gate": "5", "runs_reached": "1", "reached_pct": "33.3",
         "lost_from_previous": "0"},
        {"course_version": "course-1", "gate": "6", "runs_reached": "1", "reached_pct": "33.3",
         "lost_from_previous": "0"},
        {"course_version": "course-1", "gate": "7", "runs_reached": "1", "reached_pct": "33.3",
         "lost_from_previous": "0"},
        {"course_version": "course-2", "gate": "0", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "course-2", "gate": "1", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "course-2", "gate": "2", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "0", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "1", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "2", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "3", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "4", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "5", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "6", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "7", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "8", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "9", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
        {"course_version": "park220-jump10-v1", "gate": "10", "runs_reached": "1", "reached_pct": "100.0",
         "lost_from_previous": "0"},
    ],
    "26_rps_roulette_daily.sql": [
        {"kst_date": "2026-10-27", "rounds": "3", "players": "2", "settled": "3", "in_progress": "0",
         "fee_10_rounds": "1", "fee_20_rounds": "1", "fee_30_rounds": "1", "fees": "60", "paid_rounds": "2",
         "payouts": "90", "payout_pct": "150.0", "absorbed_coins": "-30", "first_duel_lost": "1",
         "challenge_lost": "0", "paid_x1": "1", "paid_after_1_challenge": "1", "paid_after_2_challenges": "0"},
        {"kst_date": "2026-10-28", "rounds": "2", "players": "2", "settled": "1", "in_progress": "1",
         "fee_10_rounds": "2", "fee_20_rounds": "0", "fee_30_rounds": "0", "fees": "20", "paid_rounds": "0",
         "payouts": "0", "payout_pct": "0.0", "absorbed_coins": "20", "first_duel_lost": "0",
         "challenge_lost": "1", "paid_x1": "0", "paid_after_1_challenge": "0", "paid_after_2_challenges": "0"},
    ],
    "27_raffle_rounds.sql": [
        {"week_start_date": "2026-10-26", "sales_status": "CLOSED", "ticket_price": "100",
         "weekly_ticket_limit": "10", "tickets": "3", "buyers": "2", "avg_tickets_per_buyer": "1.5",
         "max_tickets_per_buyer": "2", "buyers_at_limit": "0", "coins_spent": "300"},
        {"week_start_date": "2026-11-02", "sales_status": "OPEN", "ticket_price": "100",
         "weekly_ticket_limit": "10", "tickets": "0", "buyers": "0", "avg_tickets_per_buyer": "0.0",
         "max_tickets_per_buyer": "0", "buyers_at_limit": "0", "coins_spent": "0"},
    ],
    "28_mole_daily.sql": [
        {"kst_date": "2026-10-27", "rules_version": "1", "points_per_coin": "30", "rounds": "2", "players": "2",
         "settled": "2", "expired": "0", "active": "0", "avg_score": "750.0", "max_score": "900",
         "avg_max_combo": "10.0", "avg_caught": "32.5", "calculated_coins": "50", "rewarded_coins": "30",
         "capped_coins": "20"},
        {"kst_date": "2026-10-28", "rules_version": "2", "points_per_coin": "45", "rounds": "2", "players": "1",
         "settled": "1", "expired": "1", "active": "0", "avg_score": "44.0", "max_score": "44",
         "avg_max_combo": "3.0", "avg_caught": "2.0", "calculated_coins": "0", "rewarded_coins": "0",
         "capped_coins": "0"},
        {"kst_date": "2026-10-28", "rules_version": "3", "points_per_coin": "40", "rounds": "2", "players": "1",
         "settled": "1", "expired": "0", "active": "1", "avg_score": "39.0", "max_score": "39",
         "avg_max_combo": "2.0", "avg_caught": "3.0", "calculated_coins": "0", "rewarded_coins": "0",
         "capped_coins": "0"},
    ],
    "29_plus_minus_daily.sql": [
        {"kst_date": "2026-10-27", "rounds": "1", "players": "1", "lost": "1", "paid": "0", "jackpot": "0",
         "fees": "30", "payouts": "0", "payout_pct": "0.0", "absorbed_coins": "30"},
        {"kst_date": "2026-10-28", "rounds": "2", "players": "2", "lost": "0", "paid": "1", "jackpot": "1",
         "fees": "60", "payouts": "540", "payout_pct": "900.0", "absorbed_coins": "-480"},
    ],
    "30_skewer_coop_daily.sql": [
        {"kst_date": "2026-10-27", "play_mode": "VR", "games": "1", "players": "2", "avg_team_score": "300.0", "max_team_score": "300",
         "avg_served": "15.0", "avg_minutes": "4.0", "time_up": "1", "ended_early": "0", "ranking_eligible": "1",
         "calculated_coins": "600", "granted_coins": "600"},
        {"kst_date": "2026-10-28", "play_mode": "PC", "games": "1", "players": "2", "avg_team_score": "40.0", "max_team_score": "40",
         "avg_served": "2.0", "avg_minutes": "1.0", "time_up": "0", "ended_early": "1", "ranking_eligible": "0",
         "calculated_coins": "0", "granted_coins": "0"},
    ],
    "31_client_performance.sql": [
        {"kst_date": "2026-10-27", "device": "desktop", "gpu": "intel", "reports": "1", "users": "1",
         "avg_fps": "25.0", "avg_p95_ms": "60.0", "slow_frame_pct": "20.00", "low_fps_report_pct": "100.0"},
        {"kst_date": "2026-10-27", "device": "desktop", "gpu": "nvidia", "reports": "2", "users": "1",
         "avg_fps": "55.0", "avg_p95_ms": "21.5", "slow_frame_pct": "0.45", "low_fps_report_pct": "0.0"},
        {"kst_date": "2026-10-27", "device": "mobile", "gpu": "adreno", "reports": "1", "users": "1",
         "avg_fps": "40.0", "avg_p95_ms": "33.3", "slow_frame_pct": "1.00", "low_fps_report_pct": "0.0"},
        {"kst_date": "2026-10-28", "device": "desktop", "gpu": "nvidia", "reports": "1", "users": "1",
         "avg_fps": "58.0", "avg_p95_ms": "20.0", "slow_frame_pct": "0.00", "low_fps_report_pct": "0.0"},
        {"kst_date": "2026-10-28", "device": "mobile", "gpu": "adreno", "reports": "1", "users": "1",
         "avg_fps": "20.0", "avg_p95_ms": "70.0", "slow_frame_pct": "20.00", "low_fps_report_pct": "100.0"},
    ],
    "32_welcome_tour_funnel.sql": [
        {"step_order": "0", "step": "start", "done_users": "3", "abandoned_users": "0"},
        {"step_order": "1", "step": "flight", "done_users": "2", "abandoned_users": "1"},
        {"step_order": "2", "step": "walk", "done_users": "2", "abandoned_users": "0"},
        {"step_order": "3", "step": "greet", "done_users": "1", "abandoned_users": "1"},
        {"step_order": "4", "step": "map", "done_users": "1", "abandoned_users": "0"},
        {"step_order": "5", "step": "minigame", "done_users": "1", "abandoned_users": "0"},
        {"step_order": "6", "step": "table", "done_users": "1", "abandoned_users": "0"},
        {"step_order": "7", "step": "finish", "done_users": "1", "abandoned_users": "0"},
    ],
    "33_gacha_daily.sql": [
        {"kst_date": "2026-10-27", "tickets_bought": "3", "buyers": "2", "draws": "3", "drawers": "2",
         "rounds_drawn": "1", "grade1_boxes": "0", "grade2_boxes": "0", "grade3_boxes": "1", "grade4_boxes": "1",
         "coin_capsules": "1", "opens": "1", "duplicates": "0", "coins_spent": "300", "coins_returned": "20",
         "absorbed_coins": "280", "return_pct": "6.7"},
        {"kst_date": "2026-10-28", "tickets_bought": "0", "buyers": "0", "draws": "1", "drawers": "1",
         "rounds_drawn": "1", "grade1_boxes": "1", "grade2_boxes": "0", "grade3_boxes": "0", "grade4_boxes": "0",
         "coin_capsules": "0", "opens": "1", "duplicates": "1", "coins_spent": "0", "coins_returned": "50",
         "absorbed_coins": "-50", "return_pct": "NULL"},
        {"kst_date": "2026-10-29", "tickets_bought": "0", "buyers": "0", "draws": "0", "drawers": "0",
         "rounds_drawn": "0", "grade1_boxes": "0", "grade2_boxes": "0", "grade3_boxes": "0", "grade4_boxes": "0",
         "coin_capsules": "0", "opens": "1", "duplicates": "0", "coins_spent": "0", "coins_returned": "0",
         "absorbed_coins": "0", "return_pct": "NULL"},
    ],
    "34_speed_mole_daily.sql": [
        {"kst_date": "2026-10-27", "rules_version": "1", "rounds": "2", "players": "1", "settled": "2",
         "unsettled": "0", "avg_score": "130.0", "max_score": "260", "avg_hits": "137.5", "avg_misses": "4.5",
         "hit_pct": "96.8", "calculated_coins": "52", "rewarded_coins": "0", "capped_coins": "52"},
        {"kst_date": "2026-10-28", "rules_version": "1", "rounds": "2", "players": "2", "settled": "1",
         "unsettled": "1", "avg_score": "60.0", "max_score": "60", "avg_hits": "66.0", "avg_misses": "2.0",
         "hit_pct": "97.1", "calculated_coins": "12", "rewarded_coins": "12", "capped_coins": "0"},
    ],
    # 105: 맞힌 종 6(모두 h1), 150ms 미만 5 → 83.3%. 101: 평균 (640×3 + 500×2) / 5 = 584ms.
    "35_halli_bell_reaction.sql": [
        {"user_id": "105", "games": "2", "success_rings": "6", "penalty_rings": "2", "late_rings": "4",
         "first_ring_pct": "60.0", "min_reaction_ms": "60", "avg_reaction_ms": "95", "fast_pct": "83.3",
         "quick_pct": "100.0"},
        {"user_id": "101", "games": "2", "success_rings": "5", "penalty_rings": "1", "late_rings": "3",
         "first_ring_pct": "62.5", "min_reaction_ms": "380", "avg_reaction_ms": "584", "fast_pct": "0.0",
         "quick_pct": "0.0"},
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
    failures += check_reviewed_mole_reports(args.container, password)
    missing = sorted(path.name for path in QUERIES.glob("*.sql")
                     if path.name not in EXPECTED and path.name != "00_data_quality.sql")
    if missing:
        print(f"FAIL 기대값이 없는 쿼리: {', '.join(missing)}")
        failures += 1
    print(f"{'모두 통과' if failures == 0 else f'{failures}개 실패'}")
    return 1 if failures else 0


def check_reviewed_mole_reports(container: str, password: str) -> int:
    confirmed = {Detection("whack-a-mole", 2, 101), Detection("speed-mole", 1, 103)}
    check_settled_rounds(container, DATABASE, password, confirmed)
    expectations = {
        "28_mole_daily.sql": [
            {"kst_date": "2026-10-27", "rounds": "1", "players": "1", "max_score": "900", "rewarded_coins": "30"},
            {"kst_date": "2026-10-28", "rules_version": "3", "rounds": "2", "players": "1", "max_score": "39"},
        ],
        "34_speed_mole_daily.sql": [
            {"kst_date": "2026-10-28", "rounds": "1", "players": "1", "settled": "0", "unsettled": "1",
             "rewarded_coins": "0"},
        ],
    }
    failures = 0
    for name, expected in expectations.items():
        sql = (QUERIES / name).read_text(encoding="utf-8")
        problem = compare(expected, run_sql(container, DATABASE, apply_review(sql, confirmed), password))
        print(f"{'PASS' if problem is None else 'FAIL'} reviewed {name}" + ("" if problem is None else f": {problem}"))
        failures += problem is not None

    # 판 번호가 같아도 소유자가 다르거나 미정산이면 승인 파일을 적용할 수 없다.
    for case in (Detection("whack-a-mole", 1, 101), Detection("speed-mole", 4, 104)):
        try:
            check_settled_rounds(container, DATABASE, password, {case})
        except ValueError:
            continue
        print("FAIL 확정 기록의 소유자 또는 정산 상태 검증")
        failures += 1
    return failures


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
