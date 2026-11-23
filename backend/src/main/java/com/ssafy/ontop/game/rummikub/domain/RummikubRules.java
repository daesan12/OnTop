package com.ssafy.ontop.game.rummikub.domain;

import java.util.HashSet;
import java.util.List;

public final class RummikubRules {
    private RummikubRules() { }

    public record Placed(String id, String color, int number) { }

    public static boolean validMeld(List<Placed> meld) {
        if (meld == null || meld.size() < 3 || meld.size() > 13
                || meld.stream().anyMatch(tile -> tile == null || !RummikubTile.COLORS.contains(tile.color())
                    || tile.number() < 1 || tile.number() > 13)
                || new HashSet<>(meld.stream().map(Placed::id).toList()).size() != meld.size()) {
            return false;
        }
        boolean group = meld.size() <= 4 && meld.stream().map(Placed::number).distinct().count() == 1
                && meld.stream().map(Placed::color).distinct().count() == meld.size();
        boolean run = meld.stream().map(Placed::color).distinct().count() == 1;
        for (int index = 1; index < meld.size(); index++) {
            run &= meld.get(index).number() == meld.get(index - 1).number() + 1;
        }
        return group || run;
    }
}
