package com.ssafy.ontop.game.start;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record GameStartCommand(UUID startAttemptId, String tableId, long tableVersion, String gameCode,
        List<Participant> participants, Integer targetScore) {

    public GameStartCommand(UUID attempt, String table, long version, String code, List<Participant> players) {
        this(attempt, table, version, code, players, null);
    }

    public GameStartCommand {
        Objects.requireNonNull(startAttemptId);
        if (targetScore != null && (!"DICE".equals(gameCode)
                || !java.util.Set.of(2000, 4000, 6000).contains(targetScore))) {
            throw new IllegalArgumentException("주사위 목표를 확인해주세요.");
        }
        participants = List.copyOf(participants);
        if (tableId == null || tableId.isBlank() || tableVersion < 0 || gameCode == null || gameCode.isBlank()
                || participants.size() < 2 || participants.size() > 4
                || participants.stream().map(Participant::userId).distinct().count() != participants.size()
                || participants.stream().map(Participant::seatNumber).distinct().count() != participants.size()) {
            throw new IllegalArgumentException("게임 시작 요청을 확인해주세요.");
        }
    }

    public record Participant(String userId, int seatNumber) {

        public Participant {
            if (userId == null || userId.isBlank() || seatNumber < 1 || seatNumber > 4) {
                throw new IllegalArgumentException("참가자와 좌석을 확인해주세요.");
            }
        }
    }
}
