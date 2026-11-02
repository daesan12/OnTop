package com.ssafy.ontop.game.result;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

// GAME-03 결과 필드에 통신 버전을 붙인다. userId는 내부 수신자 확인용이며 JSON에 노출하지 않는다.
public record GameResultView(@JsonIgnore long userId, long version, String gameSessionId, String gameCode,
        Status status, String endReason, SettlementStatus settlementStatus, long betAmountPerPlayer,
        List<Participant> participants, Long myCoinDelta, Instant endedAt) {

    private static final long MAX_NUMBER = 9_007_199_254_740_991L;

    public GameResultView {
        if (userId <= 0 || version < 0 || version > MAX_NUMBER || gameSessionId == null
                || gameSessionId.isBlank() || gameSessionId.length() > 120 || !token(gameCode) || !token(endReason)
                || betAmountPerPlayer < 0 || betAmountPerPlayer > MAX_NUMBER) {
            throw new IllegalArgumentException("경기 결과 형식을 확인해주세요.");
        }
        Objects.requireNonNull(status);
        Objects.requireNonNull(settlementStatus);
        Objects.requireNonNull(endedAt);
        participants = List.copyOf(participants);
        var ids = new HashSet<String>();
        if (participants.size() < 2 || participants.size() > 4
                || participants.stream().anyMatch(participant -> !ids.add(participant.userId()))
                || !ids.contains(Long.toString(userId))
                || status == Status.FINISHED && participants.stream().anyMatch(p -> p.result() == null)
                || settlementStatus == SettlementStatus.PENDING && myCoinDelta != null
                || settlementStatus == SettlementStatus.SETTLED && myCoinDelta == null
                || myCoinDelta != null && (myCoinDelta < -MAX_NUMBER || myCoinDelta > MAX_NUMBER)
                || status == Status.INVALID && myCoinDelta != null && myCoinDelta != 0) {
            throw new IllegalArgumentException("본인 참가 결과와 정산 상태를 확인해주세요.");
        }
    }

    private static boolean token(String value) {
        return value != null && value.matches("[A-Z][A-Z0-9_]{0,31}");
    }

    public enum Status { FINISHED, INVALID }

    public enum SettlementStatus { PENDING, SETTLED }

    public record Participant(String userId, String result) {
        public Participant {
            if (userId == null || !userId.matches("[1-9][0-9]{0,18}") || result != null && !token(result)) {
                throw new IllegalArgumentException("참가 결과 형식을 확인해주세요.");
            }
        }
    }
}
