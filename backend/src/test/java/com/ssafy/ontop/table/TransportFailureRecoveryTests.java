package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.table.service.TableHub;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TransportFailureRecoveryTests {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final GameReconnectTests.TestClock clock = new GameReconnectTests.TestClock();
    private final Engine engine = new Engine();
    private final GameReconnectService recovery = new GameReconnectService(Optional.of(engine), Optional.of(clock));
    // heartbeat 무응답이 아니라 전송 실패/큐 초과가 종료 원인인지 구분한다.
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.of(recovery),
            Duration.ofHours(1), Duration.ofHours(1));
    private final CountDownLatch releaseTransport = new CountDownLatch(1);

    @AfterEach
    void shutdown() {
        releaseTransport.countDown();
        hub.shutdown();
        recovery.shutdown();
    }

    @ParameterizedTest
    @CsvSource({
            "IO_FAILURE,29,2", "IO_FAILURE,30,2", "QUEUE_FULL,29,2", "QUEUE_FULL,30,2",
            "IO_FAILURE,29,4", "IO_FAILURE,30,4", "QUEUE_FULL,29,4", "QUEUE_FULL,30,4"
    })
    void 전송_실패와_큐초과는_다른사용자를_막지않고_감지후_삼십초_복구로_이어진다(
            String failure, int seconds, int participantCount) throws Exception {
        engine.participantCount = participantCount;
        Peer broken = connect(101);
        Peer healthy = connect(202);
        broken.state("RESTORED");
        healthy.state("RESTORED");
        assertThat(hub.connectAuthenticated(mockSocket("duplicate"), identity(101))).isFalse();
        engine.loads.clear();
        clock.advance(7);
        Instant detectedAt = clock.instant();
        broken.failure = failure;

        broken.request("UNKNOWN", Map.of());
        assertThat(broken.sending.await(5, TimeUnit.SECONDS)).isTrue();
        if (failure.equals("QUEUE_FULL")) {
            // send/close 모두 인터럽트로 끝나지 않아도 Hub의 종료 정리는 계속되어야 한다.
            for (int count = 0; count < 129; count++) {
                broken.request("UNKNOWN", Map.of());
            }
            assertThat(broken.closing.await(5, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
        assertThat(recovery.canControlGame(101, broken.id, "game-1")).isFalse();
        healthy.request("GAME_RECONNECT_CHECK", Map.of());
        assertThat(healthy.state("RESTORED").path("state").path("hand").asText()).isEqualTo("private-202");
        assertThat(engine.expirations).isEmpty();

        engine.version = 9;
        clock.advance(seconds);
        Peer returned = connect(101);
        String status = seconds == 29 ? "RESTORED" : participantCount == 2 ? "FINISHED" : "ELIMINATED";
        JsonNode restored = returned.state(status);
        assertThat(restored.path("state").path("turnDeadline").asText()).isEqualTo("original-deadline");
        assertThat(restored.path("state").path("hand").asText()).isEqualTo("private-101");
        assertThat(restored.path("version").asLong()).isEqualTo(seconds == 29 ? 9 : 10);
        assertThat(recovery.canControlGame(101, returned.id, "game-1")).isEqualTo(seconds == 29);
        if (seconds == 30) {
            GameRecoveryGateway.GraceExpiration command = engine.expirations.poll(5, TimeUnit.SECONDS);
            assertThat(command).isNotNull();
            assertThat(command.disconnectedAt()).isEqualTo(detectedAt);
            assertThat(command.deadline()).isEqualTo(detectedAt.plusSeconds(30));
            assertThat(command.action()).isEqualTo(participantCount == 2
                    ? GameRecoveryGateway.Action.FORFEIT : GameRecoveryGateway.Action.ELIMINATE);
        }

        // 이전 송신자/종료 콜백이 늦게 끝나도 새 연결을 종료하거나 유예를 다시 만들면 안 된다.
        releaseTransport.countDown();
        hub.disconnect(broken.id);
        hub.disconnect(broken.id);
        returned.request("GAME_RECONNECT_CHECK", Map.of());
        assertThat(returned.state(status).path("version").asLong()).isEqualTo(seconds == 29 ? 9 : 10);
        assertThat(engine.expirations.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(recovery.canControlGame(202, healthy.id, "game-1")).isTrue();
    }

    private Peer connect(long userId) throws Exception {
        Peer peer = new Peer();
        assertThat(hub.connectAuthenticated(peer.socket, identity(userId))).isTrue();
        assertThat(peer.next("CONNECTED").path("payload").path("userId").asText())
                .isEqualTo(Long.toString(userId));
        return peer;
    }

    private VerifiedWebSocketUser identity(long userId) {
        return new VerifiedWebSocketUser(userId, Provider.NAVER, TestLoginSessions.ID);
    }

    private WebSocketSession mockSocket(String id) {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id);
        return socket;
    }

    private void awaitTransportRelease() {
        boolean interrupted = false;
        while (true) {
            try {
                releaseTransport.await();
                break;
            } catch (InterruptedException exception) {
                interrupted = true;
            }
        }
        if (interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final WebSocketSession socket = mockSocket(id);
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private final CountDownLatch sending = new CountDownLatch(1);
        private final CountDownLatch closing = new CountDownLatch(1);
        private volatile String failure;

        private Peer() throws Exception {
            doAnswer(call -> {
                TextMessage message = call.getArgument(0);
                if (failure != null) {
                    sending.countDown();
                    if (failure.equals("IO_FAILURE")) {
                        throw new IOException("test send failure");
                    }
                    awaitTransportRelease();
                    return null;
                }
                messages.add(mapper.readTree(message.getPayload()));
                return null;
            }).when(socket).sendMessage(any(TextMessage.class));
            doAnswer(call -> {
                closing.countDown();
                if ("QUEUE_FULL".equals(failure)) {
                    awaitTransportRelease();
                }
                return null;
            }).when(socket).close(any());
        }

        private void request(String type, Object payload) throws Exception {
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", UUID.randomUUID().toString(),
                    "type", type, "payload", payload)));
        }

        private JsonNode next(String type) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                JsonNode message = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(message).as(type).isNotNull();
                if (message.path("type").asText().equals(type)) {
                    return message;
                }
                assertThat(message.path("type").asText()).isNotEqualTo("ERROR");
            }
        }

        private JsonNode state(String status) throws Exception {
            JsonNode view;
            do {
                view = next("GAME_CONNECTION_STATE").path("payload");
            } while (!view.path("status").asText().equals(status));
            return view;
        }
    }

    private class Engine implements GameRecoveryGateway {
        private final BlockingQueue<Long> loads = new LinkedBlockingQueue<>();
        private final BlockingQueue<GraceExpiration> expirations = new LinkedBlockingQueue<>();
        private volatile int participantCount;
        private volatile long version = 8;
        private volatile Phase phase = Phase.PLAYING;

        @Override
        public synchronized Optional<GameRecoverySnapshot> load(long userId) {
            loads.add(userId);
            return Optional.of(new GameRecoverySnapshot(userId, "game-1", participantCount, version,
                    userId == 101 ? phase : Phase.PLAYING, mapper.createObjectNode()
                            .put("hand", "private-" + userId).put("turnDeadline", "original-deadline")));
        }

        @Override
        public synchronized void graceExpired(GraceExpiration command) {
            phase = command.action() == Action.FORFEIT ? Phase.FINISHED : Phase.ELIMINATED;
            version++;
            expirations.add(command);
        }
    }
}
