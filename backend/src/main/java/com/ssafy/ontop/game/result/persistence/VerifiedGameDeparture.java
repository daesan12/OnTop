package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class VerifiedGameDeparture {
    private VerifiedGameDeparture() { }

    static byte[] hash(GameParticipantLeft event) {
        long id = GameIdCodec.parse(event.gameId());
        if (event.userId() <= 0 || event.version() < 0 || event.version() > 9_007_199_254_740_991L
                || event.leaveReason() == null || event.leftAt() == null
                || event.tableId() == null || event.tableId().isBlank() || event.tableId().length() > 120
                || event.gameCode() == null || !event.gameCode().matches("[A-Z_]{1,20}")
                || !(id + ":left:" + event.userId()).equals(event.eventId())) {
            throw new IllegalArgumentException("경기 이탈 이벤트를 확인하세요.");
        }
        try {
            var bytes = new ByteArrayOutputStream();
            try (var output = new DataOutputStream(bytes)) {
                output.writeInt(1);
                output.writeUTF(event.eventId());
                output.writeUTF(event.gameId());
                output.writeUTF(event.tableId());
                output.writeUTF(event.gameCode());
                output.writeLong(event.version());
                output.writeLong(event.userId());
                output.writeUTF(event.leaveReason().name());
                output.writeLong(event.leftAt().toEpochMilli());
            }
            return MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("이탈 수신 정보를 확인할 수 없습니다.", exception);
        }
    }
}
