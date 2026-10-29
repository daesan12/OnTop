package com.ssafy.ontop.table.dto;

import com.ssafy.ontop.table.service.SpectatorEventPolicy;

/** GAME_SPECTATOR_CHAT_MESSAGE payload. 시각은 모두 Unix ms이며 senderUserId는 서버 연결의 사용자다. */
public record GameSpectatorChatMessage(String gameId, String eventId, String senderUserId, String text,
        long sentAt, long expiresAt, long serverNow) {

    public GameSpectatorChatMessage(String gameId, String eventId, String senderUserId, String text,
            SpectatorEventPolicy.Stamp stamp, long serverNow) {
        this(gameId, eventId, senderUserId, text, stamp.sentAt(), stamp.expiresAt(), serverNow);
    }
}
