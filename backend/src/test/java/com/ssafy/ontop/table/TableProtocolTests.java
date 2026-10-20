package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class TableProtocolTests {

    private final TableProtocol protocol = new TableProtocol(new ObjectMapper());

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"tableId\":null}", "{\"tableId\":1}", "{\"tableId\":\" \"}",
            "{\"tableId\":\"table-1\",\"userId\":\"forged\"}",
            "{\"tableId\":\"table-1\",\"channelId\":\"other\"}"})
    void 테이블_보기의_누락_타입과_추가_필드를_거절한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"watch-1\",\"type\":\"TABLE_WATCH\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 테이블_보기_종료는_빈_객체만_허용한다() {
        assertThat(protocol.parse("{\"requestId\":\"stop-1\",\"type\":\"TABLE_UNWATCH\",\"payload\":{}}")
                .type()).isEqualTo("TABLE_UNWATCH");
        assertThat(catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"stop-1\",\"type\":\"TABLE_UNWATCH\",\"payload\":{\"tableId\":\"table-1\"}}"))
                .code()).isEqualTo("INVALID_PAYLOAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"text\":null}", "{\"text\":1}", "{\"text\":\"  \"}",
            "{\"text\":\"a\\nb\"}", "{\"text\":\"hello\",\"userId\":\"forged\"}",
            "{\"text\":\"hello\",\"channelId\":\"other\"}",
            "{\"text\":\"a\\u2028b\"}", "{\"text\":\"a\\u2029b\"}"})
    void 채팅의_형식과_신원_수신채널_위조를_거절한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"chat-1\",\"type\":\"WORLD_CHAT_SEND\",\"payload\":" + payload + "}"));
        assertThat(error).isNotNull();
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "{\"sequence\":0,\"x\":1,\"y\":0,\"z\":0}",
            "{\"sequence\":-1,\"x\":1,\"y\":0,\"z\":0,\"yaw\":0}",
            "{\"sequence\":0.5,\"x\":1,\"y\":0,\"z\":0,\"yaw\":0}",
            "{\"sequence\":9007199254740992,\"x\":1,\"y\":0,\"z\":0,\"yaw\":0}",
            "{\"sequence\":0,\"x\":1e400,\"y\":0,\"z\":0,\"yaw\":0}",
            "{\"sequence\":0,\"x\":\"1\",\"y\":0,\"z\":0,\"yaw\":0}",
            "{\"sequence\":0,\"x\":1,\"y\":0,\"z\":0,\"yaw\":null}",
            "{\"sequence\":0,\"x\":1,\"y\":0,\"z\":0,\"yaw\":0,\"userId\":\"forged\"}"
    })
    void 이동_필드와_좌표_타입과_순번과_신원위조를_검사한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"move-1\",\"type\":\"WORLD_MOVE\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 이동_순번은_브라우저의_최대_안전_정수까지_허용한다() {
        assertThat(protocol.parse("{\"requestId\":\"move-1\",\"type\":\"WORLD_MOVE\","
                + "\"payload\":{\"sequence\":9007199254740991,\"x\":1.25,\"y\":0,\"z\":-2,\"yaw\":0}}")
                .payload().path("sequence").longValue()).isEqualTo(9_007_199_254_740_991L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameCode\":null}", "{\"gameCode\":1}", "{\"gameCode\":\" \"}",
            "{\"gameCode\":\"OMOK\",\"userId\":\"forged\"}"})
    void 게임선택의_누락_타입_권한위조_필드를_거절한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"select-1\",\"type\":\"GAME_SELECT\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 오류의_요청_ID는_유효할_때만_반환한다() {
        RequestException readable = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"request-1\",\"type\":\"TABLE_LEAVE\",\"payload\":{},\"extra\":1}"));
        RequestException invalid = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\" \",\"type\":\"TABLE_LEAVE\",\"payload\":{}}"));

        assertThat(readable.requestId()).isEqualTo("request-1");
        assertThat(readable.code()).isEqualTo("INVALID_MESSAGE");
        assertThat(invalid.requestId()).isNull();
    }

    @Test
    void 요청_ID는_64자까지_허용한다() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        String valid = mapper.writeValueAsString(Map.of("requestId", "a".repeat(64),
                "type", "TABLE_LEAVE", "payload", Map.of()));
        String invalid = valid.replace("a".repeat(64), "a".repeat(65));

        assertThat(protocol.parse(valid).requestId()).hasSize(64);
        assertThat(catchThrowableOfType(RequestException.class, () -> protocol.parse(invalid)).requestId()).isNull();
    }

    @Test
    void 빈_입력과_중복_JSON_키는_거절한다() {
        for (String text : new String[] {"", "{\"requestId\":\"a\",\"requestId\":\"b\"}"}) {
            RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(text));

            assertThat(error.code()).isEqualTo("INVALID_JSON");
            assertThat(error.requestId()).isNull();
        }
    }
}
