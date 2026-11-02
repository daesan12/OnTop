package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.domain.GameAmounts;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.dto.TableProtocol;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class TableBetPolicyTests {
    @Test void 금액변경은_준비를초기화하고_동일설정과선택권승계는_금액을유지한다() {
        var room = new TableRoom("table");
        room.join("101"); room.join("202"); room.selectGame(TableGame.OMOK, null, 5);
        room.setReady("101", true); room.setReady("202", true);
        long version = room.snapshot().version();
        assertThat(room.selectGame(TableGame.OMOK, null, 5)).isFalse();
        assertThat(room.snapshot().allReady()).isTrue();
        assertThat(room.selectGame(TableGame.OMOK, null, 7)).isTrue();
        assertThat(room.snapshot().version()).isEqualTo(version + 1);
        assertThat(room.snapshot().seats()).allSatisfy(seat -> assertThat(seat.ready()).isFalse());
        room.leave("101");
        assertThat(room.snapshot().selectorUserId()).isEqualTo("202");
        assertThat(room.snapshot().betAmountPerPlayer()).isEqualTo(7);
        room.leave("202");
        assertThat(room.snapshot().betAmountPerPlayer()).isNull();
    }

    @ParameterizedTest @ValueSource(strings = {"-1", "1.5", "\"5\"", "null", "9223372036854775808"})
    void 공개선택은_잘못된금액형식을_거절한다(String amount) {
        assertThatThrownBy(() -> new TableProtocol(new ObjectMapper()).parse(
                "{\"requestId\":\"a\",\"type\":\"GAME_SELECT\",\"payload\":{\"gameCode\":\"OMOK\",\"betAmountPerPlayer\":" + amount + "}}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    @Test void 공개선택의_금액누락은_기본1코인으로_대체하지_않는다() {
        assertThatThrownBy(() -> new TableProtocol(new ObjectMapper()).parse(
                "{\"requestId\":\"a\",\"type\":\"GAME_SELECT\",\"payload\":{\"gameCode\":\"OMOK\"}}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    @Test void 네명게임의_최대인원_금액을_설정전에_검사한다() {
        var room = new TableRoom("table"); room.join("101");
        long max = GameAmounts.MAX_SAFE_INTEGER / 4;
        room.selectGame(TableGame.ONE_CARD, null, max);
        long version = room.snapshot().version();
        assertThatThrownBy(() -> room.selectGame(TableGame.ONE_CARD, null, max + 1)).isInstanceOf(IllegalArgumentException.class);
        assertThat(room.snapshot().betAmountPerPlayer()).isEqualTo(max);
        assertThat(room.snapshot().version()).isEqualTo(version);
    }
}
