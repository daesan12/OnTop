package com.ssafy.ontop.game.reconnect;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ActiveGameRecord(long gameSessionId, String gameCode, String tableId,
        GameSession.Status status, GameSession.SettlementStatus settlementStatus,
        String ownerInstanceId, UUID ownerBootId, Instant reservedAt, Instant startedAt, Instant endedAt) {

    public ActiveGameRecord {
        if (gameSessionId <= 0 || gameCode == null || gameCode.isBlank()
                || tableId == null || tableId.isBlank() || ownerInstanceId == null || ownerInstanceId.isBlank()
                || reservedAt == null) {
            throw new IllegalArgumentException("활성 경기 기록을 확인하세요.");
        }
        Objects.requireNonNull(status);
        Objects.requireNonNull(settlementStatus);
        Objects.requireNonNull(ownerBootId);
    }

    public String gameId() {
        return GameIdCodec.format(gameSessionId);
    }

    public boolean ownedBy(String instanceId, UUID bootId) {
        return ownerInstanceId.equals(instanceId) && ownerBootId.equals(bootId);
    }
}
