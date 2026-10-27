package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultView;
import java.time.Instant;
import java.util.List;

/** 공개 DTO의 @JsonIgnore userId를 별도 수신자 계약으로 보존한다. */
record GameResultOutboxPayload(int schemaVersion, String tableId, List<MemberResult> results) {
    GameResultOutboxPayload {
        if (schemaVersion != 1 || tableId == null || tableId.isBlank() || tableId.length() > 120) {
            throw new IllegalArgumentException("결과 알림 스냅샷을 확인하세요.");
        }
        results = List.copyOf(results);
        if (results.isEmpty() || results.size() > 4) {
            throw new IllegalArgumentException("결과 수신자를 확인하세요.");
        }
        var first = results.getFirst().view();
        if (results.stream().map(MemberResult::recipientUserId).distinct().count() != results.size()
                || results.size() != first.participants().size()
                || results.stream().map(MemberResult::view).anyMatch(view ->
                    !view.gameSessionId().equals(first.gameSessionId()) || view.version() != first.version()
                    || !view.gameCode().equals(first.gameCode()) || view.status() != first.status()
                    || !view.endReason().equals(first.endReason()) || view.settlementStatus() != first.settlementStatus()
                    || view.betAmountPerPlayer() != first.betAmountPerPlayer()
                    || !view.participants().equals(first.participants()) || !view.endedAt().equals(first.endedAt()))) {
            throw new IllegalArgumentException("경기 전체 결과 스냅샷이 일치하지 않습니다.");
        }
    }

    static GameResultOutboxPayload from(GameResultsReady event) {
        return new GameResultOutboxPayload(1, event.tableId(), event.results().stream().map(MemberResult::from).toList());
    }

    record MemberResult(long recipientUserId, long version, String gameSessionId, String gameCode,
            GameResultView.Status status, String endReason, GameResultView.SettlementStatus settlementStatus,
            long betAmountPerPlayer, List<GameResultView.Participant> participants, Long myCoinDelta, Instant endedAt) {
        static MemberResult from(GameResultView result) {
            return new MemberResult(result.userId(), result.version(), result.gameSessionId(), result.gameCode(),
                    result.status(), result.endReason(), result.settlementStatus(), result.betAmountPerPlayer(),
                    result.participants(), result.myCoinDelta(), result.endedAt());
        }

        GameResultView view() {
            return new GameResultView(recipientUserId, version, gameSessionId, gameCode, status, endReason,
                    settlementStatus, betAmountPerPlayer, participants, myCoinDelta, endedAt);
        }
    }
}
