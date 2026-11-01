package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.onecard.enabled=true", "ontop.games.bridge.enabled=true", "server.address=127.0.0.1",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=연속검증",
        "ontop.world.channels[0].capacity=8", "ontop.world.channels[1].channel-id=two",
        "ontop.world.channels[1].name=격리검증", "ontop.world.channels[1].capacity=8",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class,
        MemberAuthenticationFixture.class, FrozenWorldFixture.class, TableGameIdFlowTests.LifecycleFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class MultiplayerForfeitFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));
    private static final String GAME = "committed-test-game";
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private TableHub hub;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private CommittedStartFlowTests.ReservationDouble reservation;
    @Autowired private CommittedStartFlowTests.ResultStoreDouble results;
    @Autowired private TableGameIdFlowTests.LifecycleEvents lifecycle;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") private Clock oauthClock;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry registry) {
        registry.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        registry.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @BeforeEach
    void accounts() {
        when(oauthClock.instant()).thenAnswer(call -> clock.instant());
        for (long id : List.of(101L, 202L, 505L, 606L, 707L)) {
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    id, VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
        }
    }

    @ParameterizedTest
    @CsvSource({"ONE_CARD,3", "ONE_CARD,4", "LIAR_BRIDGE,3", "LIAR_BRIDGE,4"})
    void 다인전_중도기권_탈락복귀_최종정산_재준비를_개인정보노출없이연결한다(String code, int count) throws Exception {
        List<Long> users = List.of(101L, 202L, 505L, 606L).subList(0, count);
        List<ScenarioClient> players = new ArrayList<>();
        try (var viewer = connect(707, "LOBBY")) {
            for (long user : users) { players.add(connect(user, "LOBBY")); }
            positions.move(viewer.userId, new WorldChannelRegistry.Position(1, 0, .8, 0, 0));
            viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
            for (var player : players) {
                assertThat(player.request("TABLE_JOIN", Map.of("tableId", TABLE)).path("type").asText())
                        .isEqualTo("TABLE_STATE");
                if (player == players.getFirst()) {
                    player.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", code));
                }
            }
            for (var player : players) {
                // 최종 착석 이후 수신한 상태로 참가비/버전을 확인한다.
                assertThat(player.request("TABLE_JOIN", Map.of("tableId", TABLE)).path("type").asText()).isEqualTo("TABLE_STATE");
                assertThat(player.request("READY_SET", Map.of("ready", true)).path("type").asText()).isEqualTo("TABLE_STATE");
            }
            reservation.release.countDown();
            var started = tableState(viewer, GAME);
            for (var player : players) { player.state("RESTORED"); }
            assertThat(started.path("seats").findValues("userId")).filteredOn(value -> !value.isNull()).hasSize(count);
            var watched = viewer.request("GAME_WATCH", Map.of("gameId", GAME));
            assertPublic(watched);

            Map<String, String> command = Map.of("gameId", GAME, "actionId", "middle-forfeit");
            var receipt = players.get(1).request("GAME_FORFEIT", command);
            assertThat(receipt.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            players.get(1).state("ELIMINATED");
            var continuing = viewer.await(message -> message.path("type").asText().equals("GAME_STATE")
                    && message.at("/payload/version").asLong() >= receipt.at("/payload/version").asLong());
            assertPublic(continuing);
            assertThat(continuing.at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
            assertThat(summary().path("status").asText()).isEqualTo("PLAYING");
            assertThat(summary().path("gameId").asText()).isEqualTo(GAME);
            assertThat(lifecycle.left).hasSize(1);
            assertThat(lifecycle.finished).isEmpty();
            var survivor = players.getFirst().request("GAME_STATE_CHECK", Map.of("gameId", GAME));
            assertThat(survivor.at("/payload/publicState/status").asText()).isEqualTo("PLAYING");

            players.get(1).close();
            viewer.await(message -> message.path("type").asText().equals("CHANNEL_STATE")
                    && message.at("/payload/currentUsers").asInt() == count);
            players.set(1, connect(202, "ELIMINATED"));
            var returned = players.get(1);
            assertThat(returned.request("GAME_FORFEIT", command).at("/payload/duplicate").asBoolean()).isTrue();
            returned.state("ELIMINATED");
            assertThat(returned.request("CHANNEL_JOIN", Map.of("channelId", "two"))
                    .at("/payload/code").asText()).isEqualTo("TABLE_BUSY");
            assertThat(returned.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "revive",
                    "expectedVersion", receipt.at("/payload/version").asLong(), "input", Map.of("kind", "roll")))
                    .at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(lifecycle.left).hasSize(1);
            assertThat(reservation.reservations).hasValue(1);

            for (int index = 2; index < count; index++) {
                assertThat(players.get(index).request("GAME_FORFEIT", Map.of("gameId", GAME,
                        "actionId", "forfeit-" + index)).path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
                if (index < count - 1) {
                    players.get(index).state("ELIMINATED");
                    assertThat(summary().path("status").asText()).isEqualTo("PLAYING");
                    assertThat(lifecycle.finished).isEmpty();
                }
            }
            for (var player : players) { player.state("FINISHED"); }
            var ended = viewer.await(message -> message.path("type").asText().equals("GAME_STATE")
                    && message.at("/payload/publicState/status").asText().equals("FINISHED"));
            assertPublic(ended);
            assertThat(summary().path("status").asText()).isEqualTo("SETTLING");
            assertThat(summary().path("gameId").isNull()).isTrue();
            assertThat(summary().path("occupiedSeats").asInt()).isEqualTo(count);
            assertThat(summary().path("readyCount").asInt()).isZero();
            assertThat(lifecycle.left).hasSize(count - 1);
            assertThat(lifecycle.finished).hasSize(1);
            var finished = lifecycle.finished.getFirst();
            assertThat(finished.participants()).hasSize(count);
            assertThat(finished.participants().stream().filter(p -> p.result() == GameFinished.Result.FORFEIT))
                    .hasSize(count - 1);
            assertThat(finished.participants().stream().filter(p -> p.result() == GameFinished.Result.WIN)
                    .map(GameFinished.Participant::userId)).containsExactly(101L);
            assertThat(returned.request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 1, "expectedVersion", 0))
                    .at("/payload/code").asText()).isEqualTo("TABLE_BUSY");

            // 저장/정산은 대역이다. 전체 최초 참가자와 맞지 않는 SETTLED는 다음 판을 열 수 없다.
            var participants = users.stream().map(user -> new GameResultView.Participant(user.toString(),
                    user == 101 ? "WIN" : "FORFEIT")).toList();
            var partial = result(code, participants.subList(0, count - 1), GameResultView.SettlementStatus.SETTLED, 1);
            events.publishEvent(new GameResultCommitted(partial));
            assertThat(summary().path("status").asText()).isEqualTo("SETTLING");
            var settled = result(code, participants, GameResultView.SettlementStatus.SETTLED, 2);
            results.saved.put(202L, settled);
            var replay = returned.request("GAME_RESULT_CHECK", Map.of("gameSessionId", GAME));
            assertThat(replay.at("/payload/participants")).hasSize(count);
            assertThat(replay.at("/payload/myCoinDelta").asLong()).isEqualTo(-1);
            returned.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/phase").asText().equals("WAITING"));
            assertThat(summary().path("status").asText()).isEqualTo("WAITING");
            for (int index = 0; index < count - 1; index++) {
                players.get(index).request("TABLE_JOIN", Map.of("tableId", TABLE));
                players.get(index).request("READY_SET", Map.of("ready", true));
            }
            assertThat(reservation.reservations).hasValue(1);
            players.getLast().request("TABLE_JOIN", Map.of("tableId", TABLE));
            players.getLast().request("READY_SET", Map.of("ready", true));
            var next = tableState(viewer, GAME + "-2");
            for (var player : players) { player.state("RESTORED"); }
            assertThat(next.path("seats").findValues("userId")).filteredOn(value -> !value.isNull()).hasSize(count);
            assertThat(returned.request("GAME_FORFEIT", command).at("/payload/code").asText())
                    .isEqualTo("GAME_RECOVERY_REQUIRED");
            events.publishEvent(new GameResultCommitted(settled));
            hub.roundEnded(TABLE, GAME);
            assertThat(summary().path("gameId").asText()).isEqualTo(GAME + "-2");
            assertThat(reservation.reservations).hasValue(2);
            var nextState = returned.request("GAME_STATE_CHECK", Map.of("gameId", GAME + "-2"));
            assertThat(nextState.at("/payload/role").asText()).isEqualTo("PLAYER");
            if (code.equals("ONE_CARD")) {
                assertThat(nextState.at("/payload/privateState/hand")).hasSize(7);
            }
            String turn = nextState.at("/payload/publicState/turnUserId").asText();
            var current = players.stream().filter(player -> player.userId.equals(turn)).findFirst().orElseThrow();
            if (code.equals("ONE_CARD")) {
                assertThat(current.request("GAME_ACTION_SEND", Map.of("gameId", GAME + "-2", "actionId", "during-deal",
                        "expectedVersion", 0, "input", Map.of("kind", "draw")))
                        .at("/payload/code").asText()).isEqualTo("GAME_ACTION_INVALID_ACTION");
                clock.advanceSeconds(4); // 3~4인 손패 분배 완료 뒤 새 경기의 첫 입력을 검증한다.
            }
            assertThat(current.request("GAME_ACTION_SEND", Map.of("gameId", GAME + "-2", "actionId", "fresh-round",
                    "expectedVersion", 0, "input", Map.of("kind", code.equals("ONE_CARD") ? "draw" : "roll")))
                    .path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            Files.writeString(Path.of("build/multiplayer-forfeit-" + code + "-" + count + ".json"),
                    mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("receipt", receipt,
                            "continuingPublicState", continuing, "endedPublicState", ended,
                            "storedResult", replay, "nextRound", next, "newPlayerState", nextState)));
        } finally {
            for (var player : players) { player.close(); }
        }
    }

    private GameResultView result(String code, List<GameResultView.Participant> participants,
            GameResultView.SettlementStatus status, long version) {
        return new GameResultView(202, version, GAME, code, GameResultView.Status.FINISHED,
                lifecycle.finished.getFirst().endReason(), status,
                1, participants, status == GameResultView.SettlementStatus.PENDING ? null : -1L, clock.instant());
    }

    private void assertPublic(JsonNode state) {
        assertThat(state.path("type").asText()).isEqualTo("GAME_STATE");
        assertThat(state.at("/payload/role").asText()).isEqualTo("SPECTATOR");
        assertThat(state.at("/payload/privateState").isEmpty()).isTrue();
        assertThat(state.at("/payload/publicState").toString()).doesNotContain("\"hand\"", "\"privateState\"", "\"die\"");
    }

    private JsonNode tableState(ScenarioClient viewer, String id) throws Exception {
        return viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE")
                && message.at("/payload/gameId").asText().equals(id)).path("payload");
    }

    private JsonNode summary() throws Exception {
        var response = http("GET", "/api/v1/tables?channelId=one", 707);
        assertThat(response.statusCode()).isEqualTo(200);
        for (JsonNode table : mapper.readTree(response.body()).path("tables")) {
            if (table.path("tableId").asText().equals(TABLE)) { return table; }
        }
        throw new AssertionError("검증 테이블 없음");
    }

    private ScenarioClient connect(long user, String phase) throws Exception {
        var response = http("POST", "/api/v1/auth/websocket-ticket", user);
        assertThat(response.statusCode()).isEqualTo(200);
        var client = new ScenarioClient(port, Long.toString(user), mapper.readTree(response.body()).path("ticket").asText());
        client.state(phase);
        assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "one")).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
        return client;
    }

    private HttpResponse<String> http(String method, String path, long user) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
