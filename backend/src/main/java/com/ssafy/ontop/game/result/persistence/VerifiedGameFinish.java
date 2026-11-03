package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.Map;
import java.util.Set;

/** 서버 엔진 이벤트만 수신한다. JSON/공개 정산 요청 DTO가 아니다. */
final class VerifiedGameFinish {
    private static final Map<String, Set<String>> REASONS = Map.of(
            "OMOK", Set.of("FIVE_IN_ROW", "BOARD_FULL", "AGREED_DRAW", "TURN_TIMEOUT", "RECONNECT_EXPIRED", "LOGOUT", "MEMBER_DEACTIVATED", "EXPLICIT_LEAVE"),
            "DICE", Set.of("TARGET_REACHED", "RECONNECT_EXPIRED", "LOGOUT", "MEMBER_DEACTIVATED", "EXPLICIT_LEAVE"),
            "ONE_CARD", Set.of("EMPTY_HAND", "STALEMATE", "PLAYER_LEFT"),
            "LIAR_BRIDGE", Set.of("THREE_GOALS", "LAST_PLAYER_STANDING", "GOAL_SLOTS_EXHAUSTED",
                    "NO_RUNNABLE_PAWNS", "ABORTED_NO_PLAYERS"),
            "DICE_LEDGER", Set.of("ALL_CATEGORIES_FILLED", "LAST_PLAYER_STANDING"),
            "ALKKAGI", Set.of("PIECES_OUT", "MATCH_TIME_LIMIT", "AFK_FORFEIT", "EXPLICIT_LEAVE",
                    "DISCONNECT_TIMEOUT", "LOGOUT", "MEMBER_DEACTIVATED", "SIMULATION_INVALID", "SIMULATION_LIMIT"),
            // CARD_COUNT·NO_CARDS_TO_FLIP은 카드 수 공동 1위를 모두 승자로 둔다. 기권 종료도 LAST_PLAYER_STANDING이다.
            "HALLI_GALLI", Set.of("CARD_COUNT", "LAST_PLAYER_STANDING", "NO_CARDS_TO_FLIP"));

    private VerifiedGameFinish() { }

    static long validate(GameFinished event) {
        long id = GameIdCodec.parse(event.gameId());
        if (!event.gameId().concat(":finished").equals(event.eventId())
                || event.tableId() == null || event.tableId().isBlank() || event.tableId().length() > 120
                || event.version() < 0 || event.version() > 9_007_199_254_740_991L || event.endedAt() == null
                || event.gameCode() == null || event.endReason() == null
                || !REASONS.getOrDefault(event.gameCode(), Set.of()).contains(event.endReason())
                || event.participants().size() < 2 || event.participants().size() > 4
                || "ALKKAGI".equals(event.gameCode()) && event.participants().size() != 2
                || event.participants().stream().map(GameFinished.Participant::userId).distinct().count() != event.participants().size()) {
            throw new IllegalArgumentException("경기 종료 이벤트를 확인하세요.");
        }
        for (var player : event.participants()) {
            if (player.userId() <= 0 || player.result() == null
                    || (player.result() == GameFinished.Result.FORFEIT
                        ? player.leaveReason() == null || player.leftAt() == null || player.leftAt().isAfter(event.endedAt())
                        : player.leaveReason() != null || player.leftAt() != null)) {
                throw new IllegalArgumentException("경기 참가 판정을 확인하세요.");
            }
        }
        long winners = event.participants().stream().filter(p -> p.result() == GameFinished.Result.WIN).count();
        if (invalid(event)) {
            GameFinished.Result expected = "ALKKAGI".equals(event.gameCode())
                    ? GameFinished.Result.DRAW : GameFinished.Result.FORFEIT;
            if (event.participants().stream().anyMatch(p -> p.result() != expected)) {
                throw new IllegalArgumentException("무효 경기 판정을 확인하세요.");
            }
        } else if (Set.of("BOARD_FULL", "AGREED_DRAW").contains(event.endReason()) || "ALKKAGI".equals(event.gameCode()) && winners == 0
                && Set.of("PIECES_OUT", "MATCH_TIME_LIMIT").contains(event.endReason())) {
            if (event.participants().stream().anyMatch(p -> p.result() != GameFinished.Result.DRAW)) {
                throw new IllegalArgumentException("무승부 판정을 확인하세요.");
            }
        } else if (winners == 0 || "ALKKAGI".equals(event.gameCode()) && winners != 1
                || event.participants().stream().anyMatch(p -> p.result() == GameFinished.Result.DRAW)
                || Set.of("FIVE_IN_ROW", "TURN_TIMEOUT", "RECONNECT_EXPIRED", "LOGOUT", "MEMBER_DEACTIVATED",
                        "EXPLICIT_LEAVE", "TARGET_REACHED", "EMPTY_HAND", "PLAYER_LEFT", "LAST_PLAYER_STANDING")
                    .contains(event.endReason()) && winners != 1) {
            throw new IllegalArgumentException("승자 판정을 확인하세요.");
        }
        return id;
    }

    static boolean invalid(GameFinished event) {
        return "ABORTED_NO_PLAYERS".equals(event.endReason())
                || "ALKKAGI".equals(event.gameCode())
                    && Set.of("SIMULATION_INVALID", "SIMULATION_LIMIT").contains(event.endReason());
    }

    static Instant millis(Instant value) { return value.truncatedTo(ChronoUnit.MILLIS); }

    static byte[] hash(GameFinished event) {
        try {
            var bytes = new ByteArrayOutputStream();
            try (var out = new DataOutputStream(bytes)) {
                out.writeInt(1);
                out.writeUTF(event.eventId()); out.writeUTF(event.gameId()); out.writeUTF(event.tableId());
                out.writeUTF(event.gameCode()); out.writeLong(event.version()); out.writeUTF(event.endReason());
                out.writeLong(event.endedAt().toEpochMilli());
                out.writeInt(event.participants().size());
                for (var player : event.participants().stream().sorted(Comparator.comparingLong(GameFinished.Participant::userId)).toList()) {
                    out.writeLong(player.userId()); out.writeUTF(player.result().name());
                    out.writeBoolean(player.leaveReason() != null);
                    if (player.leaveReason() != null) { out.writeUTF(player.leaveReason().name()); out.writeLong(player.leftAt().toEpochMilli()); }
                }
            }
            return MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("종료 결과를 확인할 수 없습니다.", exception);
        }
    }
}
