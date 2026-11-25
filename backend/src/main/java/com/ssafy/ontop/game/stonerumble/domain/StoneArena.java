package com.ssafy.ontop.game.stonerumble.domain;

/** 경기 시작 인원으로 고정한다. 탈락·이탈 때문에 진행 중 발판이 재배치되지 않는다. */
final class StoneArena {
    private static final int[] SMALL = {5, 5, 4, 4, 4, 3, 3, 3, 4};
    private static final int[] MEDIUM = {6, 6, 5, 5, 5, 4, 4, 4, 4};
    private static final int[] LARGE = {8, 8, 8, 7, 7, 6, 6, 6, 4};

    private StoneArena() {
    }

    static int size(int players) {
        return players <= 2 ? 2 : players <= 4 ? 4 : 8;
    }

    static int radius(int size, int floor) {
        return (size == 2 ? SMALL : size == 4 ? MEDIUM : LARGE)[floor];
    }
}
