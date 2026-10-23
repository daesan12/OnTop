"""Docker 안의 MySQL에 SQL을 보내고 탭 구분 결과를 읽는다.

비밀번호는 ANALYTICS_MYSQL_PASSWORD 환경변수로 받아 docker exec에 환경변수로만 넘긴다.
명령줄 인자나 출력에 남기지 않는다.
"""

import os
import subprocess

PASSWORD_ENV = "ANALYTICS_MYSQL_PASSWORD"


def password_from_env() -> str:
    password = os.environ.get(PASSWORD_ENV)
    if not password:
        raise SystemExit(f"{PASSWORD_ENV} 환경변수에 MySQL root 비밀번호를 지정하세요.")
    return password


def run_sql(container: str, database: str | None, sql: str, password: str) -> list[dict[str, str]]:
    """SQL을 실행하고 마지막 SELECT 결과를 열 이름 기준 딕셔너리 목록으로 돌려준다."""
    command = ["docker", "exec", "-i", "-e", "MYSQL_PWD", container,
               "mysql", "-uroot", "--batch", "--default-character-set=utf8mb4"]
    if database:
        command.append(database)
    result = subprocess.run(command, input=sql, capture_output=True, text=True, encoding="utf-8",
                            env=dict(os.environ, MYSQL_PWD=password))
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return parse_batch(result.stdout)


def parse_batch(output: str) -> list[dict[str, str]]:
    lines = [line for line in output.splitlines() if line]
    if not lines:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:]]
