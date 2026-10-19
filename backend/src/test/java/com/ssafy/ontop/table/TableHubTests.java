package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 마지막_좌석에_동시에_요청해도_한_명만_착석한다() throws Exception {
        Peer owner = peer();
        Peer first = peer();
        Peer second = peer();
        owner.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        owner.next();
        CountDownLatch start = new CountDownLatch(1);

        Thread firstRequest = Thread.startVirtualThread(() -> joinAfter(start, first));
        Thread secondRequest = Thread.startVirtualThread(() -> joinAfter(start, second));
        start.countDown();
        firstRequest.join(5000);
        secondRequest.join(5000);
        JsonNode firstResult = first.next();
        JsonNode secondResult = second.next();

        assertThat(List.of(firstResult.path("type").asText(), secondResult.path("type").asText()))
                .containsExactlyInAnyOrder("TABLE_STATE", "ERROR");
        JsonNode error = firstResult.path("type").asText().equals("ERROR") ? firstResult : secondResult;
        assertThat(error.path("payload").path("code").asText()).isEqualTo("TABLE_FULL");
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
        assertThat(hub.listTables().tables().getFirst().availableSeats()).isZero();
        assertThat(hub.listTables().tables().getFirst().joinable()).isFalse();
        JsonNode state = owner.next().path("payload");
        assertThat(state.path("version").asLong()).isEqualTo(2);
        assertThat(state.path("seats")).hasSize(2);
        assertThat(state.path("seats").get(0).path("userId").asText()).isNotEqualTo(
                state.path("seats").get(1).path("userId").asText());
    }

    @Test
    void 중복_종료는_버전을_한_번만_올리고_준비를_초기화한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.next();
        selectGame(first, second);
        second.send("READY_SET", Map.of("ready", true));
        first.next();
        second.next();

        hub.disconnect(first.id);
        hub.disconnect(first.id);
        JsonNode state = second.next().path("payload");
        second.send("TABLE_JOIN", Map.of("tableId", "table-1"));

        assertThat(state.path("version").asLong()).isEqualTo(5);
        assertThat(state.path("seats").get(0).path("userId").isNull()).isTrue();
        assertThat(state.path("seats").get(1).path("ready").asBoolean()).isFalse();
        assertThat(second.next().path("payload")).isEqualTo(state);
        assertThat(second.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 전송_실패를_감지하면_좌석을_정리하고_다른_참가자에게_알린다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.next();
        selectGame(first, second);
        first.fail.set(true);
        second.send("READY_SET", Map.of("ready", true));
        assertThat(second.next().path("payload").path("version").asLong()).isEqualTo(4);
        JsonNode cleaned = second.next().path("payload");

        assertThat(cleaned.path("version").asLong()).isEqualTo(5);
        assertThat(cleaned.path("seats").get(0).path("userId").isNull()).isTrue();
        assertThat(cleaned.path("seats").get(1).path("ready").asBoolean()).isFalse();
    }

    @Test
    void 느린_연결의_전송_중에도_다른_연결의_상태를_처리한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.next();
        selectGame(first, second);
        first.block.set(true);

        try {
            first.send("READY_SET", Map.of("ready", true));
            assertThat(first.blocked.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.next().path("type").asText()).isEqualTo("TABLE_STATE");
            second.send("TABLE_LEAVE", Map.of());
            assertThat(second.next().path("type").asText()).isEqualTo("TABLE_LEFT");
        } finally {
            first.release.countDown();
        }
        assertThat(first.next().path("payload").path("version").asLong()).isEqualTo(4);
        assertThat(first.next().path("payload").path("version").asLong()).isEqualTo(5);
    }

    @Test
    void 송신_대기열이_가득_차면_연결의_좌석을_정리한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.next();
        second.next();
        selectGame(first, second);
        first.block.set(true);

        try {
            first.send("READY_SET", Map.of("ready", true));
            assertThat(first.blocked.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.next().path("payload").path("version").asLong()).isEqualTo(4);
            for (int count = 0; count < 129; count++) {
                first.send("READY_SET", Map.of("ready", true));
            }
            JsonNode state = second.next().path("payload");

            assertThat(state.path("version").asLong()).isEqualTo(5);
            assertThat(state.path("seats").get(0).path("userId").isNull()).isTrue();
        } finally {
            first.release.countDown();
        }
    }

    private void selectGame(Peer first, Peer second) throws Exception {
        first.send("GAME_SELECT", Map.of("gameCode", "OMOK"));
        first.next();
        second.next();
    }

    private void joinAfter(CountDownLatch start, Peer peer) {
        try {
            start.await();
            peer.send("TABLE_JOIN", Map.of("tableId", "table-1"));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (peer.fail.get()) {
                throw new IOException("test send failure");
            }
            if (peer.block.get()) {
                peer.blocked.countDown();
                peer.release.await();
            }
            peer.messages.add(((TextMessage) invocation.getArgument(0)).getPayload());
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        hub.connect(session);
        assertThat(peer.next().path("type").asText()).isEqualTo("CONNECTED");
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final AtomicBoolean fail = new AtomicBoolean();
        private final AtomicBoolean block = new AtomicBoolean();
        private final CountDownLatch blocked = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        private void send(String type, Object payload) throws Exception {
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", UUID.randomUUID().toString(),
                    "type", type, "payload", payload)));
        }

        private JsonNode next() throws Exception {
            String text = messages.poll(5, TimeUnit.SECONDS);
            assertThat(text).isNotNull();
            return mapper.readTree(text);
        }
    }
}
