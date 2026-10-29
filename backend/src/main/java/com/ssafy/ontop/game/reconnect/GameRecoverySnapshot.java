package com.ssafy.ontop.game.reconnect;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Objects;

// state에는 공개 상태와 이 userId 본인의 비공개 상태만 넣는다.
public record GameRecoverySnapshot(long userId, String gameId, int participantCount, long version,
        Phase phase, JsonNode state) {

    public GameRecoverySnapshot {
        if (userId <= 0 || gameId == null || gameId.isBlank() || participantCount < 2 || participantCount > 4
                || version < 0 || state == null || !state.isObject()) {
            throw new IllegalArgumentException("경기 복구 상태를 확인해주세요.");
        }
        Objects.requireNonNull(phase);
        state = state.deepCopy();
    }

    @Override
    public JsonNode state() {
        return state.deepCopy();
    }

    public enum Phase {
        PLAYING, FINISHED, ELIMINATED
    }
}
