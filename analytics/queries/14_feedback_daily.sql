-- 한국 날짜별 소리함 제출 수, 제출자 수, 탈퇴로 회원 번호가 지워진 제출 수.
-- 행동 로그가 아닌 기능 테이블(feedback_messages)을 읽는다. 본문(body)은 읽지 않는다.
-- 서버가 90일 지난 제출을 지우므로 그보다 오래된 날짜는 나오지 않는다.
SET time_zone = '+00:00';

SELECT DATE(created_at + INTERVAL 9 HOUR) AS kst_date,
       COUNT(*) AS submissions,
       COUNT(DISTINCT user_id) AS submitters,
       SUM(user_id IS NULL) AS withdrawn_submissions
FROM feedback_messages
GROUP BY kst_date
ORDER BY kst_date;
