package com.ssafy.ontop.world;

import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.world.service.ParkDebrisStore;
import java.time.Instant;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ParkDebrisStoreTests {
    private GameDefeatConfirmed event(String id, GameDefeatConfirmed.Kind kind, GameDepartureReason reason) {
        return new GameDefeatConfirmed(id, "game-" + id, "table", "OMOK", 1, 101, kind, 2,
                Instant.parse("2026-10-31T00:00:00Z"), reason);
    }

    @Test
    void 처음부터_2인인_경기의_명시적_기권에만_한번_생성한다() {
        var store = new ParkDebrisStore();

        assertThat(store.add("one", "table-1", event("loss", GameDefeatConfirmed.Kind.DEFEAT, null), 2, 0)).isFalse();
        assertThat(store.add("one", "table-1", forfeit("four"), 4, 0)).isFalse();
        var disconnect = event("disconnect", GameDefeatConfirmed.Kind.FORFEIT, GameDepartureReason.DISCONNECT_TIMEOUT);
        assertThat(store.add("one", "table-1", disconnect, 2, 0)).isFalse();
        assertThat(store.add("one", "table-1", forfeit("duel"), 2, 0)).isTrue();
        assertThat(store.add("one", "table-1", forfeit("duel"), 2, 0)).isFalse();
        assertThat(store.state("one").items()).hasSize(1);
        assertThat(store.state("one").items().getFirst().parts())
                .hasSize(18).contains("board", "coin-0", "coin-11", "stone-0", "stone-4");
        assertThat(store.state("one").version()).isEqualTo(1);
        assertThat(store.state("two").items()).isEmpty();
    }

    @Test
    void 새_라운드에도_누적하고_청소기는_개별_물체를_제거할_수_있다() {
        var store = new ParkDebrisStore();
        store.add("one", "table-1", forfeit("first"), 2, 1);
        var before = store.state("one");

        store.add("one", "table-1", forfeit("second"), 2, 1);

        assertThat(store.state("one").items()).hasSize(2);
        assertThat(store.clean("two", "first", "board")).isFalse();
        assertThat(store.clean("one", "first", "not-an-object")).isFalse();
        assertThat(store.clean("one", "first", "coin-0")).isTrue();
        assertThat(before.items().getFirst().parts()).contains("coin-0");
        assertThat(store.state("one").items().getFirst().parts()).doesNotContain("coin-0");
        for (String part : before.items().getFirst().parts()) {
            store.clean("one", "first", part);
        }
        assertThat(store.state("one").items()).hasSize(1);
        assertThat(store.state("one").items().getFirst().id()).isEqualTo("second");
    }

    @Test
    void 용량_초과시_기존_쓰레기를_몰래_지우지_않고_청소하면_새_공간을_쓴다() {
        var store = new ParkDebrisStore();
        for (int i = 0; i < ParkDebrisStore.MAX_BATCHES; i++) {
            assertThat(store.add("one", "table-1", forfeit("item-" + i), 2, 0)).isTrue();
        }

        assertThat(store.add("one", "table-1", forfeit("overflow"), 2, 0)).isFalse();
        var first = store.state("one").items().getFirst();
        for (String part : first.parts()) {
            store.clean("one", first.id(), part);
        }
        assertThat(store.add("one", "table-1", forfeit("new"), 2, 0)).isTrue();
    }

    @Test
    void 주사위장부의_기권도_같은_잔해_계약으로_저장한다() {
        var store = new ParkDebrisStore();
        var event = new GameDefeatConfirmed("ledger", "game", "table", "DICE_LEDGER", 1, 101,
                GameDefeatConfirmed.Kind.FORFEIT, 2, Instant.parse("2026-10-31T00:00:00Z"),
                GameDepartureReason.EXPLICIT_LEAVE);

        boolean added = store.add("one", "table-1", event, 2, 0);

        assertThat(added).isTrue();
        assertThat(store.state("one").items()).singleElement().satisfies(item -> {
            assertThat(item.gameCode()).isEqualTo("DICE_LEDGER");
            assertThat(item.parts()).hasSize(13);
        });
    }

    private GameDefeatConfirmed forfeit(String id) {
        return event(id, GameDefeatConfirmed.Kind.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE);
    }

    @Test
    void 바둑알을_청소해도_판과_엽전과_다른_바둑알은_남는다() {
        var store = new ParkDebrisStore();
        store.add("one", "table-1", forfeit("stones"), 2, 0);
        var before = store.state("one");

        boolean cleaned = store.clean("one", "stones", "stone-0");

        assertThat(cleaned).isTrue();
        assertThat(before.items().getFirst().parts()).contains("stone-0");
        assertThat(store.state("one").items().getFirst().parts())
                .hasSize(17).contains("board", "coin-0", "stone-1").doesNotContain("stone-0");
        assertThat(store.state("one").version()).isEqualTo(2);
    }
}
