package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.omok.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=테스트",
        "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OmokFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort
    private int port;
    @Autowired
    private OmokEngine engine;
    @Autowired
    private TestClock clock;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @Test
    void 실제오목_착수부터_관전_재접속_승리까지_이어검증한다() throws Exception {
        System.out.println("[SIMULATED] 인증·참가 확정은 테스트 주입. 오목 규칙·통신·거리 검사는 실제 구현, 지급/DB 연동 아님.");
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            joinWatch(viewer);
            assertState(viewer.request("GAME_WATCH", Map.of("gameId", "omok")), 0, "PLAYING");
            assertThat(viewer.request("GAME_ACTION_SEND", action("intruder", 0, 0, 0))
                    .path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            play(black, "first", 0, 0, 0);
            assertState(white.await(m -> stateVersion(m, 1)), 1, "PLAYING");
            assertState(viewer.await(m -> stateVersion(m, 1)), 1, "PLAYING");
            play(black, "first", 0, 0, 0);
            assertThat(engine.load(101, "omok").orElseThrow().version()).isEqualTo(1);
            String deadline = engine.load(202).orElseThrow().state().path("turnDeadline").asText();
            System.out.println("[PASS] 실제 착수·본인/관전자 상태 전송·관전자 입력 차단·동일 행동 중복 미반영");

            white.stopPong();
            assertThat(white.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = new ScenarioClient(port, "ssafy")) {
                JsonNode recovery = returned.state("RESTORED");
                assertThat(recovery.path("version").asLong()).isEqualTo(1);
                assertThat(recovery.path("state").path("turnDeadline").asText()).isEqualTo(deadline);
                for (int index = 0; index < 4; index++) {
                    play(returned, "white-" + index, 1 + index * 2, index, 2);
                    play(black, "black-" + index, 2 + index * 2, index + 1, 0);
                }
                JsonNode finished = returned.await(m -> stateVersion(m, 9));
                assertState(finished, 9, "FINISHED");
                assertThat(finished.path("payload").path("publicState").path("winnerUserId").asText())
                        .isEqualTo("101");
                assertState(viewer.await(m -> stateVersion(m, 9)), 9, "FINISHED");
                assertThat(returned.request("GAME_ACTION_SEND", action("after-end", 9, 5, 5))
                        .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_INVALID_ACTION");
                returned.sendRequest("GAME_RECONNECT_CHECK", Map.of());
                returned.state("FINISHED");
                System.out.println("[PASS] heartbeat 단절·같은 경기/턴 마감 복귀 → 흑 5목 승리 → 종료 상태·추가 착수 차단");
            }
        }
    }

    @Test
    void 착수하지않아도_타이머가30초시간패를_자동전송한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            joinWatch(viewer);
            viewer.request("GAME_WATCH", Map.of("gameId", "omok"));
            // 실제 scheduler가 이 제어 시계를 읽는다. 엔진 tick/착수/조회로 만료를 대신 유발하지 않는다.
            clock.advanceSeconds(30);
            JsonNode ended = black.await(m -> stateVersion(m, 1));
            assertState(ended, 1, "FINISHED");
            JsonNode publicState = ended.path("payload").path("publicState");
            assertThat(publicState.path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
            assertThat(publicState.path("winnerUserId").asText()).isEqualTo("202");
            assertThat(publicState.path("moveCount").asInt()).isZero();
            assertState(white.await(m -> stateVersion(m, 1)), 1, "FINISHED");
            assertState(viewer.await(m -> stateVersion(m, 1)), 1, "FINISHED");
            System.out.println("[PASS] 제어 시계 30초 경계 → 실제 scheduler 시간패 → 참가자·20m 관전자 자동 수신");
        }
    }

    @Test
    void 소켓에서_흑삼삼을_거절하고_같은버전과_차례로_계속한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED")) {
            int[][] points = {{6,7},{8,7},{7,6},{7,8}};
            for(int i=0;i<4;i++) {
                play(black,"b"+i,i*2,points[i][0],points[i][1]);
                play(white,"w"+i,i*2+1,i*2,0);
            }
            var before = engine.load(101,"omok").orElseThrow();
            assertThat(black.request("GAME_ACTION_SEND",action("forbidden",8,7,7))
                    .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_FORBIDDEN_MOVE");
            assertThat(engine.load(101,"omok").orElseThrow()).isEqualTo(before);
            play(black,"legal",8,0,14);
            assertState(white.await(m -> stateVersion(m,9)),9,"PLAYING");
        }
    }

    private ScenarioClient connect(String login, String status) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.state(status);
        return client;
    }

    private void joinWatch(ScenarioClient client) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        client.request("WORLD_MOVE", Map.of("sequence", 0, "x", 0, "y", 0, "z", 0, "yaw", 0));
    }

    private void play(ScenarioClient client, String id, long version, int x, int y) throws Exception {
        JsonNode result = client.request("GAME_ACTION_SEND", action(id, version, x, y));
        assertThat(result.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
        assertThat(result.path("payload").path("version").asLong()).isEqualTo(version + 1);
    }

    private Map<String, Object> action(String id, long version, int x, int y) {
        return Map.of("gameId", "omok", "actionId", id, "expectedVersion", version, "input", Map.of("x", x, "y", y));
    }

    private boolean stateVersion(JsonNode message, long version) {
        return message.path("type").asText().equals("GAME_STATE")
                && message.path("payload").path("version").asLong() == version;
    }

    private void assertState(JsonNode message, long version, String status) {
        assertThat(stateVersion(message, version)).isTrue();
        JsonNode payload = message.path("payload");
        assertThat(payload.path("publicState").path("status").asText()).isEqualTo(status);
        assertThat(payload.path("publicState").path("board").size()).isEqualTo(15);
        assertThat(payload.path("privateState").isEmpty()).isTrue();
        assertThat(payload.has("tableId")).isFalse();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        TestClock testClock() { return new TestClock(); }
    }

    static final class TestClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-21T00:00:00Z"));
        void advanceSeconds(long seconds) { now.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now.get(), zone); }
        @Override public Instant instant() { return now.get(); }
    }
}
