package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class SpectatorEventProtocolTests {

    private static final String EVENT = "2d895dfa-3ffb-4bd8-92ca-5c9e3bf8921b";
    private final TableProtocol protocol = new TableProtocol(new ObjectMapper());

    @ParameterizedTest
    @ValueSource(strings = {"0,0", "14,14", "0,14", "7,7"})
    void 핑은_0부터14까지_정수_교차점을_받는다(String point) {
        String[] xy = point.split(",");
        var request = protocol.parse(ping("8", xy[0], xy[1]));
        assertThat(request.type()).isEqualTo("OMOK_SPECTATOR_PING_SEND");
        assertThat(request.payload().path("x").intValue()).isEqualTo(Integer.parseInt(xy[0]));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1,0", "15,0", "0,15", "7.0,7", "7,7.5", "1e1,7", "\"7\",7", "null,7",
            "true,7", "2147483648,7"})
    void 핑_좌표는_범위밖_실수_문자열을_거절한다(String point) {
        String[] xy = point.split(",");
        assertThat(code(ping("8", xy[0], xy[1]))).isEqualTo("INVALID_PAYLOAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "8.0", "\"8\"", "null", "9007199254740992"})
    void 핑_기준버전은_0이상_안전정수만_받는다(String version) {
        assertThat(code(ping(version, "7", "7"))).isEqualTo("INVALID_PAYLOAD");
        assertThat(protocol.parse(ping("9007199254740991", "7", "7")).type()).isEqualTo("OMOK_SPECTATOR_PING_SEND");
        assertThat(protocol.parse(ping("0", "7", "7")).type()).isEqualTo("OMOK_SPECTATOR_PING_SEND");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"gameId\":\"41\",\"eventId\":\"" + EVENT + "\",\"basedOnVersion\":8,\"x\":7}",
            "{\"gameId\":\"41\",\"eventId\":\"" + EVENT + "\",\"basedOnVersion\":8,\"x\":7,\"y\":7,\"userId\":\"505\"}",
            "{\"gameId\":\"41\",\"eventId\":\"" + EVENT + "\",\"basedOnVersion\":8,\"x\":7,\"y\":7,\"role\":\"PLAYER\"}",
            "{\"gameId\":\" \",\"eventId\":\"" + EVENT + "\",\"basedOnVersion\":8,\"x\":7,\"y\":7}",
            "{\"gameId\":41,\"eventId\":\"" + EVENT + "\",\"basedOnVersion\":8,\"x\":7,\"y\":7}",
            "{\"gameId\":\"41\",\"eventId\":\"2D895DFA-3FFB-4BD8-92CA-5C9E3BF8921B\",\"basedOnVersion\":8,\"x\":7,\"y\":7}",
            "{\"gameId\":\"41\",\"eventId\":\"{" + EVENT + "}\",\"basedOnVersion\":8,\"x\":7,\"y\":7}",
            "{\"gameId\":\"41\",\"eventId\":\"not-uuid\",\"basedOnVersion\":8,\"x\":7,\"y\":7}"})
    void 핑은_누락_추가_신원위조_ID형식을_거절한다(String payload) {
        assertThat(code(request("OMOK_SPECTATOR_PING_SEND", payload))).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 채팅은_기존_ChatText_검증과_정확한_필드를_사용한다() {
        assertThat(protocol.parse(chat("\"가운데 쪽을 막아봐요!\"")).type()).isEqualTo("GAME_SPECTATOR_CHAT_SEND");
        assertThat(protocol.parse(chat("\"" + "가".repeat(200) + "\"")).type()).isEqualTo("GAME_SPECTATOR_CHAT_SEND");
        for (String text : new String[] {"\"" + "가".repeat(201) + "\"", "\"   \"", "\"\"", "\"a\\nb\"",
                "\"a\\u2028b\"", "\"\\ud800\"", "1", "null"}) {
            assertThat(code(chat(text))).as(text).isEqualTo("INVALID_PAYLOAD");
        }
        assertThat(code(request("GAME_SPECTATOR_CHAT_SEND",
                "{\"gameId\":\"41\",\"eventId\":\"" + EVENT + "\",\"text\":\"hi\",\"senderUserId\":\"101\"}")))
                .isEqualTo("INVALID_PAYLOAD");
        assertThat(code(request("GAME_SPECTATOR_CHAT_SEND", "{\"gameId\":\"" + "g".repeat(121)
                + "\",\"eventId\":\"" + EVENT + "\",\"text\":\"hi\"}"))).isEqualTo("INVALID_PAYLOAD");
    }

    @Test
    void 요청ID가_없으면_공통_형식오류다() {
        assertThat(code("{\"type\":\"GAME_SPECTATOR_CHAT_SEND\",\"payload\":{\"gameId\":\"41\",\"eventId\":\""
                + EVENT + "\",\"text\":\"hi\"}}")).isEqualTo("INVALID_MESSAGE");
    }

    private String ping(String version, String x, String y) {
        return request("OMOK_SPECTATOR_PING_SEND", "{\"gameId\":\"41\",\"eventId\":\"" + EVENT
                + "\",\"basedOnVersion\":" + version + ",\"x\":" + x + ",\"y\":" + y + "}");
    }

    private String chat(String text) {
        return request("GAME_SPECTATOR_CHAT_SEND", "{\"gameId\":\"41\",\"eventId\":\"" + EVENT + "\",\"text\":"
                + text + "}");
    }

    private String request(String type, String payload) {
        return "{\"requestId\":\"spectator-1\",\"type\":\"" + type + "\",\"payload\":" + payload + "}";
    }

    private String code(String text) {
        return catchThrowableOfType(RequestException.class, () -> protocol.parse(text)).code();
    }
}
