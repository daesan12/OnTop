package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.LocalGameStartGateway;
import com.ssafy.ontop.table.service.TableHub;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** Real dev channel/WS/engines. Account lookup, reservation and stored results are test doubles. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.websocket.authenticated=true", "GAME_START_ENABLED=true", "GAME_OMOK_ENABLED=true",
        "GAME_FARKLE_ENABLED=true", "GAME_ONECARD_ENABLED=true", "GAME_BRIDGE_ENABLED=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@ActiveProfiles("dev")
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class, MemberAuthenticationFixture.class})
class DevCommittedStartFlowTests {
    private static final String GAME = "committed-test-game";
    @Autowired Environment environment;
    @Autowired ApplicationContext context;
    @Autowired AccessJwtService jwt;
    @Autowired OmokEngine engine;
    @Autowired OmokFlowTests.TestClock clock;
    @Autowired TableHub hub;
    @Autowired CommittedStartFlowTests.ReservationDouble reservation;
    @Autowired CommittedStartFlowTests.ResultStoreDouble results;
    @Autowired ApplicationEventPublisher events;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock oauthClock;
    @LocalServerPort int port;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void 회원과_DB경계는_대역으로_명시한다() {
        when(oauthClock.instant()).thenAnswer(invocation -> clock.instant());
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(accounts.findActive(202, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(202,
                VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void dev채널_예약확정_착수_재접속_종료_정산_다음판을_연결한다() throws Exception {
        assertThat(environment.getActiveProfiles()).contains("dev").doesNotContain("local", "prod", "production");
        assertThat(context.getBeansOfType(LocalGameStartGateway.class)).isEmpty();
        String tableId = hub.listTables("channel-1").tables().getFirst().tableId();
        try (var first = connect(101, "LOBBY"); var second = connect(202, "LOBBY")) {
            for (var client : List.of(first, second)) {
                assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")).path("type").asText())
                        .isEqualTo("CHANNEL_STATE");
                assertThat(client.request("TABLE_JOIN", Map.of("tableId", tableId)).path("type").asText())
                        .isEqualTo("TABLE_STATE");
            }
            first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(engine.load(101, GAME)).isEmpty();
            reservation.release.countDown();
            playing(first, GAME);
            first.state("RESTORED"); second.state("RESTORED");
            assertThat(reservation.lastCommand.tableId()).isEqualTo(tableId);
            assertThat(first.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "dev-first",
                    "expectedVersion", 0, "input", Map.of("x", 7, "y", 7))).path("type").asText())
                    .isEqualTo("GAME_ACTION_RESULT");
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(29);
            try (var restored = connect(202, "RESTORED")) {
                assertThat(restored.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("type").asText())
                        .isEqualTo("GAME_STATE");
                for (long user : new long[]{101, 202}) {
                    results.saved.put(user, result(user, GameResultView.SettlementStatus.PENDING));
                }
                clock.advanceSeconds(1); engine.tick();
                boolean[] pending = new boolean[2];
                first.await(message -> {
                    pending[0] |= resultStatus(message, "PENDING");
                    pending[1] |= phase(message, "SETTLING");
                    return pending[0] && pending[1];
                });
                assertThat(first.request("READY_SET", Map.of("ready", true)).path("payload").path("code").asText())
                        .isEqualTo("TABLE_BUSY");
                for (long user : new long[]{101, 202}) {
                    var settled = result(user, GameResultView.SettlementStatus.SETTLED);
                    results.saved.put(user, settled);
                    events.publishEvent(new GameResultCommitted(settled));
                }
                boolean[] received = new boolean[2];
                first.await(message -> {
                    received[0] |= resultStatus(message, "SETTLED");
                    received[1] |= phase(message, "WAITING");
                    return received[0] && received[1];
                });
                restored.await(message -> resultStatus(message, "SETTLED"));
                assertThat(hub.listTables("channel-1").tables().getFirst().readyCount()).isZero();
                first.request("READY_SET", Map.of("ready", true));
                restored.request("READY_SET", Map.of("ready", true));
                playing(first, GAME + "-2");
                assertThat(reservation.reservations).hasValue(2);
            }
        }
    }

    private GameResultView result(long user, GameResultView.SettlementStatus status) {
        boolean settled = status == GameResultView.SettlementStatus.SETTLED;
        return new GameResultView(user, settled ? 2 : 1, GAME, "OMOK", GameResultView.Status.FINISHED,
                "TURN_TIMEOUT", status, 1, List.of(new GameResultView.Participant("101", "WIN"),
                new GameResultView.Participant("202", "LOSE")), settled ? (user == 101 ? 1L : -1L) : null, clock.instant());
    }

    private boolean phase(JsonNode message, String phase) {
        return message.path("type").asText().equals("GAME_START_STATE")
                && message.path("payload").path("phase").asText().equals(phase);
    }

    private boolean resultStatus(JsonNode message, String status) {
        return message.path("type").asText().equals("GAME_RESULT")
                && message.path("payload").path("settlementStatus").asText().equals(status);
    }

    private void playing(ScenarioClient client, String id) throws Exception {
        client.await(message -> phase(message, "PLAYING")
                && message.path("payload").path("gameSessionId").asText().equals(id));
    }

    private ScenarioClient connect(long user, String phase) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client = new ScenarioClient(port, Long.toString(user), json.readTree(response.body()).path("ticket").asText());
            client.state(phase);
            return client;
        }
    }
}
