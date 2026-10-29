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
    @ValueSource(strings = {"{}", "{\"targetId\":null}", "{\"targetId\":202}",
            "{\"targetId\":\" \"}", "{\"targetId\":\"202\",\"userId\":\"101\"}",
            "{\"targetId\":\"202\",\"x\":1}"})
    void 따라가기_대상과_신원위조_필드를_검사한다(String payload) {
        var error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"follow\",\"type\":\"WORLD_FOLLOW_START\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"followId\":null}", "{\"followId\":1}",
            "{\"followId\":\"not-uuid\"}",
            "{\"followId\":\"11111111-1111-4111-8111-111111111111\",\"targetId\":\"202\"}"})
    void 따라가기_종료에는_정확한_관계_ID만_허용한다(String payload) {
        var error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"follow\",\"type\":\"WORLD_FOLLOW_STOP\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameId\":\"g\"}", "{\"gameId\":\"g\",\"actionId\":null}",
            "{\"gameId\":1,\"actionId\":\"a\"}", "{\"gameId\":\"g\",\"actionId\":\" \"}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"userId\":202}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"reason\":\"LOGOUT\"}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"cancel\":true}"})
    void 수동기권_누락_형식_사용자위조와추가필드는거절한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"forfeit-1\",\"type\":\"GAME_FORFEIT\",\"payload\":" + payload + "}"));
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 수동기권_식별자길이경계를검사한다() throws Exception {
        var mapper = new ObjectMapper();
        String valid = mapper.writeValueAsString(Map.of("requestId", "f", "type", "GAME_FORFEIT",
                "payload", Map.of("gameId", "g".repeat(120), "actionId", "a".repeat(64))));
        assertThat(protocol.parse(valid).type()).isEqualTo("GAME_FORFEIT");
        for (String text : new String[] {valid.replace("g".repeat(120), "g".repeat(121)),
                valid.replace("a".repeat(64), "a".repeat(65))}) {
            assertThat(catchThrowableOfType(RequestException.class, () -> protocol.parse(text)).code())
                    .isEqualTo("INVALID_PAYLOAD");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"emoteCode\":null}", "{\"emoteCode\":1}", "{\"emoteCode\":\"wave\"}",
            "{\"emoteCode\":\" \"}", "{\"emoteCode\":\"WAVE\",\"userId\":\"forged\"}",
            "{\"emoteCode\":\"WAVE\",\"channelId\":\"other\"}",
            "{\"emoteCode\":\"WAVE\",\"eventId\":\"forged\"}"})
    void 감정표현_입력과_신원_채널_식별자_위조를_거절한다(String payload) {
        RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"emote-1\",\"type\":\"WORLD_EMOTE_SEND\",\"payload\":" + payload + "}"));
        assertThat(error).isNotNull();
        assertThat(error.code()).isEqualTo("INVALID_PAYLOAD");
    }

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
    void 이동_입력순번은_uint32최대까지_허용한다() {
        assertThat(protocol.parse("{\"requestId\":\"move-1\",\"type\":\"WORLD_MOVE\","
                + "\"payload\":{\"seq\":4294967295,\"dx\":1,\"dz\":0,\"run\":false}}")
                .payload().path("seq").longValue()).isEqualTo(4_294_967_295L);
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
