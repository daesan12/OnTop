package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.persistence.GameEventDelivery;
import com.ssafy.ontop.game.result.persistence.GameResultNotifications;
import com.ssafy.ontop.game.rummikub.domain.RummikubRules.Placed;
import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 DB·인증·엔진·소켓·HTTP 계약 검증. 3D 공원/공용 서버 검수를 대신하지 않는다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "server.address=127.0.0.1",
        "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true", "ontop.games.rummikub.enabled=true",
        // 처리 순서를 고정한다. 실제 저장/정산/outbox 구현을 직접 실행하며 DB 대역은 사용하지 않는다.
        "ontop.game-recovery.background-enabled=false",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(RummikubSettlementWalletFlowMySqlTests.DeckFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RummikubSettlementWalletFlowMySqlTests {
    private static final List<Map<String, Object>> EVIDENCE = new ArrayList<>();
    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private GameEventDelivery delivery;
    @Autowired private GameResultNotifications notifications;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TableHub hub;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_RUMMIKUB_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_supae_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("종료·잔액 흐름은 전용 loopback 검증 DB에서만 실행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @ParameterizedTest
    @CsvSource({"false, 0", "true, 0", "false, 5", "true, 5"})
    void 실제경기종료_정산알림직후_잔액조회와_퇴장재접속을_검증한다(boolean forfeit, long bet) throws Exception {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version='185' AND success=1", Integer.class))
                .isEqualTo(1);
        Member winner = member();
        Member loser = member();
        Member outsider = member();
        try (var first = connect(winner); var second = connect(loser); var observer = connect(outsider)) {
            assertType(first.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
            assertType(second.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
            assertType(first.request("GAME_SELECT", Map.of("gameCode", "RUMMIKUB", "betAmountPerPlayer", bet)), "TABLE_STATE");
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            String game = first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.at("/payload/phase").asText().equals("PLAYING")).at("/payload/gameSessionId").asText();
            first.state("RESTORED");
            second.state("RESTORED");
            assertWallet(winner, 100, bet);
            assertWallet(loser, 100, bet);

            if (forfeit) {
                assertType(second.request("GAME_FORFEIT", Map.of("gameId", game, "actionId", "wallet-flow-forfeit")),
                        "GAME_FORFEIT_RESULT");
                // 정산 전에도 기권자의 착석과 복구 입력은 즉시 해제한다.
                second.state("LOBBY");
                assertThat(second.request("TABLE_LEAVE", Map.of()).at("/payload/code").asText()).isEqualTo("NOT_SEATED");
            } else {
                JsonNode state = first.request("GAME_STATE_CHECK", Map.of("gameId", game));
                assertThat(state.at("/payload/publicState/gameCode").asText()).isEqualTo("RUMMIKUB");
                assertThat(state.at("/payload/publicState/turnUserId").asText()).isEqualTo(winner.id());
                assertType(first.request("GAME_ACTION_SEND", Map.of("gameId", game, "actionId", "empty-hand",
                        "expectedVersion", state.at("/payload/version").asLong(), "input", Map.of(
                                "kind", "play", "melds", List.of(run("RED"), run("BLUE"))))), "GAME_ACTION_RESULT");
            }

            observer.assertNoMessageDuring(RummikubSettlementWalletFlowMySqlTests::isResult, () -> {
                assertThat(delivery.drain(50)).isPositive();
                assertThat(notifications.dispatchOnce(50)).isPositive();
                JsonNode won = settled(first, game);
                // 알림 수신 직후 조회한다. 임의 대기나 잔액 재계산 없이 DB 커밋 결과가 보여야 한다.
                JsonNode winnerWallet = assertWallet(winner, 100 + bet, 0);
                JsonNode lost = forfeit ? second.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game))
                        : settled(second, game);
                JsonNode loserWallet = assertWallet(loser, 100 - bet, 0);
                assertThat(won.at("/payload/myCoinDelta").asLong()).isEqualTo(bet);
                assertThat(lost.at("/payload/myCoinDelta").asLong()).isEqualTo(-bet);
                assertWallet(outsider, 100, 0);
                long ledger = ledger(game);
                for (int repeat = 0; repeat < 2; repeat++) {
                    assertThat(first.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game)).path("payload"))
                            .isEqualTo(won.path("payload"));
                    assertThat(second.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game)).path("payload"))
                            .isEqualTo(lost.path("payload"));
                }
                assertThat(observer.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game)).at("/payload/code").asText())
                        .isEqualTo("GAME_RESULT_ACCESS_DENIED");
                assertThat(ledger(game)).isEqualTo(ledger).isEqualTo(4);
                assertThat(notifications.dispatchOnce(50)).isZero();
                first.assertNoMessage(RummikubSettlementWalletFlowMySqlTests::isResult);
                if (forfeit) {
                    assertThat(second.request("TABLE_LEAVE", Map.of()).at("/payload/code").asText())
                            .isEqualTo("NOT_SEATED");
                } else { assertType(second.request("TABLE_LEAVE", Map.of()), "TABLE_LEFT"); }
                second.close();
                // 클라이언트 close() 반환은 서버 중복 접속 슬롯 정리 완료가 아니다.
                long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
                while (hub.metricsSnapshot().activeConnections() != 2 && System.nanoTime() < deadline) {
                    Thread.sleep(10);
                }
                assertThat(hub.metricsSnapshot().activeConnections()).as("이전 연결의 서버 정리 완료").isEqualTo(2);
                try (var returned = connect(loser)) {
                    returned.assertNoMessage(RummikubSettlementWalletFlowMySqlTests::isResult);
                    assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId", game)).at("/payload/code").asText())
                            .isEqualTo("GAME_RECOVERY_REQUIRED");
                    assertThat(returned.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game)).path("payload"))
                            .isEqualTo(lost.path("payload"));
                    assertWallet(loser, 100 - bet, 0);
                }
                EVIDENCE.add(Map.of("scenario", forfeit ? "FORFEIT_SETTLE_THEN_LEAVE" : "EMPTY_HAND",
                        "winnerUserId", winner.id(), "loserUserId", loser.id(), "winnerResult", won,
                        "loserResult", lost, "winnerWallet", winnerWallet, "loserWallet", loserWallet,
                        "ledgerEntries", ledger, "bet", bet, "playerCount", 2));
                assertType(first.request("TABLE_LEAVE", Map.of()), "TABLE_LEFT");
                first.state("LOBBY");
                assertType(first.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
                assertType(first.request("TABLE_LEAVE", Map.of()), "TABLE_LEFT");
                return null;
            });
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {3, 4})
    void 다인전_기권자는_즉시_복귀하고_남은_경기의_판돈은_종료시_한번만_정산한다(int count) throws Exception {
        long bet = 5;
        List<Member> members = new ArrayList<>();
        List<ScenarioClient> players = new ArrayList<>();
        try {
            for (int index = 0; index < count; index++) {
                Member member = member();
                members.add(member);
                ScenarioClient client = connect(member);
                players.add(client);
                assertType(client.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
                if (index == 0) {
                    assertType(client.request("GAME_SELECT", Map.of("gameCode", "RUMMIKUB",
                            "betAmountPerPlayer", bet)), "TABLE_STATE");
                }
            }
            for (ScenarioClient player : players) { player.request("READY_SET", Map.of("ready", true)); }
            ScenarioClient winner = players.getFirst();
            String game = winner.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/phase").asText().equals("PLAYING"))
                    .at("/payload/gameSessionId").asText();
            for (int index = 0; index < count; index++) {
                players.get(index).state("RESTORED");
                assertWallet(members.get(index), 100, bet);
            }

            for (int index = 1; index < count; index++) {
                ScenarioClient leaving = players.get(index);
                var command = Map.of("gameId", game, "actionId", "group-forfeit-" + index);
                assertType(leaving.request("GAME_FORFEIT", command), "GAME_FORFEIT_RESULT");
                leaving.state("LOBBY");
                assertThat(leaving.request("TABLE_LEAVE", Map.of()).at("/payload/code").asText())
                        .isEqualTo("NOT_SEATED");
                assertThat(leaving.request("GAME_FORFEIT", command).at("/payload/duplicate").asBoolean()).isTrue();
                if (index < count - 1) {
                    assertThat(winner.request("GAME_STATE_CHECK", Map.of("gameId", game))
                            .at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
                    assertWallet(members.get(index), 100, bet);
                }
            }
            winner.state("FINISHED");
            assertThat(delivery.drain(50)).isPositive();
            assertThat(notifications.dispatchOnce(50)).isPositive();
            JsonNode won = settled(winner, game);
            assertThat(won.at("/payload/myCoinDelta").asLong()).isEqualTo(bet * (count - 1));
            List<Map<String, Object>> proof = new ArrayList<>();
            long total = 0;
            for (int index = 0; index < count; index++) {
                JsonNode result = players.get(index).request("GAME_RESULT_CHECK", Map.of("gameSessionId", game));
                long delta = index == 0 ? bet * (count - 1) : -bet;
                assertThat(result.at("/payload/myCoinDelta").asLong()).isEqualTo(delta);
                assertThat(result.at("/payload/participants").isArray()).isTrue();
                JsonNode wallet = assertWallet(members.get(index), 100 + delta, 0);
                total += wallet.path("balance").asLong();
                proof.add(Map.of("userId", members.get(index).id(), "result", result, "wallet", wallet));
            }
            assertThat(total).isEqualTo(100L * count);
            assertThat(ledger(game)).isEqualTo(2L * count);
            assertThat(delivery.drain(50)).isZero();
            assertThat(notifications.dispatchOnce(50)).isZero();
            assertThat(ledger(game)).isEqualTo(2L * count);
            assertType(winner.request("TABLE_LEAVE", Map.of()), "TABLE_LEFT");
            winner.state("LOBBY");
            assertType(winner.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_STATE");
            assertType(winner.request("TABLE_LEAVE", Map.of()), "TABLE_LEFT");
            EVIDENCE.add(Map.of("scenario", "MULTIPLAYER_FORFEIT", "bet", bet, "playerCount", count,
                    "players", proof, "ledgerEntries", ledger(game)));
        } finally {
            for (ScenarioClient client : players) { client.close(); }
        }
    }

    private Member member() {
        User user = users.saveAndFlush(new User(LoginProvider.NAVER, "ws72-" + UUID.randomUUID(),
                "T" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE));
        wallets.saveAndFlush(Wallet.forSignup(user.getId(), Instant.now()));
        String token = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
        return new Member(user.getId().toString(), token);
    }

    private ScenarioClient connect(Member member) throws Exception {
        var response = http(member, "/api/v1/auth/websocket-ticket", true);
        assertThat(response.statusCode()).isEqualTo(200);
        var client = new ScenarioClient(port, member.id(), mapper.readTree(response.body()).path("ticket").asText());
        client.state("LOBBY");
        return client;
    }

    private JsonNode assertWallet(Member member, long balance, long reserved) throws Exception {
        var response = http(member, "/api/v1/wallets/me", false);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        JsonNode wallet = mapper.readTree(response.body());
        assertThat(wallet.path("balance").asLong()).isEqualTo(balance);
        assertThat(wallet.path("reservedBalance").asLong()).isEqualTo(reserved);
        assertThat(wallet.path("availableBalance").asLong()).isEqualTo(balance - reserved);
        return wallet;
    }

    private HttpResponse<String> http(Member member, String path, boolean post) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .timeout(java.time.Duration.ofSeconds(5)).header("Authorization", "Bearer " + member.token());
            return client.send((post ? request.POST(HttpRequest.BodyPublishers.noBody()) : request.GET()).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }

    private long ledger(String game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?", Long.class,
                Long.parseLong(game));
    }

    private static JsonNode settled(ScenarioClient client, String game) throws Exception {
        return client.await(m -> isResult(m) && m.at("/payload/gameSessionId").asText().equals(game)
                && m.at("/payload/settlementStatus").asText().equals("SETTLED"));
    }

    private static boolean isResult(JsonNode message) { return message.path("type").asText().equals("GAME_RESULT"); }
    private static void assertType(JsonNode message, String type) {
        assertThat(message.path("type").asText()).as("응답: %s", message).isEqualTo(type);
    }
    private record Member(String id, String token) { }

    @AfterAll
    static void evidence() throws Exception {
        Files.createDirectories(Path.of("build/reports"));
        Files.writeString(Path.of("build/reports/rummikub-settlement-wallet-flow.json"), new ObjectMapper()
                .writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("schemaVersion", 1,
                        "runId", System.getenv().getOrDefault("ONTOP_SETTLEMENT_WIRE_RUN_ID", UUID.randomUUID().toString()),
                        "generatedAt", Instant.now().toString(), "scenarios", EVIDENCE)));
    }

    private static List<Placed> run(String color) {
        return java.util.stream.IntStream.rangeClosed(7, 13)
                .mapToObj(number -> new Placed(color + "-" + number + "-0", color, number)).toList();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DeckFixture {
        @Bean
        static BeanPostProcessor deterministicDeck(ObjectProvider<ObjectMapper> mapper,
                ApplicationEventPublisher events, ObjectProvider<GameEngineRouter> router) {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessBeforeInitialization(Object bean, String name) {
                    if (!name.equals("rummikubEngine")) { return bean; }
                    // 섞기만 고정한다. 인증·엔진·예약·정산·지갑·복구는 실제 구현을 사용한다.
                    return new RummikubEngine(mapper.getObject(), java.time.Clock.systemUTC(),
                            events::publishEvent, router.getObject(), tiles -> {
                                var hand = new ArrayList<>(run("RED"));
                                hand.addAll(run("BLUE"));
                                var ids = new ArrayList<>(hand.stream().map(Placed::id).toList());
                                ids.remove("RED-13-0");
                                ids.addFirst("RED-13-0");
                                for (int index = 0; index < ids.size(); index++) {
                                    String id = ids.get(index);
                                    int source = java.util.stream.IntStream.range(0, tiles.size())
                                            .filter(i -> tiles.get(i).id().equals(id)).findFirst().orElseThrow();
                                    java.util.Collections.swap(tiles, index, source);
                                }
                            }, size -> 0);
                }
            };
        }
    }
}
