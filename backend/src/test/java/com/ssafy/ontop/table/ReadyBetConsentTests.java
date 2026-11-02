package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 원문 요청으로 검증하며 ReadyConsent 테스트 클라이언트의 자동 필드 보완을 사용하지 않는다. */
class ReadyBetConsentTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false);

    @AfterEach void shutdown() { hub.shutdown(); }

    @Test void 필수값_누락과_잘못된형식은_준비와버전을_변경하지않는다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode selected = select(first, second, 100);
        JsonNode ready = first.request("READY_SET", consent(selected)).path("payload");
        for (Map<String, ?> invalid : List.<Map<String, ?>>of(
                Map.of("ready", true), Map.of("ready", true, "betAmountPerPlayer", 100),
                Map.of("ready", true, "expectedVersion", ready.path("version").asLong()),
                Map.of("ready", true, "betAmountPerPlayer", "100", "expectedVersion", 3),
                Map.of("ready", true, "betAmountPerPlayer", 100, "expectedVersion", -1),
                Map.of("ready", true, "betAmountPerPlayer", 100, "expectedVersion", 1.5))) {
            error(first.request("READY_SET", invalid), "INVALID_PAYLOAD");
            assertThat(first.state()).isEqualTo(ready);
        }
    }

    @Test void 다른금액과_미래버전은_거절하고_기존준비는_보존한다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode selected = select(first, second, 100);
        JsonNode ready = first.request("READY_SET", consent(selected)).path("payload");
        error(first.request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 500,
                "expectedVersion", ready.path("version").asLong())), "GAME_BET_CHANGED");
        error(first.request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 100,
                "expectedVersion", ready.path("version").asLong() + 1)), "GAME_SETTINGS_CHANGED");
        assertThat(first.state()).isEqualTo(ready);
    }

    @Test void 변경전_늦은요청은_새참가비_동의로_처리하지않는다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode old = select(first, second, 100);
        JsonNode changed = first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 500)).path("payload");
        error(second.request("READY_SET", consent(old)), "GAME_BET_CHANGED");
        assertThat(first.state()).isEqualTo(changed);
        JsonNode accepted = second.request("READY_SET", consent(changed));
        assertThat(accepted.path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(accepted.path("payload").path("seats").get(1).path("ready").asBoolean()).isTrue();
    }

    @Test void 금액이_원래대로_돌아와도_과거동의와_버전위조를_거절한다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode old = select(first, second, 100);
        first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 500));
        JsonNode current = first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 100)).path("payload");
        error(second.request("READY_SET", consent(old)), "GAME_SETTINGS_CHANGED");
        assertThat(first.state()).isEqualTo(current);
        assertThat(second.request("READY_SET", consent(current)).path("type").asText()).isEqualTo("TABLE_STATE");
    }

    @Test void 게임변경과_참가자변경도_과거준비동의를_무효화한다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode old = select(first, second, 100);
        JsonNode changed = first.request("GAME_SELECT", Map.of("gameCode", "ONE_CARD", "betAmountPerPlayer", 100)).path("payload");
        error(second.request("READY_SET", consent(old)), "GAME_SETTINGS_CHANGED");
        Peer third = peer(); third.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        error(second.request("READY_SET", consent(changed)), "GAME_SETTINGS_CHANGED");
        assertThat(first.state().path("seats")).allSatisfy(seat -> assertThat(seat.path("ready").asBoolean()).isFalse());
    }

    @Test void 같은설정을_확인한_두사용자의_순차준비와_기존취소계약을_허용한다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode selected = select(first, second, 100);
        first.request("READY_SET", consent(selected));
        JsonNode both = second.request("READY_SET", consent(selected)).path("payload");
        assertThat(both.path("allReady").asBoolean()).isTrue();
        JsonNode cancelled = first.request("READY_SET", Map.of("ready", false)).path("payload");
        assertThat(cancelled.path("allReady").asBoolean()).isFalse();
        assertThat(cancelled.path("seats").get(0).path("ready").asBoolean()).isFalse();
    }

    @Test void 영냥도_모든참가자가_같은금액을_확인해야_준비된다() throws Exception {
        Peer first = peer(); Peer second = peer();
        JsonNode selected = select(first, second, 0);

        error(second.request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 1,
                "expectedVersion", selected.path("version").asLong())), "GAME_BET_CHANGED");
        first.request("READY_SET", consent(selected));
        JsonNode both = second.request("READY_SET", consent(selected)).path("payload");

        assertThat(both.path("betAmountPerPlayer").asLong()).isZero();
        assertThat(both.path("allReady").asBoolean()).isTrue();
    }

    @Test void 참가비변경과_늦은준비_경합에서_새금액에_과거동의가_남지않는다() throws Exception {
        Peer first = peer(); Peer second = peer(); select(first, second, 100);
        try (var executor = Executors.newFixedThreadPool(2)) {
            for (int round = 0; round < 30; round++) {
                JsonNode old = first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 100)).path("payload");
                CountDownLatch start = new CountDownLatch(1);
                var fee = executor.submit(() -> { start.await(); return first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 500)); });
                var ready = executor.submit(() -> { start.await(); return second.request("READY_SET", consent(old)); });
                start.countDown();
                assertThat(fee.get(5, TimeUnit.SECONDS).path("type").asText()).isEqualTo("TABLE_STATE");
                JsonNode reply = ready.get(5, TimeUnit.SECONDS);
                assertThat(reply.path("type").asText()).isIn("TABLE_STATE", "ERROR");
                if (reply.path("type").asText().equals("ERROR")) { error(reply, "GAME_BET_CHANGED"); }
                JsonNode finalState = first.state();
                assertThat(finalState.path("betAmountPerPlayer").asLong()).isEqualTo(500);
                assertThat(finalState.path("seats")).allSatisfy(seat -> assertThat(seat.path("ready").asBoolean()).isFalse());
            }
        }
    }

    private Map<String, Object> consent(JsonNode state) {
        return Map.of("ready", true, "betAmountPerPlayer", state.path("betAmountPerPlayer").asLong(),
                "expectedVersion", state.path("version").asLong());
    }

    private JsonNode select(Peer first, Peer second, long amount) throws Exception {
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        return first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", amount)).path("payload");
    }

    private void error(JsonNode response, String code) {
        assertThat(response.path("type").asText()).isEqualTo("ERROR");
        assertThat(response.path("payload").path("code").asText()).isEqualTo(code);
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer(); WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> { peer.messages.add(((TextMessage) invocation.getArgument(0)).getPayload()); return null; })
                .when(session).sendMessage(any(TextMessage.class));
        hub.connect(session); assertThat(peer.next().path("type").asText()).isEqualTo("CONNECTED");
        return peer;
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("type", type, "requestId", requestId, "payload", payload)));
            JsonNode response;
            do { response = next(); } while (!response.path("requestId").asText().equals(requestId));
            return response;
        }
        private JsonNode state() throws Exception { return request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload"); }
        private JsonNode next() throws Exception {
            String text = messages.poll(5, TimeUnit.SECONDS); assertThat(text).isNotNull(); return mapper.readTree(text);
        }
    }
}
