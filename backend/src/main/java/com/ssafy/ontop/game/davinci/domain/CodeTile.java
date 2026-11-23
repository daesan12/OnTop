package com.ssafy.ontop.game.davinci.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 식별자는 색·숫자·섞기 전 순서를 드러내지 않는다. 조커는 -1이다. */
public record CodeTile(String id, Color color, int value) {
    public enum Color { BLACK, WHITE }

    public CodeTile {
        if (id == null || id.isBlank() || color == null || value < -1 || value > 11) {
            throw new IllegalArgumentException("숫자 타일을 확인해주세요.");
        }
    }

    public static List<CodeTile> standard() {
        List<CodeTile> tiles = new ArrayList<>();
        for (Color color : Color.values()) {
            for (int value = -1; value <= 11; value++) {
                tiles.add(new CodeTile(UUID.randomUUID().toString(), color, value));
            }
        }
        return tiles;
    }

    public int compareNumber(CodeTile other) {
        int number = Integer.compare(value, other.value);
        return number != 0 ? number : color.compareTo(other.color);
    }
}
