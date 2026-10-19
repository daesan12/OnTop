package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameSelectionTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE"})
    void 선택한_게임이_상대와_목록에_동기화되고_반복_선택은_준비를_유지한다(String game) throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        JsonNode selected = first.request("GAME_SELECT", Map.of("gameCode", game));
        JsonNode notice = second.next();

        assertThat(notice.path("payload")).isEqualTo(selected.path("payload"));
        assertThat(notice.path("requestId").isNull()).isTrue();
        assertThat(notice.path("payload").path("gameCode").asText()).isEqualTo(game);
        assertThat(hub.listTables().tables().getFirst().gameCode()).isEqualTo(game);
        first.request("READY_SET", Map.of("ready", true));
        second.next();
        JsonNode ready = second.request("READY_SET", Map.of("ready", true));
        first.next();
        JsonNode repeated = first.request("GAME_SELECT", Map.of("gameCode", game));
        assertThat(repeated.path("payload")).isEqualTo(ready.path("payload"));
        assertThat(second.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();

        String next = game.equals("OMOK") ? "DICE" : "OMOK";
        JsonNode changed = first.request("GAME_SELECT", Map.of("gameCode", next)).path("payload");
        second.next();
        assertThat(changed.path("allReady").asBoolean()).isFalse();
        assertThat(changed.path("version").asLong()).isEqualTo(ready.path("payload").path("version").asLong() + 1);
        assertThat(changed.path("seats")).allSatisfy(seat -> assertThat(seat.path("ready").asBoolean()).isFalse());
    }

    @Test
    void 미착석과_선택_전_준비와_타인의_선택을_막고_상태를_보존한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        assertCode(first.request("GAME_SELECT", Map.of("gameCode", "OMOK")), "NOT_SEATED");
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        assertCode(first.request("READY_SET", Map.of("ready", true)), "GAME_NOT_SELECTED");
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        JsonNode before = first.next().path("payload");
        assertCode(second.request("GAME_SELECT", Map.of("gameCode", "DICE")), "NOT_GAME_SELECTOR");
        assertCode(first.request("GAME_SELECT", Map.of("gameCode", "CHESS")), "UNSUPPORTED_GAME");
        assertThat(first.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload")).isEqualTo(before);
        assertThat(hub.listTables().tables().get(1).gameCode()).isNull();
    }

    @Test
    void 선택자_퇴장과_연결종료시_착석순으로_권한을_넘기고_빈테이블은_선택을_지운다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer newcomer = peer();
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        first.request("GAME_SELECT", Map.of("gameCode", "DICE"));
        second.next();
        first.request("TABLE_LEAVE", Map.of());
        JsonNode left = second.next().path("payload");
        assertThat(left.path("selectorUserId").asText()).isEqualTo(second.userId);
        assertThat(left.path("gameCode").asText()).isEqualTo("DICE");
        newcomer.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.next();
        assertCode(newcomer.request("GAME_SELECT", Map.of("gameCode", "OMOK")), "NOT_GAME_SELECTOR");
        second.request("GAME_SELECT", Map.of("gameCode", "ONE_CARD"));
        newcomer.next();
        hub.disconnect(second.id);
        JsonNode disconnected = newcomer.next().path("payload");
        assertThat(disconnected.path("selectorUserId").asText()).isEqualTo(newcomer.userId);
        newcomer.request("GAME_SELECT", Map.of("gameCode", "LIAR_BRIDGE"));
        newcomer.request("TABLE_LEAVE", Map.of());
        JsonNode fresh = first.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        assertThat(fresh.path("selectorUserId").asText()).isEqualTo(first.userId);
        assertThat(fresh.path("gameCode").isNull()).isTrue();
        assertThat(hub.listTables().tables().getFirst().gameCode()).isNull();
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.path("payload").path("code").asText()).isEqualTo(code);
    }

    @Test
    void 세명_착석중_2인게임_선택은_거절하고_선택과_준비와_버전을_보존한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer third = peer();
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.request("GAME_SELECT", Map.of("gameCode", "ONE_CARD"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        third.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        JsonNode before = first.request("READY_SET", Map.of("ready", true)).path("payload");
        assertCode(first.request("GAME_SELECT", Map.of("gameCode", "OMOK")), "GAME_PLAYER_LIMIT");
        assertCode(first.request("GAME_SELECT", Map.of("gameCode", "DICE")), "GAME_PLAYER_LIMIT");
        JsonNode after = first.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        assertThat(after).isEqualTo(before);
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(3);
        assertThat(hub.listTables().tables().getFirst().availableSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().capacity()).isEqualTo(4);
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            peer.messages.add(((TextMessage) invocation.getArgument(0)).getPayload());
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        hub.connect(session);
        peer.userId = peer.next().path("payload").path("userId").asText();
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private String userId;

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            JsonNode message;
            do {
                message = next();
            } while (!message.path("requestId").asText().equals(requestId));
            return message;
        }

        private JsonNode next() throws Exception {
            String text = messages.poll(5, TimeUnit.SECONDS);
            assertThat(text).isNotNull();
            return mapper.readTree(text);
        }
    }
}
