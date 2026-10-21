package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MoveInputTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"seq\":0,\"dx\":0,\"dz\":0,\"run\":false}",
                "{\"seq\":4294967296,\"dx\":0,\"dz\":0,\"run\":false}",
                "{\"seq\":1,\"dx\":2,\"dz\":0,\"run\":false}",
                "{\"seq\":1,\"dx\":null,\"dz\":0,\"run\":false}",
                "{\"seq\":1,\"dx\":0,\"dz\":0,\"run\":\"false\"}",
                "{\"seq\":1,\"dx\":0,\"dz\":0,\"run\":false,\"x\":999}",
                "{\"seq\":1,\"dx\":0,\"dz\":0,\"run\":false,\"jump\":null}"
            })
    void 조작좌표와_범위밖순번과_잘못된입력타입은_거절한다(String json) throws Exception {
        var node = mapper.readTree(json);
        assertThatThrownBy(() -> MoveInput.parse(node))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 대각선은_가속되지않고_작은아날로그입력은_보존한다() {
        var diagonal = new MoveInput(1, 1, 1, false, false);
        assertThat(Math.hypot(diagonal.dx(), diagonal.dz()))
                .isCloseTo(1, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(new MoveInput(1, .2, 0, false, false).dx()).isEqualTo(.2);
    }
}
