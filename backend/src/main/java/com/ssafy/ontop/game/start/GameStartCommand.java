package com.ssafy.ontop.game.start;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record GameStartCommand(UUID startAttemptId, String tableId, long tableVersion, String gameCode,
        List<Participant> participants) {

    public GameStartCommand {
        Objects.requireNonNull(startAttemptId);
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
