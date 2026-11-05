package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.farkle.domain.FarkleScoring;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** 실제 엔진·난수·Raw WS를 사용한다. 인증과 시작은 테스트 대역이며 지급은 MySQL 검수에서 확인한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.farkle.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=dice", "ontop.world.channels[0].name=다인주사위테스트",
        "ontop.world.channels[0].capacity=5"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class FarkleMultiplayerFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("dice\0table-1".getBytes(StandardCharsets.UTF_8));
    private static final List<Long> USERS = List.of(101L, 202L, 303L, 404L);
    private static final List<String> LOGINS = List.of("naver", "ssafy", "303", "404");
    @LocalServerPort private int port;
    @Autowired private FarkleEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private TableHub hub;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn = com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> spawn.x);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> spawn.z);
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 실제_모든_연결의_굴림_저장_중복_재접속_관전과_목표승리를_검증한다(int count) throws Exception {
        engine.create("dice", TABLE, USERS.subList(0, count), 2000);
        List<ScenarioClient> players = connectPlayers(count);
        try (ScenarioClient viewer = connectViewer()) {
            JsonNode initial = state();
            int wrong = (USERS.indexOf(initial.path("turnUserId").asLong()) + 1) % count;
            assertThat(players.get(wrong).request("GAME_ACTION_SEND", action("wrong", 0, "roll", List.of()))
                    .at("/payload/code").asText()).isEqualTo("GAME_ACTION_NOT_YOUR_TURN");
            for (int step = 0; step < 500 && !state().path("status").asText().equals("FINISHED"); step++) {
                var before = engine.load(101, "dice").orElseThrow();
                JsonNode data = before.publicState();
                int actor = USERS.indexOf(data.path("turnUserId").asLong());
                String kind = data.path("stage").asText().equals("AWAITING_ROLL") ? "roll" : "bank";
                var input = action("step-" + step, before.version(), kind, bestSelection(data.path("dice")));
                JsonNode receipt = players.get(actor).request("GAME_ACTION_SEND", input);
                assertThat(receipt.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
                long version = receipt.at("/payload/version").asLong();
                assertThat(players.get(actor).request("GAME_ACTION_SEND", input).at("/payload/version").asLong())
                        .isEqualTo(version);
                JsonNode expected = state();
                assertThat(expected.path("players").size()).isEqualTo(count);
                assertThat(expected.path("scores").size()).isEqualTo(count);
                for (int index = 0; index < count; index++) {
                    JsonNode delivered = index == actor
                            ? players.get(index).request("GAME_STATE_CHECK", Map.of("gameId", "dice"))
                            : players.get(index).await(message -> version(message, version));
                    assertThat(delivered.at("/payload/publicState")).isEqualTo(expected);
                    assertThat(delivered.at("/payload/privateState").isEmpty()).isTrue();
                }
                assertThat(viewer.await(message -> version(message, version)).at("/payload/publicState"))
                        .isEqualTo(expected);
                if (step == 0 && !expected.path("status").asText().equals("FINISHED")) {
                    players.getLast().close();
                    await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                            assertThat(hub.metricsSnapshot().activeConnections()).isEqualTo(count));
                    ScenarioClient returned = new ScenarioClient(port, LOGINS.get(count - 1));
                    returned.state("RESTORED");
                    assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId", "dice"))
                            .at("/payload/publicState")).isEqualTo(expected);
                    players.set(count - 1, returned);
                }
            }
            assertThat(state().path("status").asText()).isEqualTo("FINISHED");
            assertThat(state().path("endReason").asText()).isEqualTo("TARGET_REACHED");
            assertThat(state().path("turnDeadline").isNull()).isTrue();
            int winner = USERS.indexOf(state().path("winnerUserId").asLong());
            assertThat(state().path("scores").get(winner).asLong()).isGreaterThanOrEqualTo(2000);
        } finally {
            for (ScenarioClient player : players) { player.close(); }
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 실제_타이머와_기권은_남은_참가자의_차례와_최후승리를_동기화한다(int count) throws Exception {
        engine.create("dice", TABLE, USERS.subList(0, count), 4000);
        List<ScenarioClient> players = connectPlayers(count);
        try (ScenarioClient viewer = connectViewer()) {
            long first = state().path("turnUserId").asLong();
            clock.advanceSeconds(30);
            JsonNode timeout = viewer.await(message -> version(message, 1)).at("/payload/publicState");
            assertThat(timeout.path("lastEvent").asText()).isEqualTo("TURN_TIMEOUT");
            assertThat(timeout.path("turnUserId").asLong()).isEqualTo(USERS.get((USERS.indexOf(first) + 1) % count));
            for (ScenarioClient player : players) {
                assertThat(player.await(message -> version(message, 1)).at("/payload/publicState")).isEqualTo(timeout);
            }
            for (int index = count - 1; index > 0; index--) {
                var command = Map.of("gameId", "dice", "actionId", "leave-" + index);
                JsonNode receipt = players.get(index).request("GAME_FORFEIT", command);
                assertThat(receipt.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
                // 기권 승인 뒤 비동기 복구가 PENDING이면 재요청을 거절하므로 완료 상태를 기다린다.
                players.get(index).state("LOBBY");
                JsonNode duplicate = players.get(index).request("GAME_FORFEIT", command);
                assertThat(duplicate.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
                assertThat(duplicate.at("/payload/duplicate").asBoolean()).isTrue();
                assertThat(duplicate.at("/payload/version").asLong()).isEqualTo(receipt.at("/payload/version").asLong());
                long version = receipt.at("/payload/version").asLong();
                JsonNode expected = state();
                assertThat(viewer.await(message -> version(message, version)).at("/payload/publicState")).isEqualTo(expected);
                assertThat(expected.path("forfeitedUserIds").size()).isEqualTo(count - index);
                if (index > 1) {
                    assertThat(expected.path("status").asText()).isEqualTo("PLAYING");
                    assertThat(engine.load(USERS.get(index)).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
                }
            }
            assertThat(state().path("status").asText()).isEqualTo("FINISHED");
            assertThat(state().path("winnerUserId").asText()).isEqualTo("101");
        } finally {
            for (ScenarioClient player : players) { player.close(); }
        }
    }

    private List<ScenarioClient> connectPlayers(int count) throws Exception {
        List<ScenarioClient> players = new ArrayList<>();
        for (String login : LOGINS.subList(0, count)) {
            ScenarioClient client = new ScenarioClient(port, login);
            client.state("RESTORED");
            players.add(client);
        }
        return players;
    }

    private ScenarioClient connectViewer() throws Exception {
        ScenarioClient viewer = new ScenarioClient(port, "spectator");
        viewer.state("LOBBY");
        viewer.request("CHANNEL_JOIN", Map.of("channelId", "dice"));
        viewer.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
        assertThat(viewer.request("GAME_WATCH", Map.of("gameId", "dice")).at("/payload/privateState").isEmpty()).isTrue();
        return viewer;
    }

    private JsonNode state() throws Exception {
        // 메모리 LongNode와 전송 후 IntNode의 구현 타입이 아니라 실제 JSON 계약을 비교한다.
        return new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(engine.load(101, "dice").orElseThrow().publicState().toString());
    }

    private Map<String, Object> action(String id, long version, String kind, List<Integer> selected) {
        return Map.of("gameId", "dice", "actionId", id, "expectedVersion", version,
                "input", Map.of("kind", kind, "selectedIds", selected));
    }

    private boolean version(JsonNode message, long version) {
        return message.path("type").asText().equals("GAME_STATE") && message.at("/payload/version").asLong() == version;
    }

    private List<Integer> bestSelection(JsonNode dice) {
        int best = 0;
        List<Integer> result = List.of();
        for (int mask = 1; mask < 64; mask++) {
            List<Integer> ids = new ArrayList<>();
            List<Integer> faces = new ArrayList<>();
            for (JsonNode die : dice) {
                if (!die.path("held").asBoolean() && (mask & (1 << die.path("id").asInt())) != 0) {
                    ids.add(die.path("id").asInt());
                    faces.add(die.path("value").asInt());
                }
            }
            int score = FarkleScoring.score(faces.stream().mapToInt(Integer::intValue).toArray());
            if (score > best) { best = score; result = List.copyOf(ids); }
        }
        return result;
    }
}
