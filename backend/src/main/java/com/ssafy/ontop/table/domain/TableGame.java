package com.ssafy.ontop.table.domain;

// OnTop v0.4의 네 게임을 local 선택 검증에 사용한다. 실제 게임 엔진 구현 목록과 다르다.
public enum TableGame {
    OMOK, DICE, ONE_CARD, LIAR_BRIDGE;

    public static TableGame find(String code) {
        for (TableGame game : values()) {
            if (game.name().equals(code)) {
                return game;
            }
        }
        return null;
    }
}
