package com.ssafy.ontop.table;

import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.domain.TableRoom;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;

class GamePlayerLimitsTests {

    @ParameterizedTest
    @EnumSource(TableGame.class)
    void 게임별_정원까지만_앉고_현재_참가자가_모두_준비해야_한다(TableGame game) {
        TableRoom room = new TableRoom("table-1");
        room.join("first");
        room.selectGame(game);
        room.setReady("first", true);
        assertThat(room.snapshot().allReady()).isFalse();
        for (int count = 2; count <= game.maximumPlayers(); count++) {
            assertThat(room.join("user-" + count)).isTrue();
            assertThat(room.snapshot().allReady()).isFalse();
            room.setReady("first", true);
            for (int ready = 2; ready < count; ready++) {
                room.setReady("user-" + ready, true);
            }
            assertThat(room.snapshot().allReady()).isFalse();
            room.setReady("user-" + count, true);
            assertThat(room.snapshot().allReady()).isEqualTo(count >= game.minimumPlayers());
            assertThat(room.snapshot().capacity()).isEqualTo(game.maximumPlayers());
            assertThat(room.snapshot().seats()).hasSize(game.maximumPlayers());
        }
        assertThat(room.join("extra")).isFalse();
    }

    @Test
    void 상위_좌석만_남은_상태에서_2인게임으로_바꿔도_참가자를_보존한다() {
        TableRoom room = new TableRoom("table-1");
        room.join("first");
        room.selectGame(TableGame.ONE_CARD);
        room.join("second");
        room.join("third");
        room.join("fourth");
        room.leave("first");
        room.leave("second");
        room.setReady("third", true);
        room.setReady("fourth", true);
        room.selectGame(TableGame.OMOK);
        assertThat(room.snapshot().seats()).extracting(TableRoom.Seat::userId).containsExactly("third", "fourth");
        assertThat(room.snapshot().selectorUserId()).isEqualTo("third");
        assertThat(room.snapshot().allReady()).isFalse();
        assertThat(room.snapshot().seats()).allSatisfy(seat -> assertThat(seat.ready()).isFalse());
        room.setReady("third", true);
        room.setReady("fourth", true);
        assertThat(room.snapshot().allReady()).isTrue();
        room.selectGame(TableGame.LIAR_BRIDGE);
        assertThat(room.snapshot().capacity()).isEqualTo(4);
        assertThat(room.snapshot().allReady()).isFalse();
        assertThat(room.join("fifth")).isTrue();
    }

    @Test
    void 시작_거절로_끊긴_좌석을_정리한_뒤에도_인원과_권한을_유지한다() {
        TableRoom room = new TableRoom("table-1");
        room.join("first");
        room.selectGame(TableGame.ONE_CARD);
        room.join("second");
        room.join("third");
        room.join("fourth");
        room.returnToWaiting(Set.of("second", "fourth"));
        assertThat(room.snapshot().selectorUserId()).isEqualTo("second");
        room.setReady("second", true);
        room.setReady("fourth", true);
        assertThat(room.snapshot().allReady()).isTrue();
        room.leave("second");
        room.leave("fourth");
        assertThat(room.snapshot().gameCode()).isNull();
        assertThat(room.snapshot().capacity()).isEqualTo(4);
        assertThat(room.snapshot().allReady()).isFalse();
    }
}
