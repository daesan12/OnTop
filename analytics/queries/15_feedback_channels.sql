-- 채널별 소리함 제출 수와 제출자 수. 본문(body)은 읽지 않는다.
-- 제출자 수에는 탈퇴로 회원 번호가 지워진 제출이 빠진다.
SET time_zone = '+00:00';

SELECT channel_id,
       COUNT(*) AS submissions,
       COUNT(DISTINCT user_id) AS submitters
FROM feedback_messages
GROUP BY channel_id
ORDER BY submissions DESC, channel_id;
