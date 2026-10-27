package com.ssafy.ontop.world.dto;

import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import java.time.Instant;

/** 공개 표시 정보만 전달한다. 손패·주사위·개인 정산 정보는 포함하지 않는다. */
public record WorldGameReaction(String eventId, String gameId, String tableId, String channelId,
        String gameCode, long version, String userId, GameDefeatConfirmed.Kind kind, int remainingBefore,
        String motion, int durationMs, Instant occurredAt) {
    public static WorldGameReaction from(GameDefeatConfirmed event, String channelId) {
        boolean duel = event.remainingBefore() == 2;
        return new WorldGameReaction(event.eventId(), event.gameId(), event.tableId(), channelId,
                event.gameCode(), event.version(), Long.toString(event.userId()), event.kind(),
                event.remainingBefore(), duel ? "table-flip" : "head-clutch", duel ? 2800 : 3600, event.occurredAt());
    }
}
