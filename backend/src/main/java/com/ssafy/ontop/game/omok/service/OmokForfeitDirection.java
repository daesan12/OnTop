package com.ssafy.ontop.game.omok.service;

/** 현재 맵의 고정 좌석 순서(남·북·서·동)로, 아바타의 시선과 무관한 투척 방향을 정한다. */
public final class OmokForfeitDirection {
    private static final double[] X = {0, 0, -1, 1};
    private static final double[] Z = {1, -1, 0, 0};

    private OmokForfeitDirection() {
    }

    public static double towardOpponent(int fromSeat, int toSeat) {
        if (fromSeat < 1 || fromSeat > 4 || toSeat < 1 || toSeat > 4 || fromSeat == toSeat) {
            throw new IllegalArgumentException("기권자와 상대 좌석을 확인해주세요.");
        }
        return Math.atan2(X[toSeat - 1] - X[fromSeat - 1], Z[toSeat - 1] - Z[fromSeat - 1]);
    }
}
