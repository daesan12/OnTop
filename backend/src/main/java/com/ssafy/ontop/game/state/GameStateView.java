package com.ssafy.ontop.game.state;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Objects;

public record GameStateView(@JsonIgnore long userId, String gameId, long version, Role role,
        JsonNode publicState, JsonNode privateState) {

    public GameStateView {
        Objects.requireNonNull(role);
        if (userId <= 0 || gameId == null || gameId.isBlank() || gameId.length() > 120 || version < 0
                || publicState == null || !publicState.isObject()
                || privateState == null || !privateState.isObject()
                || (role == Role.SPECTATOR && !privateState.isEmpty())) {
            throw new IllegalArgumentException("경기 공개·개인 상태를 확인해주세요.");
        }
        publicState = publicState.deepCopy();
        privateState = privateState.deepCopy();
    }

    @Override
    public JsonNode publicState() {
        return publicState.deepCopy();
    }

    @Override
    public JsonNode privateState() {
        return privateState.deepCopy();
    }

    public enum Role {
        PLAYER, SPECTATOR
    }
}
