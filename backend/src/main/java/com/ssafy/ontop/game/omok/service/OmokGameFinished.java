package com.ssafy.ontop.game.omok.service;

import java.time.Instant;

// 서버 승패 판정 알림이다. DB 저장·정산 커밋이나 엽전 지급 성공을 뜻하지 않는다.
public record OmokGameFinished(String gameId, String tableId, long version, long blackUserId, long whiteUserId,
        Long winnerUserId, String endReason, Instant endedAt) { }
