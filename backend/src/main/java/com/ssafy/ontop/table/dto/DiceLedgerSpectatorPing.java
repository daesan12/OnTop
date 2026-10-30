package com.ssafy.ontop.table.dto;

import com.ssafy.ontop.table.service.SpectatorEventPolicy;

/**
 * DICE_LEDGER_SPECTATOR_PING payload. category(점수 칸) 또는 dieId(0~4 주사위) 중 하나만 값이 있다.
 * 입력이나 기록이 아닌 훈수 표시다. 시각은 모두 Unix ms다.
 */
public record DiceLedgerSpectatorPing(String gameId, String eventId, String senderUserId, long basedOnVersion,
        String category, Integer dieId, long sentAt, long expiresAt, long serverNow) {

    public DiceLedgerSpectatorPing(String gameId, String eventId, String senderUserId, long basedOnVersion,
            String category, Integer dieId, SpectatorEventPolicy.Stamp stamp, long serverNow) {
        this(gameId, eventId, senderUserId, basedOnVersion, category, dieId, stamp.sentAt(), stamp.expiresAt(),
                serverNow);
    }
}
