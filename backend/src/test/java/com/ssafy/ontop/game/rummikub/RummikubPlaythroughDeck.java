package com.ssafy.ontop.game.rummikub;

import com.ssafy.ontop.game.rummikub.domain.RummikubTile;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** 로컬 실플레이 검수용. 106개 실물 타일의 순서만 고정한다. */
public final class RummikubPlaythroughDeck implements Consumer<List<RummikubTile>> {
    private int calls;
    @Override
    public void accept(List<RummikubTile> deck) {
        List<String> ids = ++calls % 2 == 1 ? List.of("RED-13-1", "BLACK-1-1") : List.of(
                "RED-10-0", "BLUE-10-0", "JOKER-0", "RED-7-0", "RED-9-0", "YELLOW-8-0", "BLACK-10-0",
                "YELLOW-4-0", "YELLOW-6-0", "BLUE-11-0", "BLUE-12-0", "BLUE-13-0", "RED-6-0", "RED-5-0",
                "RED-8-0", "BLUE-8-0", "BLACK-8-0", "YELLOW-11-0", "YELLOW-12-0", "YELLOW-13-0",
                "BLACK-1-0", "BLACK-2-0", "BLACK-3-0", "BLACK-4-0", "BLACK-5-0", "BLACK-6-0", "BLACK-7-0", "BLACK-9-0");
        List<RummikubTile> ordered = new ArrayList<>();
        for (String id : ids) {
            ordered.add(deck.stream().filter(tile -> tile.id().equals(id)).findFirst().orElseThrow());
        }
        // 추첨 때의 재배열이 배분 후 더미 순서에 섞이지 않도록 매번 같은 원본에서 구성한다.
        RummikubTile.deck().stream().filter(tile -> !ids.contains(tile.id())).forEach(ordered::add);
        deck.clear();
        deck.addAll(ordered);
    }
}
