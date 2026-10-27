package com.ssafy.ontop.game.start;

/** 영속 Gateway 경계에서만 사용한다. 데모와 엔진의 일반 문자열 ID 계약은 변경하지 않는다. */
public final class GameIdCodec {
    private GameIdCodec() {
    }

    public static String format(long id) {
        if (id <= 0) {
            throw new IllegalArgumentException("저장된 경기 ID가 필요합니다.");
        }
        return Long.toString(id);
    }

    public static long parse(String id) {
        if (id == null || !id.matches("[1-9][0-9]{0,18}")) {
            throw new IllegalArgumentException("경기 ID 형식을 확인하세요.");
        }
        try {
            return Long.parseLong(id);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("경기 ID 범위를 확인하세요.");
        }
    }
}
