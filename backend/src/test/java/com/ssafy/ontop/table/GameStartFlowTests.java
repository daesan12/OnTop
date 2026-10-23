package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.GameStartResult.Outcome;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameStartFlowTests {

    @ParameterizedTest
    @CsvSource({"ONE_CARD,2", "ONE_CARD,3", "ONE_CARD,4", "LIAR_BRIDGE,2", "LIAR_BRIDGE,3", "LIAR_BRIDGE,4"})
    void 다인게임은_현재_참가자_전원_준비시_빈좌석을_제외하고_한번_시작한다(String game, int count)
            throws Exception {
        Peer first = seated();
        first.request("GAME_SELECT", game.equals("DICE") ? Map.of("gameCode", game, "targetScore", 4000) : Map.of("gameCode", game));
        List<Peer> players = new java.util.ArrayList<>();
        players.add(first);
        for (int index = 1; index < count; index++) {
            players.add(seated());
        }
        for (int index = 0; index < count - 1; index++) {
            players.get(index).request("READY_SET", Map.of("ready", true));
        }
        assertThat(gateway.starts.get()).isZero();
        assertThat(hub.listTables().tables().getFirst().allReady()).isFalse();
        players.getLast().request("READY_SET", Map.of("ready", true));
        for (Peer player : players) {
            assertThat(player.phase("CONFIRMED").path("payload").path("gameCode").asText()).isEqualTo(game);
        }
        assertThat(gateway.command.gameCode()).isEqualTo(game);
        assertThat(gateway.command.participants()).extracting(GameStartCommand.Participant::userId)
                .containsExactlyElementsOf(players.stream().map(player -> player.userId).toList());
        assertThat(gateway.starts.get()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(count);
        assertThat(hub.listTables().tables().getFirst().availableSeats()).isEqualTo(4 - count);
        assertThat(hub.listTables().tables().getFirst().joinable()).isFalse();
    }

    private final ObjectMapper mapper = new ObjectMapper();
    private final Gateway gateway = new Gateway();
    private final TableHub hub = new TableHub(mapper, Optional.of(gateway), true);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 전원_준비하면_한_번_요청하고_검증_성공을_알린다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
        JsonNode firstResult = first.phase("CONFIRMED");
        JsonNode secondResult = second.phase("CONFIRMED");

        assertThat(firstResult.path("payload")).isEqualTo(secondResult.path("payload"));
        assertThat(firstResult.path("requestId").isNull()).isTrue();
        assertThat(firstResult.path("payload").path("simulation").asBoolean()).isTrue();
        assertThat(firstResult.path("payload").path("gameSessionId").asText()).isEqualTo("demo-game-test");
        assertThat(gateway.starts.get()).isEqualTo(1);
        assertThat(gateway.command.participants()).extracting(GameStartCommand.Participant::userId)
                .containsExactly(first.userId, second.userId);
        assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("REHEARSAL_CONFIRMED");
        assertThat(hub.listTables().tables().getFirst().joinable()).isFalse();
        assertThat(first.request("TABLE_LEAVE", Map.of()).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
        assertThat(first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000)).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
    }

    @Test
    void 확정_거절이면_전원_준비를_풀고_다음_시도에는_새_ID를_사용한다() throws Exception {
        gateway.start = command -> gateway.starts.get() == 1
                ? GameStartResult.rejected(command.startAttemptId(), "PRIVATE_BALANCE_REASON")
                : GameStartResult.reserved(command, "demo-game-next");
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        JsonNode rejected = first.await(message -> message.path("payload").path("code").asText()
                .equals("START_REJECTED"));
        UUID oldId = gateway.command.startAttemptId();
        JsonNode state = first.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");

        assertThat(rejected.toString()).doesNotContain("PRIVATE_BALANCE_REASON");
        assertThat(state.path("seats").get(0).path("ready").asBoolean()).isFalse();
        assertThat(state.path("seats").get(1).path("ready").asBoolean()).isFalse();
        first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000));
        JsonNode changed = first.phase("WAITING").path("payload");
        assertThat(changed.path("gameCode").asText()).isEqualTo("DICE");
        assertThat(changed.path("startAttemptId").isNull()).isTrue();
        prepare(first, second);
        first.phase("CONFIRMED");
        assertThat(gateway.command.startAttemptId()).isNotEqualTo(oldId);
        assertThat(gateway.command.gameCode()).isEqualTo("DICE");
        assertThat(gateway.starts.get()).isEqualTo(2);
    }

    @Test
    void 대기_중에는_새로_시작하지_않고_같은_ID의_결과만_조회한다() throws Exception {
        gateway.start = command -> GameStartResult.pending(command.startAttemptId());
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        first.phase("STARTING");
        UUID attemptId = gateway.commandId();

        assertThat(first.request("READY_SET", Map.of("ready", true)).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
        assertThat(first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000)).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
        assertThat(gateway.command.gameCode()).isEqualTo("OMOK");
        first.request("GAME_START_CHECK", Map.of());
        first.phase("CONFIRMED");

        assertThat(gateway.starts.get()).isEqualTo(1);
        assertThat(gateway.lookups.get()).isEqualTo(1);
        assertThat(gateway.lookedUp).isEqualTo(attemptId);
    }

    @Test
    void 호출_예외를_실패로_단정하지_않고_조회로_복구한다() throws Exception {
        gateway.start = command -> { throw new IllegalStateException("응답을 받지 못함"); };
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        first.await(message -> message.path("payload").path("code").asText().equals("START_RESULT_UNKNOWN"));

        first.request("GAME_START_CHECK", Map.of());
        first.phase("CONFIRMED");

        assertThat(gateway.starts.get()).isEqualTo(1);
    }

    @Test
    void 충돌과_잘못된_결과는_대기로_돌리지_않는다() throws Exception {
        gateway.start = command -> GameStartResult.conflict(command.startAttemptId());
        gateway.lookup = id -> new GameStartResult(UUID.randomUUID(), Outcome.RESERVED, "wrong-game",
                gateway.command.participants(), 1, 2, null);
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        first.await(message -> message.path("payload").path("code").asText().equals("START_CONFLICT"));
        first.request("GAME_START_CHECK", Map.of());
        JsonNode invalid = first.await(message -> message.path("payload").path("code").asText()
                .equals("START_RESULT_INVALID"));

        assertThat(invalid.path("payload").path("phase").asText()).isEqualTo("STARTING");
        assertThat(first.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("ERROR");
        assertThat(gateway.starts.get()).isEqualTo(1);
    }

    @Test
    void 호출_확정_전에_연결이_끊기면_시작_요청을_보내지_않는다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        synchronized (hub) {
            prepare(first, second);
            hub.disconnect(first.id);
        }
        JsonNode reset = second.await(message -> message.path("payload").path("code").asText()
                .equals("START_REJECTED"));

        assertThat(reset.path("payload").path("phase").asText()).isEqualTo("WAITING");
        assertThat(gateway.starts.get()).isZero();
        JsonNode state = second.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        assertThat(state.path("seats").get(0).path("userId").isNull()).isTrue();
    }

    @Test
    void 호출_후_연결_종료는_좌석을_유지하고_성공_결과를_기다린다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        gateway.start = command -> {
            entered.countDown();
            awaitLatch(release);
            return GameStartResult.reserved(command, "demo-game-held");
        };
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.disconnect(first.id);
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("STARTING");
            assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
            assertThat(hub.listTables().tables().getFirst().availableSeats()).isZero();
            assertThat(hub.listTables().tables().getFirst().readyCount()).isEqualTo(2);
            assertThat(hub.listTables().tables().getFirst().joinable()).isFalse();
            JsonNode held = second.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
            assertThat(held.path("seats").get(0).path("userId").asText()).isEqualTo(first.userId);

            Peer other = peer();
            assertThat(other.request("TABLE_JOIN", Map.of("tableId", "table-2")).path("type").asText())
                    .isEqualTo("TABLE_STATE");
        } finally {
            release.countDown();
        }
        assertThat(second.phase("CONFIRMED").path("payload").path("gameSessionId").asText())
                .isEqualTo("demo-game-held");
    }

    @Test
    void 호출_후_연결_종료라도_확정_거절이면_좌석을_정리한다() throws Exception {
        gateway.start = command -> GameStartResult.pending(command.startAttemptId());
        gateway.lookup = id -> GameStartResult.rejected(id, "INSUFFICIENT_BALANCE");
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        gateway.commandId();
        hub.disconnect(first.id);

        second.request("GAME_START_CHECK", Map.of());
        second.await(message -> message.path("payload").path("code").asText().equals("START_REJECTED"));
        JsonNode state = second.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");

        assertThat(state.path("seats").get(0).path("userId").isNull()).isTrue();
        assertThat(state.path("seats").get(1).path("ready").asBoolean()).isFalse();
        assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().availableSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        assertThat(hub.listTables().tables().getFirst().joinable()).isTrue();
    }

    private void prepare(Peer first, Peer second) throws Exception {
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
    }

    @Test
    void 시작_거절후_테이블이_비면_새_참가자에게_이전_게임을_알리지_않는다() throws Exception {
        gateway.start = command -> GameStartResult.rejected(command.startAttemptId(), "TEST_REJECTED");
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        first.await(message -> message.path("payload").path("code").asText().equals("START_REJECTED"));
        first.request("TABLE_LEAVE", Map.of());
        second.request("TABLE_LEAVE", Map.of());
        Peer newcomer = peer();
        JsonNode state = newcomer.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        JsonNode start = newcomer.phase("WAITING").path("payload");
        assertThat(state.path("gameCode").isNull()).isTrue();
        assertThat(start.path("gameCode").isNull()).isTrue();
        assertThat(start.path("startAttemptId").isNull()).isTrue();
        assertThat(start.path("code").isNull()).isTrue();
    }

    @Test
    void 두_준비_요청이_겹쳐도_시작은_한_번만_요청한다() throws Exception {
        Peer first = seated();
        Peer second = seated();
        CountDownLatch start = new CountDownLatch(1);

        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var firstReady = workers.submit(() -> {
                start.await();
                return first.request("READY_SET", Map.of("ready", true));
            });
            var secondReady = workers.submit(() -> {
                start.await();
                return second.request("READY_SET", Map.of("ready", true));
            });
            start.countDown();
            assertThat(firstReady.get(5, TimeUnit.SECONDS).path("type").asText()).isEqualTo("TABLE_STATE");
            assertThat(secondReady.get(5, TimeUnit.SECONDS).path("type").asText()).isEqualTo("TABLE_STATE");
        }
        first.phase("CONFIRMED");
        assertThat(gateway.starts.get()).isEqualTo(1);
    }

    @Test
    void 결과_조회가_겹쳐도_동시에_하나만_실행한다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        gateway.start = command -> GameStartResult.pending(command.startAttemptId());
        gateway.lookup = id -> {
            entered.countDown();
            awaitLatch(release);
            return GameStartResult.reserved(gateway.command, "demo-game-lookup");
        };
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);
        gateway.commandId();

        try {
            first.request("GAME_START_CHECK", Map.of());
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.request("GAME_START_CHECK", Map.of());
            assertThat(gateway.lookups.get()).isEqualTo(1);
        } finally {
            release.countDown();
        }
        first.phase("CONFIRMED");
        second.phase("CONFIRMED");
        assertThat(gateway.lookups.get()).isEqualTo(1);
    }

    @Test
    void 이전_시도의_늦은_응답을_새_시도에_반영하지_않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Thread> oldWorker = new AtomicReference<>();
        gateway.start = command -> {
            if (gateway.starts.get() == 1) {
                oldWorker.set(Thread.currentThread());
                entered.countDown();
                awaitLatch(release);
                return GameStartResult.reserved(command, "demo-game-old");
            }
            return GameStartResult.reserved(command, "demo-game-new");
        };
        gateway.lookup = id -> GameStartResult.rejected(id, "REJECTED");
        Peer first = seated();
        Peer second = seated();
        prepare(first, second);

        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            first.request("GAME_START_CHECK", Map.of());
            first.await(message -> message.path("payload").path("code").asText().equals("START_REJECTED"));
            prepare(first, second);
            first.phase("CONFIRMED");
        } finally {
            release.countDown();
        }
        oldWorker.get().join(5000);
        assertThat(oldWorker.get().isAlive()).isFalse();
        JsonNode current = first.request("GAME_START_CHECK", Map.of()).path("payload");
        assertThat(current.path("gameSessionId").asText()).isEqualTo("demo-game-new");
    }

    private Peer seated() throws Exception {
        Peer peer = peer();
        JsonNode state = peer.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        if (state.path("gameCode").isNull()) {
            peer.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        }
        return peer;
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
        peer.userId = peer.await(message -> message.path("type").asText().equals("CONNECTED"))
                .path("payload").path("userId").asText();
        peer.phase("NOT_SEATED");
        return peer;
    }

    private void awaitLatch(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private String userId;

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of(
                    "requestId", requestId, "type", type, "payload", payload)));
            return await(message -> message.path("requestId").asText().equals(requestId));
        }

        private JsonNode phase(String phase) throws Exception {
            return await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.path("payload").path("phase").asText().equals(phase));
        }

        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                String text = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(text).as("기대한 서버 메시지 수신").isNotNull();
                JsonNode message = mapper.readTree(text);
                if (predicate.test(message)) {
                    return message;
                }
            }
        }
    }

    private static class Gateway implements GameStartGateway {

        private final AtomicInteger starts = new AtomicInteger();
        private final AtomicInteger lookups = new AtomicInteger();
        private final BlockingQueue<UUID> received = new LinkedBlockingQueue<>();
        private volatile GameStartCommand command;
        private UUID lookedUp;
        private Function<GameStartCommand, GameStartResult> start = input ->
                GameStartResult.reserved(input, "demo-game-test");
        private Function<UUID, GameStartResult> lookup = id -> GameStartResult.reserved(command, "demo-game-test");

        @Override
        public GameStartResult startGame(GameStartCommand input) {
            command = input;
            starts.incrementAndGet();
            received.add(input.startAttemptId());
            return start.apply(input);
        }

        @Override
        public GameStartResult findStartResult(UUID id) {
            lookedUp = id;
            lookups.incrementAndGet();
            return lookup.apply(id);
        }

        private UUID commandId() throws Exception {
            UUID id = received.poll(5, TimeUnit.SECONDS);
            assertThat(id).isNotNull();
            return id;
        }
    }
}
