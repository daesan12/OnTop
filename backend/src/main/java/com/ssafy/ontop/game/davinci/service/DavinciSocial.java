package com.ssafy.ontop.game.davinci.service;

import com.fasterxml.jackson.databind.JsonNode;

/** 관전 추천은 이미 전달된 공개 타일의 식별자만 참조한다. */
public final class DavinciSocial {
    private DavinciSocial() { }

    public static boolean validTarget(JsonNode publicState, String userId, String tileId) {
        if (publicState == null || !"DAVINCI_CODE".equals(publicState.path("gameCode").asText())) { return false; }
        for (JsonNode player : publicState.path("players")) {
            if (player.path("userId").asText().equals(userId)) {
                for (JsonNode tile : player.path("tiles")) {
                    if (tile.path("id").asText().equals(tileId)) { return true; }
                }
            }
        }
        return false;
    }
}
