package com.ssafy.ontop.history;

import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.exception.GameHistoryException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameHistoryRequestTests {
    @Test
    void 기본값과_최대_커서와_게임_필터를_해석한다() {
        assertThat(GameHistoryPageRequest.parse(null, null, null))
                .isEqualTo(new GameHistoryPageRequest(null, 20, null));
        assertThat(GameHistoryPageRequest.parse(Long.toString(Long.MAX_VALUE), "100", "LIAR_BRIDGE"))
                .isEqualTo(new GameHistoryPageRequest(Long.MAX_VALUE, 100, "LIAR_BRIDGE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0", "-1", " 1", "1.0", "1e2", "+1", "9223372036854775808", "bad"})
    void 잘못된_커서를_명시적으로_거절한다(String cursor) {
        assertThatThrownBy(() -> GameHistoryPageRequest.parse(cursor, null, null))
                .isInstanceOfSatisfying(GameHistoryException.class,
                        error -> assertThat(error.error()).isEqualTo(GameHistoryException.Error.CURSOR));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0", "-1", "101", "2147483648", "9223372036854775808", "1.5"})
    void 페이지_크기_범위와_정수_형식을_검사한다(String size) {
        assertThatThrownBy(() -> GameHistoryPageRequest.parse(null, size, null))
                .isInstanceOfSatisfying(GameHistoryException.class,
                        error -> assertThat(error.error()).isEqualTo(GameHistoryException.Error.SIZE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "omok", "FARKLE", "BRIDGE", "BUNGEOPPANG", "DICE' OR 1=1"})
    void 지원하지_않는_게임_코드를_거절한다(String gameCode) {
        assertThatThrownBy(() -> GameHistoryPageRequest.parse(null, null, gameCode))
                .isInstanceOfSatisfying(GameHistoryException.class,
                        error -> assertThat(error.error()).isEqualTo(GameHistoryException.Error.GAME));
    }
}
