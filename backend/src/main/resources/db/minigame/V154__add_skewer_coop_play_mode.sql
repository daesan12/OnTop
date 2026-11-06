-- 사용자 승인 V154 (2026-11-06): 꼬치왕 PC/VR 랭킹 분리. V145와 기존 지급 기록은 보존한다.
-- 과거 등록 가능한 기록은 VR뿐이었다. 기존 미등록 PC/전환 경기는 소급 등록하지 않는다.
ALTER TABLE skewer_coop_results
    ADD COLUMN play_mode VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'VR',
    ADD CONSTRAINT ck_skewer_coop_play_mode CHECK (play_mode IN ('PC', 'VR')),
    ADD INDEX ix_skewer_coop_mode_ranking
        (play_mode, rules_version, ranking_eligible, team_score DESC, ended_at);
