-- 회원별 게임 매크로 신호 모아 보기(S15P31B105-442). 게임마다 따로 쌓이는 감시 기록을 회원 한 줄로 모은다.
--   두더지: 화면에 보이지 않는 함정 표적을 친 판(행동 로그 MOLE_ROUND_HONEYPOT, props.hits). 사람은 칠 수 없다.
--           판별 절차와 확정 회원 제외는 docs/mole-audit.md·scripts/mole_review.py를 따른다.
--   점프맵: 서버 감지(jump_macro_detections, V177). REPLAY는 다른 판과 같은 입력, FIXED_START는 매번 같은 출발.
--   줄넘기: 판 감사(jump_rope_audits, V178). steady_rhythm은 박자가 기계처럼 일정, duplicate_log는 같은 입력 기록.
--   과일 땡: 맞힌 종 중 카드 공개 뒤 150ms 미만 비율(GAME_PLAY_STATS, 35번). 맞힌 종 5번 이상에서 50% 이상이면 신호.
--   붕어빵: 판마다 행동 기록을 펼쳐야 해서 무겁다. 39번에서 따로 본다.
-- signal_games = 신호가 난 게임 수. 신호 하나만으로 단정하지 않고, 같은 회원이 여러 게임에서 걸리는지 본다.
-- 결과에는 회원 번호만 있다. 공유할 때도 닉네임을 붙이지 않는다.
SET time_zone = '+00:00';

WITH honeypot AS (
    SELECT user_id,
           COUNT(*) AS rounds,
           SUM(CAST(props->>'$.hits' AS UNSIGNED)) AS hits
    FROM behavior_events
    WHERE event_type = 'MOLE_ROUND_HONEYPOT' AND user_id IS NOT NULL
    GROUP BY user_id
),
jumpmap AS (
    SELECT user_id,
           COUNT(DISTINCT CASE WHEN rule = 'REPLAY' THEN run_id END) AS replay_runs,
           COUNT(DISTINCT CASE WHEN rule = 'FIXED_START' THEN run_id END) AS fixed_start_runs
    FROM jump_macro_detections
    GROUP BY user_id
),
rope AS (
    SELECT user_id, COUNT(*) AS audited, SUM(steady_rhythm) AS steady, SUM(duplicate_log) AS duplicate
    FROM jump_rope_audits
    GROUP BY user_id
),
halli AS (
    SELECT user_id,
           SUM(CAST(props->>'$.successRings' AS UNSIGNED)) AS success,
           SUM(CAST(props->>'$.under150Ms' AS UNSIGNED)) AS under150
    FROM behavior_events
    WHERE event_type = 'GAME_PLAY_STATS' AND props->>'$.gameCode' = 'HALLI_GALLI'
    GROUP BY user_id
),
members AS (
    SELECT user_id FROM honeypot
    UNION SELECT user_id FROM jumpmap
    UNION SELECT user_id FROM rope
    UNION SELECT user_id FROM halli
),
signals AS (
    SELECT m.user_id,
           COALESCE(h.rounds, 0) AS honeypot_rounds,
           COALESCE(h.hits, 0) AS honeypot_hits,
           COALESCE(j.replay_runs, 0) AS jumpmap_replay_runs,
           COALESCE(j.fixed_start_runs, 0) AS jumpmap_fixed_start_runs,
           COALESCE(r.audited, 0) AS jump_rope_audited,
           COALESCE(r.steady, 0) AS jump_rope_steady,
           COALESCE(r.duplicate, 0) AS jump_rope_duplicate,
           COALESCE(hl.success, 0) AS halli_success_rings,
           ROUND(100 * hl.under150 / NULLIF(hl.success, 0), 1) AS halli_fast_pct,
           (COALESCE(h.rounds, 0) > 0)
               + (COALESCE(j.replay_runs, 0) + COALESCE(j.fixed_start_runs, 0) > 0)
               + (COALESCE(r.steady, 0) + COALESCE(r.duplicate, 0) > 0)
               + (COALESCE(hl.success, 0) >= 5 AND hl.under150 >= 0.5 * hl.success) AS signal_games
    FROM members m
    LEFT JOIN honeypot h ON h.user_id = m.user_id
    LEFT JOIN jumpmap j ON j.user_id = m.user_id
    LEFT JOIN rope r ON r.user_id = m.user_id
    LEFT JOIN halli hl ON hl.user_id = m.user_id
)
SELECT *
FROM signals
WHERE signal_games > 0
ORDER BY signal_games DESC, user_id;
