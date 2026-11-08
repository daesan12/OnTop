-- 한국 날짜(제출 기준)별 소리함 제출 수, 제출자 수, 탈퇴로 회원 번호가 지워진 제출 수와 운영진 답변 지표.
-- 행동 로그가 아닌 기능 테이블(feedback_messages, 답변은 V158 feedback_replies)을 읽는다.
-- 의견 본문(body)과 답변 본문(feedback_replies.body)은 읽지 않는다. 답변이 있었는지와 시각만 센다.
-- replied_submissions: 답변이 한 번 이상 달린 제출. first_reply_hours: 제출부터 첫 답변까지 걸린 시간.
-- resolved·reviewing·received: 백업 시점의 처리 상태(RESOLVED 해결, REVIEWING 확인 중, RECEIVED 아직 손대지 않음).
-- received가 쌓이면 답변이 밀리고 있다는 뜻이다. 상태는 답변 없이도 바뀔 수 있어 replied와 따로 본다.
-- 서버가 90일 지난 제출을 지우면 답변도 함께 지워지므로 그보다 오래된 날짜는 나오지 않는다.
SET time_zone = '+00:00';

WITH first_reply AS (
    SELECT feedback_id, MIN(created_at) AS replied_at
    FROM feedback_replies
    GROUP BY feedback_id
)
SELECT DATE(m.created_at + INTERVAL 9 HOUR) AS kst_date,
       COUNT(*) AS submissions,
       COUNT(DISTINCT m.user_id) AS submitters,
       SUM(m.user_id IS NULL) AS withdrawn_submissions,
       COUNT(r.feedback_id) AS replied_submissions,
       ROUND(100 * COUNT(r.feedback_id) / COUNT(*), 1) AS reply_pct,
       ROUND(AVG(TIMESTAMPDIFF(SECOND, m.created_at, r.replied_at)) / 3600, 1) AS avg_first_reply_hours,
       ROUND(MAX(TIMESTAMPDIFF(SECOND, m.created_at, r.replied_at)) / 3600, 1) AS max_first_reply_hours,
       SUM(m.status = 'RESOLVED') AS resolved,
       SUM(m.status = 'REVIEWING') AS reviewing,
       SUM(m.status = 'RECEIVED') AS received
FROM feedback_messages m
LEFT JOIN first_reply r ON r.feedback_id = m.id
GROUP BY kst_date
ORDER BY kst_date;
