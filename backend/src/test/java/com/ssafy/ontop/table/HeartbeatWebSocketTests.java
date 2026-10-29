package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=1s"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, HeartbeatWebSocketTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class HeartbeatWebSocketTests {

    private final ObjectMapper mapper = new ObjectMapper();
    @LocalServerPort
    private int port;
    @Autowired
    private Engine engine;
    @Autowired
    private TestClock clock;

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 무응답_감지후에만_삼십초를_세고_같은계정_복귀와_만료로_이어진다(int seconds) throws Exception {
        try (WireClient first = new WireClient("naver")) {
            first.state("RESTORED");
            engine.loads.clear();
            Frame ping = first.untilOpcode(9);
            first.send(10, new byte[] {1}); // 엉뚱한 Pong과 텍스트로 연결을 연장할 수 없다.
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            first.untilOpcode(8);
            assertThat(ping.payload().length).isEqualTo(16);
            assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
            assertThat(engine.expirations).isEmpty();
            clock.now = clock.now.plusSeconds(seconds);
            engine.version = 9;
            try (WireClient returned = new WireClient("naver")) {
                JsonNode state = returned.state(seconds == 29 ? "RESTORED" : "EXPIRED");
                if (seconds == 29) {
                    assertThat(state.path("version").asLong()).isEqualTo(9);
                    assertThat(state.path("state").path("turnDeadline").asText()).isEqualTo("original-deadline");
                    assertThat(engine.expirations).isEmpty();
                } else {
                    assertThat(state.path("state").isNull()).isTrue();
                    GraceResult.assertForfeit(engine.expirations.poll(5, TimeUnit.SECONDS));
                }
            }
        }
    }

    @Test
    void 정상_퐁은_유휴중에도_연결을_유지하고_다음_핑으로_이어진다() throws Exception {
        try (WireClient client = new WireClient("naver")) {
            client.state("RESTORED");
            for (int count = 0; count < 7; count++) {
                Frame ping = client.untilOpcode(9);
                client.send(10, ping.payload());
            }
            client.request("GAME_RECONNECT_CHECK", Map.of());
            assertThat(client.state("RESTORED").path("gameId").asText()).isEqualTo("game-1");
            assertThat(engine.expirations).isEmpty();
        }
    }

    @Test
    void 대기좌석도_무응답이면_한번_비우고_다시_입장할수있다() throws Exception {
        try (WireClient first = new WireClient("ssafy")) {
            first.state("LOBBY");
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            first.json("TABLE_STATE");
            first.untilOpcode(9);
            first.untilOpcode(8);
            try (WireClient returned = new WireClient("ssafy")) {
                returned.state("LOBBY");
                returned.request("TABLE_JOIN", Map.of("tableId", "table-1"));
                JsonNode state = returned.json("TABLE_STATE").path("payload");
                assertThat(state.path("seats").findValuesAsText("userId")).contains("202");
                assertThat(engine.expirations).isEmpty();
            }
        }
    }

    // 자동 Pong을 보내는 클라이언트 대신 테스트에서만 직접 응답을 제어한다.
    private class WireClient implements AutoCloseable {
        private final Socket socket = new Socket("127.0.0.1", port);
        private final DataInputStream input;
        private final OutputStream output;

        private WireClient(String login) throws Exception {
            socket.setSoTimeout(5000);
            input = new DataInputStream(socket.getInputStream());
            output = socket.getOutputStream();
            String headers = "GET /ws/tables HTTP/1.1\r\nHost: 127.0.0.1:" + port
                    + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13"
                    + "\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nX-Test-Login: " + login + "\r\n\r\n";
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.flush();
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            while (!response.toString(StandardCharsets.US_ASCII).endsWith("\r\n\r\n")) {
                int next = input.read();
                if (next < 0 || response.size() > 8192) {
                    throw new EOFException("upgrade 응답 없음");
                }
                response.write(next);
            }
            assertThat(response.toString(StandardCharsets.US_ASCII)).startsWith("HTTP/1.1 101");
            json("CONNECTED");
        }

        private Frame read() throws Exception {
            int opcode = input.readUnsignedByte() & 15;
            int length = input.readUnsignedByte();
            assertThat(length & 128).isZero();
            if (length == 126) {
                length = input.readUnsignedShort();
            } else if (length == 127) {
                length = Math.toIntExact(input.readLong());
            }
            assertThat(length).isBetween(0, 65536);
            byte[] payload = new byte[length];
            input.readFully(payload);
            return new Frame(opcode, payload);
        }

        private Frame untilOpcode(int opcode) throws Exception {
            while (true) {
                Frame frame = read();
                if (frame.opcode() == opcode) {
                    return frame;
                }
                assertThat(frame.opcode()).as("예상치 못한 종료").isNotEqualTo(8);
            }
        }

        private JsonNode json(String type) throws Exception {
            while (true) {
                Frame frame = read();
                if (frame.opcode() == 9) {
                    send(10, frame.payload());
                } else {
                    assertThat(frame.opcode()).isEqualTo(1);
                    JsonNode message = mapper.readTree(frame.payload());
                    if (message.path("type").asText().equals(type)) {
                        return message;
                    }
                }
            }
        }

        private JsonNode state(String status) throws Exception {
            while (true) {
                JsonNode payload = json("GAME_CONNECTION_STATE").path("payload");
                if (payload.path("status").asText().equals(status)) {
                    return payload;
                }
            }
        }

        private void request(String type, Object payload) throws Exception {
            send(1, mapper.writeValueAsBytes(Map.of("type", type, "requestId", UUID.randomUUID().toString(),
                    "payload", payload)));
        }

        private void send(int opcode, byte[] payload) throws Exception {
            output.write(128 | opcode);
            if (payload.length < 126) {
                output.write(128 | payload.length);
            } else {
                output.write(128 | 126);
                output.write(payload.length >> 8);
                output.write(payload.length & 255);
            }
            byte[] mask = {11, 22, 33, 44};
            output.write(mask);
            for (int index = 0; index < payload.length; index++) {
                output.write(payload[index] ^ mask[index % 4]);
            }
            output.flush();
        }

        @Override
        public void close() throws Exception {
            socket.close();
        }
    }

    private record Frame(int opcode, byte[] payload) {
    }

    private static class GraceResult {
        private static void assertForfeit(GameRecoveryGateway.GraceExpiration command) {
            assertThat(command).isNotNull();
            assertThat(command.action()).isEqualTo(GameRecoveryGateway.Action.FORFEIT);
            assertThat(command.deadline()).isEqualTo(command.disconnectedAt().plusSeconds(30));
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        Engine engine() { return new Engine(); }

        @Bean
        TestClock testClock() { return new TestClock(); }
    }

    static class Engine implements GameRecoveryGateway {
        private final BlockingQueue<Long> loads = new LinkedBlockingQueue<>();
        private final BlockingQueue<GraceExpiration> expirations = new LinkedBlockingQueue<>();
        private volatile long version = 1;

        @Override
        public Optional<GameRecoverySnapshot> load(long userId) {
            loads.add(userId);
            return userId == 202 ? Optional.empty() : Optional.of(new GameRecoverySnapshot(userId, "game-1", 2,
                    version, Phase.PLAYING, new ObjectMapper().createObjectNode()
                            .put("turnDeadline", "original-deadline")));
        }

        @Override
        public void graceExpired(GraceExpiration command) { expirations.add(command); }
    }

    static class TestClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-19T00:00:00Z");

        @Override
        public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override
        public Clock withZone(ZoneId zone) { return this; }

        @Override
        public Instant instant() { return now; }
    }
}
