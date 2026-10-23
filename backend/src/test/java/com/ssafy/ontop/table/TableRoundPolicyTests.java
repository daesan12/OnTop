package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.domain.TableStartAttempt;
import com.ssafy.ontop.table.dto.TableProtocol;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.*;

class TableRoundPolicyTests {
    @Test void 같은주사위도목표변경은전원준비를풀고동일선택은버전을유지한다() {
        var room = new TableRoom("table");
        room.join("101"); room.join("202"); room.selectGame(TableGame.DICE, 2000);
        room.setReady("101", true); room.setReady("202", true);
        assertThat(room.selectGame(TableGame.DICE, 6000)).isTrue();
        assertThat(room.snapshot().allReady()).isFalse();
        assertThat(room.snapshot().targetScore()).isEqualTo(6000);
        long version = room.snapshot().version();
        assertThat(room.selectGame(TableGame.DICE, 6000)).isFalse();
        assertThat(room.snapshot().version()).isEqualTo(version);
        room.selectGame(TableGame.OMOK, null);
        assertThat(room.snapshot().targetScore()).isNull();
    }

    @ParameterizedTest @ValueSource(strings={"0", "2001", "4000.0", "null", "\"4000\""})
    void 허용하지않은목표형식은거절한다(String target) {
        var protocol = new TableProtocol(new ObjectMapper());
        assertThatThrownBy(() -> protocol.parse("{\"requestId\":\"a\",\"type\":\"GAME_SELECT\","
                + "\"payload\":{\"gameCode\":\"DICE\",\"targetScore\":" + target + "}}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    @Test void 다른게임에는주사위옵션을붙일수없다() throws Exception {
        var mapper = new ObjectMapper();
        assertThatThrownBy(() -> new TableProtocol(mapper).parse(mapper.writeValueAsString(Map.of("requestId", "a",
                "type", "GAME_SELECT", "payload", Map.of("gameCode", "OMOK", "targetScore", 4000)))))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    @Test void 조기종료와정산은확정경기ID대조후에만대기로돌린다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK",
                List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)));
        var attempt = new TableStartAttempt(command);
        attempt.rememberEnd("old"); attempt.markSettled("old");
        attempt.apply(GameStartResult.reserved(command, "current")); attempt.playing();
        assertThat(attempt.endedEarly()).isFalse();
        assertThat(attempt.returnAfterSettlement()).isFalse();
        attempt.rememberEnd("current"); attempt.markSettled("current");
        assertThat(attempt.endedEarly()).isTrue();
        assertThat(attempt.phase()).isEqualTo("PLAYING");
        assertThat(attempt.endRound()).isTrue();
        assertThat(attempt.returnAfterSettlement()).isTrue();
        assertThat(attempt.phase()).isEqualTo("WAITING");
        assertThat(attempt.endRound()).isFalse();
    }
}
