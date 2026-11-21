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
        if (participants.size() < 2 || participants.size() > ("STONE_RUMBLE".equals(gameCode) ? 8 : "BANG".equals(gameCode) ? 7 : 4)
                || participants.stream().anyMatch(participant -> !ids.add(participant.userId()))
                || !ids.contains(Long.toString(userId))
                || status == Status.FINISHED && participants.stream().anyMatch(p -> p.result() == null)
                || settlementStatus == SettlementStatus.PENDING && myCoinDelta != null
                || settlementStatus == SettlementStatus.SETTLED && myCoinDelta == null
                || myCoinDelta != null && (myCoinDelta < -MAX_NUMBER || myCoinDelta > MAX_NUMBER)
                || status == Status.INVALID && myCoinDelta != null && myCoinDelta != 0) {
            throw new IllegalArgumentException("본인 참가 결과와 정산 상태를 확인해주세요.");
        }
        if (participants.stream().anyMatch(p -> p.rank() != null)) {
            if (!"STONE_RUMBLE".equals(gameCode) || status != Status.FINISHED) {
                throw new IllegalArgumentException("순위 결과의 게임을 확인해주세요.");
            }
            var rewards = com.ssafy.ontop.game.stonerumble.domain.StoneRumbleRewards.fromRanks(
                    participants.stream().map(Participant::rank).toList());
            boolean capped = settlementStatus == SettlementStatus.SETTLED && betAmountPerPlayer == 0;
            for (int index = 0; index < rewards.size(); index++) {
                var participant = participants.get(index);
                if (capped ? participant.rewardCoins() > rewards.get(index)
                        || Long.toString(userId).equals(participant.userId()) && !participant.rewardCoins().equals(myCoinDelta)
                        : !rewards.get(index).equals(participant.rewardCoins())) {
                    throw new IllegalArgumentException("공동 순위 보상이 일치하지 않습니다.");
                }
            }
        }
    }

    private static boolean token(String value) {
        return value != null && value.matches("[A-Z][A-Z0-9_]{0,31}");
    }

    public enum Status { FINISHED, INVALID }

    public enum SettlementStatus { PENDING, SETTLED }

    public record Participant(String userId, String result,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Integer rank,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Long rewardCoins) {
        public Participant(String userId, String result) { this(userId, result, null, null); }
        public Participant {
            if (userId == null || !userId.matches("[1-9][0-9]{0,18}") || result != null && !token(result)
                    || (rank == null) != (rewardCoins == null) || rank != null && (rank < 1 || rank > 8
                        || rewardCoins < 0 || rewardCoins > 80)) {
                throw new IllegalArgumentException("참가 결과 형식을 확인해주세요.");
            }
        }
    }
}
