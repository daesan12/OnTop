"""운영자가 확정한 두더지 허니팟 기록을 복원 DB의 내부 집계에 적용한다."""

import csv
import json
import re
from pathlib import Path
from typing import NamedTuple

from mysql_cli import run_sql

MOLE_REPORTS = {"28_mole_daily.sql", "34_speed_mole_daily.sql"}
REVIEW_HEADER = ["game", "round_id", "user_id", "status"]
GAMES = {"whack-a-mole", "speed-mole"}
REVIEW_STATUSES = {"CONFIRMED", "PENDING", "REJECTED"}
DECIMAL_ID = r"[1-9][0-9]{0,18}"
HIT_LOG = re.compile(
    rf"(?:^|\bMoleTargets\s*:\s*)mole_honeypot_hit game=(whack-a-mole|speed-mole) "
    rf"userId=({DECIMAL_ID}) roundId=({DECIMAL_ID}) hits=[1-9][0-9]*\s*$"
)


class Detection(NamedTuple):
    game: str
    round_id: int
    user_id: int


def read_confirmed(review_path: Path, log_path: Path) -> set[Detection]:
    decisions: dict[Detection, str] = {}
    with review_path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source, strict=True)
        if next(reader, None) != REVIEW_HEADER:
            raise ValueError("판정 CSV 헤더는 game,round_id,user_id,status여야 합니다.")
        for row in reader:
            if not row:
                continue
            if len(row) != len(REVIEW_HEADER):
                raise ValueError(f"판정 CSV {reader.line_num}행의 열 수를 확인하세요.")
            game, round_id, user_id, status = row
            if game not in GAMES or status not in REVIEW_STATUSES or not all(
                re.fullmatch(DECIMAL_ID, value) and int(value) <= 2**63 - 1 for value in (round_id, user_id)
            ):
                raise ValueError(f"판정 CSV {reader.line_num}행의 게임, ID 또는 상태를 확인하세요.")
            case = Detection(game, int(round_id), int(user_id))
            if decisions.setdefault(case, status) != status:
                raise ValueError(f"판정 CSV {reader.line_num}행에 서로 다른 판정이 있습니다.")

    confirmed = {case for case, status in decisions.items() if status == "CONFIRMED"}
    missing = confirmed.copy()
    with log_path.open(encoding="utf-8-sig") as source:
        for line in source:
            if not missing:
                break
            match = HIT_LOG.search(line)
            if match:
                game, user_id, round_id = match.groups()
                missing.discard(Detection(game, int(round_id), int(user_id)))
    if missing:
        raise ValueError(f"확정 {len(missing)}건과 일치하는 서버 탐지 로그가 없습니다.")
    return confirmed


def check_settled_rounds(container: str, database: str, password: str, confirmed: set[Detection]) -> None:
    if not confirmed:
        return
    # 게임 코드는 고정 목록이며 두 ID는 CSV를 읽을 때 양의 BIGINT로 제한한다.
    cases = json.dumps(sorted(confirmed))
    rows = run_sql(container, database, f"""
        SELECT COUNT(*) AS matched
        FROM JSON_TABLE('{cases}', '$[*]' COLUMNS (
            game VARCHAR(12) PATH '$[0]', round_id BIGINT PATH '$[1]', user_id BIGINT PATH '$[2]'
        )) AS reviewed
        LEFT JOIN mole_rounds m ON reviewed.game = 'whack-a-mole'
            AND m.id = reviewed.round_id AND m.user_id = reviewed.user_id AND m.status = 'SETTLED'
        LEFT JOIN speed_mole_rounds s ON reviewed.game = 'speed-mole'
            AND s.id = reviewed.round_id AND s.user_id = reviewed.user_id AND s.status = 'SETTLED'
        WHERE m.id IS NOT NULL OR s.id IS NOT NULL;
        """, password)
    missing = len(confirmed) - int(rows[0]["matched"])
    if missing:
        raise ValueError(f"확정 {missing}건과 일치하는 정산 판이 복원 DB에 없습니다.")


def apply_review(sql: str, confirmed: set[Detection]) -> str:
    user_ids = json.dumps(sorted({case.user_id for case in confirmed}))
    return f"SET @mole_confirmed_user_ids = '{user_ids}';\n{sql}"
