package com.ssafy.ontop.table.domain;

// OnTop v0.4의 네 게임과 주사위 장부·할리갈리를 local 선택 검증에 사용한다. 실제 게임 엔진 구현 목록과 다르다.
public enum TableGame {
    OMOK(2, 2), DICE(2, 4), ONE_CARD(2, 4), LIAR_BRIDGE(2, 4), DICE_LEDGER(2, 4), ALKKAGI(2, 2), HALLI_GALLI(2, 4), STONE_RUMBLE(2, 8), DAVINCI_CODE(2, 4);

    private final int minimumPlayers;
    private final int maximumPlayers;

    TableGame(int minimumPlayers, int maximumPlayers) {
        this.minimumPlayers = minimumPlayers;
        this.maximumPlayers = maximumPlayers;
    }

    public int minimumPlayers() {
        return minimumPlayers;
    }

    public int maximumPlayers() {
        return maximumPlayers;
    }

    public static TableGame find(String code) {
        for (TableGame game : values()) {
            if (game.name().equals(code)) {
                return game;
            }
        }
        return null;
    }
}
