package com.ssafy.ontop.game.stonerumble.service;

import com.ssafy.ontop.game.start.GameReservationRequest;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.domain.TableRoom;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleLobbyTests {
    @Test
    void 돌탑_여덟좌석에서_정원을_줄일때_참가자를_잃거나_준비를_유지하지_않는다() {
        var room = new TableRoom("table");
        room.join("101");
        room.configure(TableGame.STONE_RUMBLE, null, 5, 8);
        for (int index = 2; index <= 8; index++) { room.join(Integer.toString(index * 101)); }
        for (int index = 1; index <= 8; index++) { room.setReady(Integer.toString(index * 101), true); }
        var full = room.snapshot();
        assertThat(full.allReady()).isTrue();
        assertThat(room.join("999")).isFalse();
        assertThatThrownBy(() -> room.configure(TableGame.ONE_CARD, null, 5, 4))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(room.snapshot()).isEqualTo(full);
        room.leave("202");
        assertThat(room.snapshot().seats()).allSatisfy(seat -> assertThat(seat.ready()).isFalse());
        for (int index = 5; index <= 8; index++) { room.leave(Integer.toString(index * 101)); }
        room.configure(TableGame.ONE_CARD, null, 5, 4);
        assertThat(room.snapshot().seats()).extracting(TableRoom.Seat::userId).containsExactly("101", "303", "404", null);
        assertThat(room.snapshot().capacity()).isEqualTo(4);
        assertThat(new TableRoom("empty").snapshot().capacity()).isEqualTo(4);
    }

    @Test
    void 여덟명_예약은_돌탑만_허용하고_좌석과_요청_중복을_거절한다() {
        List<GameStartCommand.Participant> players = IntStream.rangeClosed(1, 8)
                .mapToObj(index -> new GameStartCommand.Participant(Integer.toString(index * 101), index)).toList();
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "STONE_RUMBLE", players, null, 5);
        assertThat(GameReservationRequest.from(command).userIds()).hasSize(8);
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table", 1, "ONE_CARD", players))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table", 1, "DICE", List.of(
                new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 8))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameStartCommand.Participant("909", 9)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table", 1, "STONE_RUMBLE", List.of(
                new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 1))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
