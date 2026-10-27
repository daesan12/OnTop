"""격리 복원한 백업 DB에서 관리자 대시보드용 집계 JSON만 만든다.

원본 이벤트·회원 번호·위치 좌표는 파일에 넣지 않는다. 기존 파일은 모든 쿼리와
검증이 성공한 뒤에만 원자적으로 교체한다.
"""

import argparse
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from mysql_cli import password_from_env, run_sql

ROOT = Path(__file__).resolve().parents[2]
QUERIES = ROOT / "analytics" / "queries"
DEFAULT_OUTPUT = ROOT / "analytics" / "out" / "admin-summary.json"
BACKUP_NAME = re.compile(r"^ontop-(?:dev|prod)-(\d{8}T\d{6}Z)\.sql\.gz$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GAME_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")
MAX_COUNT = 2**63 - 1
MAX_ROWS = 10_000


def timestamp_from_backup(name: str) -> str:
    match = BACKUP_NAME.fullmatch(Path(name).name)
    if not match:
        raise ValueError("백업 파일 이름은 ontop-{dev,prod}-YYYYMMDDTHHMMSSZ.sql.gz 형식이어야 합니다.")
    try:
        return datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).isoformat(
            timespec="seconds").replace("+00:00", "Z")
    except ValueError as error:
        raise ValueError("백업 파일 이름의 날짜가 올바르지 않습니다.") from error


def date_of(row: dict[str, str]) -> str:
    value = row.get("kst_date", "")
    if not DATE.fullmatch(value):
        raise ValueError("집계 날짜가 올바르지 않습니다.")
    datetime.strptime(value, "%Y-%m-%d")
    return value


def count_of(row: dict[str, str], key: str) -> int:
    value = row.get(key, "")
    if not value.isascii() or not value.isdecimal():
        raise ValueError(f"집계 숫자 {key}가 올바르지 않습니다.")
    number = int(value)
    if number > MAX_COUNT:
        raise ValueError(f"집계 숫자 {key}가 범위를 넘었습니다.")
    return number


def rows_for(container: str, database: str, filename: str, password: str) -> list[dict[str, str]]:
    rows = run_sql(container, database, (QUERIES / filename).read_text(encoding="utf-8"), password)
    if len(rows) > MAX_ROWS:
        raise ValueError("집계 행이 예상 범위를 넘었습니다.")
    return rows


def build_snapshot(container: str, database: str, backup_name: str, password: str) -> dict:
    data_as_of = timestamp_from_backup(backup_name)
    daily = [{"date": date_of(row),
              "activeUsers": count_of(row, "active_users"), "newUsers": count_of(row, "new_users"),
              "connections": count_of(row, "connections"), "players": count_of(row, "players")}
             for row in rows_for(container, database, "01_daily_active.sql", password)]
    funnel = [{"date": date_of(row),
               "onboarded": count_of(row, "onboarded"), "channelJoined": count_of(row, "channel_joined"),
               "tableJoined": count_of(row, "table_joined"), "gameStarted": count_of(row, "game_started"),
               "gameCompleted": count_of(row, "game_completed")}
              for row in rows_for(container, database, "17_dashboard_funnel_daily.sql", password)]
    games = []
    for row in rows_for(container, database, "18_dashboard_game_daily.sql", password):
        code = row.get("game_code", "")
        if not GAME_CODE.fullmatch(code):
            raise ValueError("집계 게임 코드가 올바르지 않습니다.")
        games.append({"date": date_of(row), "gameCode": code,
                      "started": count_of(row, "games_started"), "ended": count_of(row, "games_ended"),
                      "completed": count_of(row, "games_completed"), "forfeits": count_of(row, "forfeits"),
                      "participants": count_of(row, "participants"),
                      "durationSeconds": count_of(row, "duration_seconds"),
                      "timedGames": count_of(row, "timed_games")})
    for rows, key in ((daily, lambda r: r["date"]), (funnel, lambda r: r["date"]),
                      (games, lambda r: (r["date"], r["gameCode"]))):
        identifiers = [key(row) for row in rows]
        if identifiers != sorted(set(identifiers)):
            raise ValueError("집계 날짜와 게임 코드가 중복되거나 정렬되지 않았습니다.")
    return {"schemaVersion": 1, "dataAsOf": data_as_of,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "daily": daily, "funnel": funnel, "games": games}


def write_snapshot(path: Path, snapshot: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix=".admin-summary-", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            os.chmod(temporary, 0o600)
            json.dump(snapshot, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="격리된 백업 DB에서 관리자용 집계 JSON 생성")
    parser.add_argument("--container", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--backup-name", required=True, help="집계 기준 시각을 얻을 백업 파일 이름")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    snapshot = build_snapshot(args.container, args.database, args.backup_name, password_from_env())
    write_snapshot(args.output, snapshot)
    print(f"집계 파일 생성 완료: 일별 {len(snapshot['daily'])}, 가입 {len(snapshot['funnel'])}, 게임 {len(snapshot['games'])}행")


if __name__ == "__main__":
    main()
