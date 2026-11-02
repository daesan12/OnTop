-- 공원 랭킹은 서버 시작 시각 이후의 검증 완료 기록을 1분마다 조회한다.
-- 상위 10명 제한 전에 적용되는 상태·버전·시각 필터가 전체 기록을 훑지 않도록 한다.
CREATE INDEX ix_bungeoppang_rounds_ranking
    ON bungeoppang_v4_rounds (terminal_reason, settled_at, minigame_session_id);

CREATE INDEX ix_jump_runs_ranking
    ON jump_runs (status, end_reason, rules_version, course_version, ended_at);
