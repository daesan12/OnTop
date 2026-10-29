"""분석 쿼리를 실행해 결과를 화면에 표로 보여주거나 analytics/out에 CSV로 저장한다.

운영 DB가 아니라 백업본을 복원한 로컬 MySQL 컨테이너에 실행한다. analytics/out은 Git에서 제외된다.

    python analytics/scripts/run.py --container <컨테이너> --database <DB> 02_new_user_funnel.sql
    python analytics/scripts/run.py --container <컨테이너> --database <DB> --all --csv
"""

import argparse
import csv
from pathlib import Path

from mysql_cli import password_from_env, run_sql

ROOT = Path(__file__).resolve().parents[2]
QUERIES = ROOT / "analytics" / "queries"
OUTPUT = ROOT / "analytics" / "out"


def main() -> None:
    parser = argparse.ArgumentParser(description="행동 로그 분석 쿼리를 실행한다.")
    parser.add_argument("--container", required=True, help="백업본을 복원한 MySQL 컨테이너 이름")
    parser.add_argument("--database", required=True, help="행동 로그 테이블이 있는 DB 이름")
    parser.add_argument("--all", action="store_true", help="queries의 모든 쿼리를 실행한다")
    parser.add_argument("--csv", action="store_true", help="analytics/out/<쿼리 이름>.csv로 저장한다")
    parser.add_argument("queries", nargs="*", help="실행할 쿼리 파일 이름 (예: 02_new_user_funnel.sql)")
    args = parser.parse_args()
    names = sorted(path.name for path in QUERIES.glob("*.sql")) if args.all else args.queries
    if not names:
        parser.error("쿼리 파일 이름을 주거나 --all을 지정하세요.")
    password = password_from_env()

    for name in names:
        rows = run_sql(args.container, args.database, (QUERIES / name).read_text(encoding="utf-8"), password)
        if args.csv:
            OUTPUT.mkdir(exist_ok=True)
            path = OUTPUT / (Path(name).stem + ".csv")
            write_csv(path, rows)
            print(f"{name}: {len(rows)}행 → {path.relative_to(ROOT)}")
        else:
            print(f"== {name} ({len(rows)}행)")
            print_table(rows)


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    # Excel에서 한글이 깨지지 않도록 BOM을 붙인다.
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        if not rows:
            return
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def print_table(rows: list[dict[str, str]]) -> None:
    if not rows:
        print("(결과 없음)")
        return
    columns = list(rows[0])
    widths = {column: max(len(column), *(len(row[column]) for row in rows)) for column in columns}
    print("  ".join(column.ljust(widths[column]) for column in columns).rstrip())
    for row in rows:
        print("  ".join(row[column].ljust(widths[column]) for column in columns).rstrip())


if __name__ == "__main__":
    main()
