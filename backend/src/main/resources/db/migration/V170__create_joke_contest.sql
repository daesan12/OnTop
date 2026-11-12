-- Confirmed local V170: confirm ownership and order before push/merge/shared DB use.
-- Preserve the historical local V166 in test resources; never repair or renumber its applied DB history.
-- No changes to existing users, games or wallets.
CREATE TABLE joke_contest_daily_quotas (
    user_id BIGINT NOT NULL,
    contest_date DATE NOT NULL,
    used_attempts TINYINT NOT NULL DEFAULT 0,
    last_submitted_at_ms BIGINT NULL,
    PRIMARY KEY (user_id, contest_date),
    CONSTRAINT fk_joke_quota_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_joke_quota_used CHECK (used_attempts BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE joke_contest_submissions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT NOT NULL,
    nickname VARCHAR(32) NOT NULL,
    contest_date DATE NOT NULL,
    question VARCHAR(100) NOT NULL,
    answer VARCHAR(60) NOT NULL,
    normalized_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    active_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    score_x10 SMALLINT NULL,
    wordplay_x10 SMALLINT NOT NULL DEFAULT 0,
    wit_x10 SMALLINT NOT NULL DEFAULT 0,
    originality_x10 SMALLINT NOT NULL DEFAULT 0,
    reason VARCHAR(100) NOT NULL,
    reaction VARCHAR(600) NOT NULL,
    reaction_source VARCHAR(40) NOT NULL,
    judge_version VARCHAR(100) NOT NULL,
    created_at_ms BIGINT NOT NULL,
    completed_at_ms BIGINT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_joke_submission_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uq_joke_request UNIQUE (user_id, request_key),
    CONSTRAINT uq_joke_work UNIQUE (user_id, active_hash),
    CONSTRAINT ck_joke_status CHECK (status IN ('PENDING','SCORED','REJECTED','REVIEW','INVALID_JOKE','FAILED')),
    CONSTRAINT ck_joke_active_hash CHECK ((status='FAILED' AND active_hash IS NULL) OR (status<>'FAILED' AND active_hash IS NOT NULL AND active_hash=normalized_hash)),
    CONSTRAINT ck_joke_scores CHECK (wordplay_x10 BETWEEN 0 AND 400 AND wit_x10 BETWEEN 0 AND 400 AND originality_x10 BETWEEN 0 AND 200),
    CONSTRAINT ck_joke_final_score CHECK ((status='SCORED' AND score_x10 IS NOT NULL AND score_x10=wordplay_x10+wit_x10+originality_x10) OR (status<>'SCORED' AND score_x10 IS NULL AND wordplay_x10=0 AND wit_x10=0 AND originality_x10=0)),
    CONSTRAINT ck_joke_completion CHECK ((status='PENDING' AND completed_at_ms IS NULL) OR (status<>'PENDING' AND completed_at_ms IS NOT NULL AND completed_at_ms>=created_at_ms)),
    INDEX ix_joke_day_rank (contest_date, status, score_x10 DESC, completed_at_ms, created_at_ms, id),
    INDEX ix_joke_user_day (user_id, contest_date, created_at_ms, id),
    INDEX ix_joke_pending_expiry (status, created_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE joke_contest_daily_winners (
    contest_date DATE NOT NULL,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    snapshot_json JSON NOT NULL,
    finalized_at_ms BIGINT NOT NULL,
    PRIMARY KEY (contest_date),
    CONSTRAINT uq_joke_winner_submission UNIQUE (submission_id),
    CONSTRAINT fk_joke_winner_submission FOREIGN KEY (submission_id) REFERENCES joke_contest_submissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
