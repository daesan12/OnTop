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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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

    @Test
    void 금수_안내는_소켓_조회와_변경방송과_재접속에서_흑에게만_전송한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        int[][] blacks = {{6, 7}, {8, 7}, {7, 6}, {7, 8}};
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (int i = 0; i < blacks.length; i++) {
            engine.apply(new com.ssafy.ontop.game.action.GameActionCommand(101, "omok", "black-" + i, i * 2,
                    mapper.createObjectNode().put("x", blacks[i][0]).put("y", blacks[i][1])));
            engine.apply(new com.ssafy.ontop.game.action.GameActionCommand(202, "omok", "white-" + i, i * 2 + 1,
                    mapper.createObjectNode().put("x", i * 2).put("y", 0)));
        }

        try (var black = new ScenarioClient(port, "naver"); var white = new ScenarioClient(port, "ssafy");
                var viewer = connect("spectator", "LOBBY")) {
            var recoveredBlack = black.state("RESTORED");
            var recoveredWhite = white.state("RESTORED");
            assertThat(recoveredBlack.at("/state/privateState/forbiddenMoves").toString())
                    .isEqualTo("[{\"x\":7,\"y\":7,\"kind\":\"33\"}]");
            assertThat(recoveredWhite.findValues("forbiddenMoves")).isEmpty();
            joinWatch(viewer);
            var watched = viewer.request("GAME_WATCH", Map.of("gameId", "omok"));
            assertThat(watched.findValues("forbiddenMoves")).isEmpty();
            var blackState = black.request("GAME_STATE_CHECK", Map.of("gameId", "omok"));
            var whiteState = white.request("GAME_STATE_CHECK", Map.of("gameId", "omok"));
            assertThat(blackState.at("/payload/publicState").has("forbiddenMoves")).isFalse();
            assertThat(blackState.at("/payload/privateState/forbiddenMoves").size()).isEqualTo(1);
            assertThat(whiteState.findValues("forbiddenMoves")).isEmpty();

            play(black, "legal-after-preview", 8, 0, 1);
            assertThat(black.await(m -> stateVersion(m, 9)).at("/payload/privateState/forbiddenMoves").isArray()).isTrue();
            assertThat(white.await(m -> stateVersion(m, 9)).findValues("forbiddenMoves")).isEmpty();
            assertThat(viewer.await(m -> stateVersion(m, 9)).findValues("forbiddenMoves")).isEmpty();
        }
    }

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> com.ssafy.ontop.world.movement.ParkScene.load().spawn(0).x);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> com.ssafy.ontop.world.movement.ParkScene.load().spawn(0).z);
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
                // 직접 생성한 엔진의 종료 이력은 미착석 연결의 활성 경기로 복구하지 않는다.
                returned.state("LOBBY");
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

    @ParameterizedTest(name = "흑 금수: {0}")
    @ValueSource(strings = {"DOUBLE_THREE", "DOUBLE_FOUR", "OVERLINE"})
    void 소켓에서_흑금수를_거절하고_같은버전과_차례로_계속한다(String rule) throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            int[][] points = switch (rule) {
                case "DOUBLE_THREE" -> new int[][] {{6,7},{8,7},{7,6},{7,8}};
                case "DOUBLE_FOUR" -> new int[][] {{3,7},{5,7},{6,7},{9,7}};
                case "OVERLINE" -> new int[][] {{4,7},{5,7},{6,7},{8,7},{9,7}};
                default -> throw new IllegalArgumentException(rule);
            };
            prepareForbidden(black, white, points);
            long version = points.length * 2L;
            joinWatch(viewer);
            assertState(viewer.request("GAME_WATCH", Map.of("gameId", "omok")), version, "PLAYING");
            // request()는 응답 전에 도착한 비동기 상태를 소비할 수 있다.
            // 준비 착수 완료는 현재 상태 조회로 확인하고, 금수 이후 방송은 아래에서 별도 검증한다.
            assertState(white.request("GAME_STATE_CHECK", Map.of("gameId", "omok")), version, "PLAYING");
            var before = engine.load(101, "omok").orElseThrow();
            // 오류가 상대/관전자의 새 상태로 잘못 방송되지 않는지도 같은 구간에 관찰한다.
            viewer.assertNoMessageDuring(m -> stateVersion(m, version + 1), () ->
                    white.assertNoMessageDuring(m -> stateVersion(m, version + 1), () -> {
                        assertThat(black.request("GAME_ACTION_SEND", action("forbidden", version, 7, 7))
                                .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_FORBIDDEN_MOVE");
                        return null;
                    }));
            assertThat(black.request("GAME_STATE_CHECK", Map.of("gameId", "omok"))
                    .path("payload").path("publicState")).isEqualTo(before.publicState());
            assertThat(engine.load(101, "omok").orElseThrow()).isEqualTo(before);
            play(black, "legal", version, 0, 14);
            assertState(white.await(m -> stateVersion(m, version + 1)), version + 1, "PLAYING");
            assertState(viewer.await(m -> stateVersion(m, version + 1)), version + 1, "PLAYING");
            System.out.println("[PASS] " + rule + " 소켓 거절·상태 불변·잘못된 갱신 미수신·다음 합법 착수");
        }
    }

    @Test
    void 금수후_끊겼다가복귀해도_원래마감에시간패한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            prepareForbidden(black, white, new int[][] {{6,7},{8,7},{7,6},{7,8}});
            joinWatch(viewer);
            viewer.request("GAME_WATCH", Map.of("gameId", "omok"));
            var before = engine.load(101, "omok").orElseThrow().publicState();
            clock.advanceSeconds(10);
            assertThat(black.request("GAME_ACTION_SEND", action("forbidden", 8, 7, 7))
                    .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_FORBIDDEN_MOVE");
            black.stopPong();
            assertThat(black.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = connect("naver", "RESTORED")) {
                JsonNode recovered = returned.request("GAME_STATE_CHECK", Map.of("gameId", "omok"));
                assertState(recovered, 8, "PLAYING");
                assertThat(recovered.path("payload").path("publicState")).isEqualTo(before);
                clock.advanceSeconds(19);
                assertState(returned.request("GAME_STATE_CHECK", Map.of("gameId", "omok")), 8, "PLAYING");
                // tick/조회/새 착수 없이 실제 scheduler가 원래 30초 마감에 종료해야 한다.
                clock.advanceSeconds(1);
                JsonNode ended = returned.await(m -> stateVersion(m, 9));
                assertState(ended, 9, "FINISHED");
                JsonNode state = ended.path("payload").path("publicState");
                assertThat(state.path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
                assertThat(state.path("winnerUserId").asText()).isEqualTo("202");
                assertThat(state.path("endedAt")).isEqualTo(before.path("turnDeadline"));
                assertThat(state.path("board")).isEqualTo(before.path("board"));
                assertThat(state.path("moveCount").asInt()).isEqualTo(8);
                assertState(white.await(m -> stateVersion(m, 9)), 9, "FINISHED");
                assertState(viewer.await(m -> stateVersion(m, 9)), 9, "FINISHED");
                assertThat(returned.request("GAME_ACTION_SEND", action("late", 9, 0, 14))
                        .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_INVALID_ACTION");
                assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId", "omok"))
                        .path("payload").path("publicState")).isEqualTo(state);
                System.out.println("[PASS] 금수 → 실제 heartbeat 단절/복귀 → 29초 진행/원래30초 시간패 → 전원 알림·종료 재조회");
            }
        }
    }

    @Test
    void 무르기_요청과_재접속_상대승인_관전자갱신을_실제소켓으로_검증한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (ScenarioClient black = connect("naver", "RESTORED");
                ScenarioClient white = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            play(black, "b", 0, 0, 0); play(white, "w", 1, 0, 2);
            joinWatch(viewer); viewer.request("GAME_WATCH", Map.of("gameId", "omok"));
            assertThat(black.request("GAME_ACTION_SEND", Map.of("gameId","omok","actionId","undo",
                    "expectedVersion",2,"input",Map.of("kind","undoRequest"))).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            JsonNode pending = viewer.await(m -> stateVersion(m, 3)).path("payload").path("publicState");
            assertThat(pending.path("undo").path("requesterUserId").asText()).isEqualTo("101");
            assertThat(black.request("GAME_ACTION_SEND", action("blocked",3,2,2)).path("payload").path("code").asText())
                    .isEqualTo("GAME_ACTION_INVALID_ACTION");
            white.stopPong(); assertThat(white.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = connect("ssafy", "RESTORED")) {
                assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId","omok"))
                        .path("payload").path("publicState").path("undo")).isEqualTo(pending.path("undo"));
                Map<String,Object> response = Map.of("gameId","omok","actionId","approve","expectedVersion",3,
                        "input",Map.of("kind","undoRespond","requestId","undo","accept",true));
                assertThat(returned.request("GAME_ACTION_SEND", response).path("payload").path("version").asInt()).isEqualTo(4);
                JsonNode approved = viewer.await(m -> stateVersion(m,4)).path("payload").path("publicState");
                assertThat(approved.path("moveCount").asInt()).isZero();
                assertThat(approved.path("turnUserId").asText()).isEqualTo("101");
                assertThat(approved.path("undoDecision").path("status").asText()).isEqualTo("ACCEPTED");
                returned.request("GAME_ACTION_SEND", response);
                assertThat(engine.load(101,"omok").orElseThrow().version()).isEqualTo(4);
                play(black,"new-stone",4,1,1);
                assertState(viewer.await(m -> stateVersion(m,5)),5,"PLAYING");
            }
        }
    }

    private void prepareForbidden(ScenarioClient black, ScenarioClient white, int[][] points) throws Exception {
        for (int index = 0; index < points.length; index++) {
            play(black, "b" + index, index * 2L, points[index][0], points[index][1]);
            play(white, "w" + index, index * 2L + 1, index * 2, 0);
        }
    }

    @Test
    void 합의무승부_요청과_복귀_상대동의_관전자종료를_실제소켓으로검증한다() throws Exception {
        engine.create("omok", TABLE, 101, 202);
        try (var black=connect("naver","RESTORED");var white=connect("ssafy","RESTORED");var viewer=connect("spectator","LOBBY")) {
            joinWatch(viewer);viewer.request("GAME_WATCH",Map.of("gameId","omok"));
            String deadline=engine.load(101,"omok").orElseThrow().publicState().path("turnDeadline").asText();
            assertThat(black.request("GAME_ACTION_SEND",Map.of("gameId","omok","actionId","draw","expectedVersion",0,
                    "input",Map.of("kind","drawRequest"))).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            var pending=viewer.await(m->stateVersion(m,1)).at("/payload/publicState");
            assertThat(pending.path("draw").path("requesterUserId").asText()).isEqualTo("101");
            assertThat(pending.path("turnDeadline").asText()).isEqualTo(deadline);
            assertThat(black.request("GAME_ACTION_SEND",action("blocked-draw",1,0,0)).at("/payload/code").asText())
                    .isEqualTo("GAME_ACTION_INVALID_ACTION");
            white.stopPong();assertThat(white.awaitClose()).isEqualTo(1001);
            try(var returned=new ScenarioClient(port,"ssafy")) {
                var recovered=returned.state("RESTORED");
                assertThat(recovered.at("/state/draw")).isEqualTo(pending.path("draw"));
                assertThat(recovered.at("/state/drawRequestsUsed").toString()).isEqualTo("[\"101\"]");
                var accept=Map.of("gameId","omok","actionId","agree","expectedVersion",1,
                        "input",Map.of("kind","drawRespond","requestId","draw","accept",true));
                assertThat(returned.request("GAME_ACTION_SEND",accept).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
                var result=viewer.await(m->stateVersion(m,2));assertState(result,2,"FINISHED");
                assertThat(result.at("/payload/publicState/endReason").asText()).isEqualTo("AGREED_DRAW");
                assertThat(result.at("/payload/publicState/winnerUserId").isNull()).isTrue();
                assertState(black.await(m->stateVersion(m,2)),2,"FINISHED");
                returned.request("GAME_ACTION_SEND",accept);assertThat(engine.load(101,"omok").orElseThrow().version()).isEqualTo(2);
            }
        }
    }

    private ScenarioClient connect(String login, String status) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.state(status);
        return client;
    }

    private void joinWatch(ScenarioClient client) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        client.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
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
        assertThat(payload.path("publicState").has("forbiddenMoves")).isFalse();
        if (!payload.path("privateState").isEmpty()) {
            assertThat(payload.at("/privateState/userId")).isEqualTo(payload.at("/publicState/blackUserId"));
            assertThat(payload.at("/privateState/forbiddenMoves").isArray()).isTrue();
        }
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
