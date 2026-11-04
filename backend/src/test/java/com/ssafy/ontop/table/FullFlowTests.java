package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
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
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FullFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class FullFlowTests {

    @LocalServerPort
    private int port;
    @Autowired
    private Engine engine;
    @Autowired
    private TestClock clock;

    @ParameterizedTest(name = "착석·준비·끊김 감지 후 {0}초 재접속")
    @ValueSource(ints = {29, 30})
    void 착석부터_동일경기_복귀까지_한번에_확인한다(int seconds) throws Exception {
        System.out.println("[SIMULATED] 인증/경기 담당은 테스트 대역. 실제 OAuth·경기 생성·정산 검증 아님.");
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy")) {
            assertThat(first.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo("101");
            assertThat(second.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo("202");
            first.state("LOBBY");
            second.state("LOBBY");
            pass("사용자 두 명 연결 / 경기 없음 확인");

            assertType(first.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
            JsonNode seated = second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            assertType(seated, "TABLE_STATE");
            assertThat(seated.path("payload").path("seats").findValuesAsText("userId"))
                    .contains("101", "202");
            pass("두 명 같은 테이블 착석");

            assertThat(first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "DICE", "targetScore", 4000))
                    .path("payload").path("gameCode").asText()).isEqualTo("DICE");
            second.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("gameCode").asText().equals("DICE"));
            assertThat(first.request("READY_SET", Map.of("ready", true))
                    .path("payload").path("allReady").asBoolean()).isFalse();
            JsonNode ready = second.request("READY_SET", Map.of("ready", true)).path("payload");
            assertThat(ready.path("allReady").asBoolean()).isTrue();
            JsonNode shared = first.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("allReady").asBoolean()).path("payload");
            assertThat(shared).isEqualTo(ready);
            pass("첫 착석자 게임 선택 / 전원 준비 양쪽 동기화");

            engine.activate(ready);
            System.out.println("[SIMULATED] 준비 확인 후 경기 대역을 주입함. 자동 경기 생성 연동은 아직 없음.");
            first.request("GAME_RECONNECT_CHECK", Map.of());
            second.request("GAME_RECONNECT_CHECK", Map.of());
            assertThat(first.state("RESTORED").path("state").path("viewerId").asLong()).isEqualTo(101);
            assertThat(second.state("RESTORED").path("state").path("viewerId").asLong()).isEqualTo(202);
            try (ScenarioClient duplicate = new ScenarioClient(port, "naver")) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            pass("경기 조회 연결부 / 살아 있는 계정의 중복 연결 차단");

            engine.loads.clear();
            first.stopPong();
            assertThat(first.awaitClose()).isEqualTo(1001);
            assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
            assertThat(engine.expirations).isEmpty();
            pass("Pong 중단 → 실제 heartbeat 감지 → 재접속 유예 시작");

            clock.now = clock.now.plusSeconds(seconds);
            engine.version = 8;
            try (ScenarioClient returned = new ScenarioClient(port, "naver")) {
                returned.await(message -> message.path("type").asText().equals("CONNECTED"));
                JsonNode state = returned.state(seconds == 29 ? "RESTORED" : "EXPIRED");
                if (seconds == 29) {
                    assertThat(state.path("gameId").asText()).isEqualTo("scenario-game-1");
                    assertThat(state.path("version").asLong()).isEqualTo(8);
                    assertThat(state.path("state").path("viewerId").asLong()).isEqualTo(101);
                    assertThat(state.path("state").path("turnDeadline").asText()).isEqualTo(engine.turnDeadline);
                    assertThat(engine.expirations).isEmpty();
                    pass("29초 복귀 / 같은 경기·최신 본인 상태·원래 턴 마감 유지");
                } else {
                    assertThat(state.path("state").isNull()).isTrue();
                    GraceExpiration command = engine.expirations.poll(5, TimeUnit.SECONDS);
                    assertThat(command).isNotNull();
                    assertThat(command.action()).isEqualTo(GameRecoveryGateway.Action.FORFEIT);
                    assertThat(command.deadline()).isEqualTo(command.disconnectedAt().plusSeconds(30));
                    assertThat(returned.request("TABLE_JOIN", Map.of("tableId", "table-2"))
                            .path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
                    pass("30초 경계 / 만료 요청·경기 정보 차단·미확정 상태의 착석 차단");
                }
            }
        }
        pass("시나리오 완료: " + seconds + "초 경계");
    }

    private static void assertType(JsonNode message, String type) {
        assertThat(message.path("type").asText()).isEqualTo(type);
    }

    private static void pass(String message) {
        System.out.println("[PASS] " + message);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        Engine engine() { return new Engine(); }

        @Bean
        TestClock testClock() { return new TestClock(); }
    }

    static class Engine implements GameRecoveryGateway {
        final BlockingQueue<Long> loads = new LinkedBlockingQueue<>();
        final BlockingQueue<GraceExpiration> expirations = new LinkedBlockingQueue<>();
        final String turnDeadline = "2026-10-19T00:00:30Z";
        private volatile boolean active;
        volatile long version = 1;

        void activate(JsonNode ready) {
            assertThat(ready.path("allReady").asBoolean()).isTrue();
            assertThat(ready.path("gameCode").asText()).isEqualTo("DICE");
            assertThat(ready.path("capacity").asInt()).isEqualTo(4);
            assertThat(ready.path("seats").findValues("userId"))
                    .filteredOn(userId -> !userId.isNull())
                    .extracting(JsonNode::asText)
                    .containsExactly("101", "202");
            active = true;
        }

        @Override
        public Optional<GameRecoverySnapshot> load(long userId) {
            loads.add(userId);
            if (!active || !Set.of(101L, 202L).contains(userId)) {
                return Optional.empty();
            }
            return Optional.of(new GameRecoverySnapshot(userId, "scenario-game-1", 2, version, Phase.PLAYING,
                    new ObjectMapper().createObjectNode().put("viewerId", userId).put("turnDeadline", turnDeadline)));
        }

        @Override
        public void graceExpired(GraceExpiration command) { expirations.add(command); }
    }

    static class TestClock extends Clock {
        volatile Instant now = Instant.parse("2026-10-19T00:00:00Z");

        @Override
        public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override
        public Clock withZone(ZoneId zone) { return this; }

        @Override
        public Instant instant() { return now; }
    }
}
