-- 한국 날짜별 채팅·감정표현 수와 사용자 수.
-- unheard_chat_pct: 20m 안에 받은 사람이 없던 채팅 비율. 높으면 채팅 반경이나 사람 밀도를 점검한다.
SET time_zone = '+00:00';

SELECT DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date,
       SUM(event_type = 'CHAT_SENT') AS chats,
       COUNT(DISTINCT CASE WHEN event_type = 'CHAT_SENT' THEN user_id END) AS chatters,
       ROUND(100 * SUM(event_type = 'CHAT_SENT' AND CAST(props->>'$.recipients' AS UNSIGNED) = 0)
             / NULLIF(SUM(event_type = 'CHAT_SENT'), 0), 1) AS unheard_chat_pct,
       SUM(event_type = 'EMOTE_SENT') AS emotes,
       COUNT(DISTINCT CASE WHEN event_type = 'EMOTE_SENT' THEN user_id END) AS emoters
FROM behavior_events
WHERE event_type IN ('CHAT_SENT', 'EMOTE_SENT')
GROUP BY kst_date
ORDER BY kst_date;
