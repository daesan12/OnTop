package com.ssafy.ontop.table.dto;

import com.ssafy.ontop.table.service.SpectatorEventPolicy;

/** OMOK_SPECTATOR_PING payload. x=열, y=행(0~14) 판 좌표이며 착수가 아니다. 시각은 모두 Unix ms다. */
public record OmokSpectatorPing(String gameId, String eventId, String senderUserId, long basedOnVersion, int x, int y,
        long sentAt, long expiresAt, long serverNow) {

    public OmokSpectatorPing(String gameId, String eventId, String senderUserId, long basedOnVersion, int x, int y,
            SpectatorEventPolicy.Stamp stamp, long serverNow) {
        this(gameId, eventId, senderUserId, basedOnVersion, x, y, stamp.sentAt(), stamp.expiresAt(), serverNow);
    }
}
