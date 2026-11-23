package com.ssafy.ontop.game.rummikub.domain;

import java.util.ArrayList;
import java.util.List;

public record RummikubTile(String id, String color, int number) {
    public static final List<String> COLORS = List.of("BLACK", "BLUE", "RED", "YELLOW");

    public boolean joker() {
        return color == null;
    }

    public int penalty() {
        return joker() ? 30 : number;
    }

    public static List<RummikubTile> deck() {
        List<RummikubTile> tiles = new ArrayList<>();
        for (String color : COLORS) {
            for (int number = 1; number <= 13; number++) {
                for (int copy = 0; copy < 2; copy++) {
                    tiles.add(new RummikubTile(color + "-" + number + "-" + copy, color, number));
                }
            }
        }
        tiles.add(new RummikubTile("JOKER-0", null, 0));
        tiles.add(new RummikubTile("JOKER-1", null, 0));
        return tiles;
    }
}
