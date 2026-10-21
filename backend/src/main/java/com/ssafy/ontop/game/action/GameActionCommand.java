package com.ssafy.ontop.game.action;

import com.fasterxml.jackson.databind.JsonNode;

public record GameActionCommand(long userId, String gameId, String actionId, long expectedVersion, JsonNode input) {

    public GameActionCommand {
        if (userId <= 0 || gameId == null || gameId.isBlank() || gameId.length() > 120
                || actionId == null || actionId.isBlank() || actionId.length() > 64
                || expectedVersion < 0 || expectedVersion > 9_007_199_254_740_991L
                || input == null || !input.isObject()) {
            throw new IllegalArgumentException("경기 입력 형식을 확인해주세요.");
        }
        input = input.deepCopy();
    }

    @Override
    public JsonNode input() {
        return input.deepCopy();
    }
}
