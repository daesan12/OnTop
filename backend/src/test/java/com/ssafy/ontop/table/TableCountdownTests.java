package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableCountdownTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Gateway gateway = new Gateway();
    private final TableHub hub = new TableHub(mapper, Optional.of(gateway), true, 150);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 정원만_차면_대기하고_전원_준비_후_카운트다운을_거쳐_한_번_시작한다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        assertThat(gateway.calls.get()).isZero();
        assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");

        synchronized (hub) {
            first.request("READY_SET", Map.of("ready", true));
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");
            second.request("READY_SET", Map.of("ready", true));
            JsonNode countdown = first.phase("COUNTDOWN").path("payload");
            assertThat(Instant.parse(countdown.path("countdownEndsAt").asText())).isNotNull();
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("COUNTDOWN");
            assertThat(hub.listTables().tables().getFirst().joinable()).isFalse();
            first.request("READY_SET", Map.of("ready", true));
            first.request("GAME_START_CHECK", Map.of());
            assertThat(gateway.calls.get()).isZero();
            assertThat(gateway.lookups.get()).isZero();
        }
        first.phase("CONFIRMED");
        second.phase("CONFIRMED");
        assertThat(gateway.calls.get()).isEqualTo(1);
    }

    @Test
    void 준비_취소는_타이머를_취소하고_재준비하면_새_시도를_한_번만_시작한다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        String previous;
        synchronized (hub) {
            prepare(first, second);
            previous = first.phase("COUNTDOWN").path("payload").path("startAttemptId").asText();
            first.request("READY_SET", Map.of("ready", false));
            assertThat(first.phase("WAITING").path("payload").path("code").asText())
                    .isEqualTo("COUNTDOWN_CANCELLED");
        }
        assertThat(gateway.called.await(350, TimeUnit.MILLISECONDS)).isFalse();
        assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");
        first.request("READY_SET", Map.of("ready", true));
        assertThat(first.phase("COUNTDOWN").path("payload").path("startAttemptId").asText())
                .isNotEqualTo(previous);
        first.phase("CONFIRMED");
        assertThat(gateway.calls.get()).isEqualTo(1);
    }

    @Test
    void 퇴장과_연결_종료는_카운트다운과_준비를_취소하고_호출하지_않는다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        synchronized (hub) {
            prepare(first, second);
            first.phase("COUNTDOWN");
            second.phase("COUNTDOWN");
            first.request("TABLE_LEAVE", Map.of());
            second.phase("WAITING");
            assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            prepare(first, second);
            first.phase("COUNTDOWN");
            second.phase("COUNTDOWN");
            hub.disconnect(first.id);
            second.phase("WAITING");
        }
        assertThat(gateway.called.await(350, TimeUnit.MILLISECONDS)).isFalse();
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
    }

    private void prepare(Peer first, Peer second) throws Exception {
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
    }

    private Peer seated() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            peer.messages.add(((TextMessage) invocation.getArgument(0)).getPayload());
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        hub.connect(session);
        peer.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of(
                    "requestId", requestId, "type", type, "payload", payload)));
            return await(message -> message.path("requestId").asText().equals(requestId));
        }

        private JsonNode phase(String phase) throws Exception {
            return await(message -> message.path("payload").path("phase").asText().equals(phase));
        }

        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                String text = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(text).as("기대한 카운트다운 메시지").isNotNull();
                JsonNode message = mapper.readTree(text);
                if (predicate.test(message)) {
                    return message;
                }
            }
        }
    }

    private static class Gateway implements GameStartGateway {

        private final AtomicInteger calls = new AtomicInteger();
        private final AtomicInteger lookups = new AtomicInteger();
        private final CountDownLatch called = new CountDownLatch(1);

        @Override
        public GameStartResult startGame(GameStartCommand command) {
            calls.incrementAndGet();
            called.countDown();
            return GameStartResult.succeeded(command, "demo-game-countdown");
        }

        @Override
        public GameStartResult findStartResult(UUID id) {
            lookups.incrementAndGet();
            return GameStartResult.pending(id);
        }
    }
}
