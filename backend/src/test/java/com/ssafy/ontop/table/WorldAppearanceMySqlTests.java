package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.shop.service.ShopService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.shop.enabled=true", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=3", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=3"
})
@Import(FrozenWorldFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldAppearanceMySqlTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    private final Map<Long, String> accessTokens = new HashMap<>();
    @Autowired ShopService shop;
    @Autowired TableHub hub;
    @Autowired WorldProfileGateway profiles;
    @Autowired PlatformTransactionManager transactions;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SHOP_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("격리된 loopback 상점 테스트 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        accessTokens.clear();
        for (String table : List.of("shop_purchases", "wallet_transactions", "user_items", "wallets",
                "items", "refresh_tokens", "users")) { jdbc.update("DELETE FROM " + table); }
        for (long id : new long[]{101, 202, 303}) {
            jdbc.update("""
                    INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender,
                        created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', NOW(3), NOW(3))
                    """, id, "appearance-" + id, "look" + id);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 0)", id);
            accessTokens.put(id, issuer.issueExisting(new LoginOutcome(
                    OAuthProvider.NAVER, LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken());
        }
        for (long id : new long[]{1, 2}) {
            String code = id == 1 ? "RED_TOP" : "BLUE_TOP";
            jdbc.update("""
                    INSERT INTO items(id, item_code, name, item_type, equip_slot, price, image_key, is_for_sale)
                    VALUES (?, ?, ?, 'EQUIPMENT', 'TOP', 10, ?, TRUE)
                    """, id, code, code, "demo-" + code.toLowerCase());
        }
    }

    @Test
    void 실제회원프로필은공개필드만조회하고_닉네임변경과재접속에반영한다() throws Exception {
        jdbc.update("UPDATE users SET character_gender='FEMALE' WHERE id=202");
        assertThat(profiles.profiles(java.util.Set.of(101L, 202L, 999L))).hasSize(2)
                .containsEntry(202L, new WorldProfileGateway.Profile("look202", "FEMALE"));
        try (var first = connect(101); var second = connect(202); var other = connect(303)) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            other.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            first.await(message -> publicProfile(message, "202", "look202", "FEMALE"));
            var updated = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/users/me")).header("Authorization", "Bearer " + accessTokens.get(202L))
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"nickname\":\"새로운닉네임\"}"))
                    .build(), HttpResponse.BodyHandlers.ofString());
            assertThat(updated.statusCode()).isEqualTo(200);
            hub.refreshProfiles();
            JsonNode changed = first.await(message -> publicProfile(message, "202", "새로운닉네임", "FEMALE"));
            assertThat(changed.toString()).doesNotContain("providerUserId", "loginProvider", "accessToken");
            other.assertNoMessage(message -> publicProfile(message, "202", "새로운닉네임", "FEMALE"));
            second.request("CHANNEL_LEAVE", Map.of());
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            second.await(message -> publicProfile(message, "202", "새로운닉네임", "FEMALE"));
            System.out.println("[PUBLIC_PROFILE_STATE] " + changed);
        }
        jdbc.update("UPDATE users SET deleted_at=NOW(3) WHERE id=202");
        assertThat(profiles.profiles(java.util.Set.of(202L))).isEmpty();
    }

    private boolean publicProfile(JsonNode message, String userId, String nickname, String gender) {
        if (!message.path("type").asText().equals("WORLD_STATE")) {
            return false;
        }
        for (JsonNode avatar : message.path("payload").path("avatars")) {
            if (avatar.path("userId").asText().equals(userId)
                    && avatar.path("nickname").asText().equals(nickname)
                    && avatar.path("characterGender").asText().equals(gender)) {
                return true;
            }
        }
        return false;
    }

    @Test
    void 실제장착커밋은같은채널에만전송하고_오프라인변경도재접속입장때복구한다() throws Exception {
        long red = shop.purchase(101, 1, 1, "red").userItemId();
        long blue = shop.purchase(101, 2, 1, "blue").userItemId();
        try (var viewer = connect(202); var otherChannel = connect(303)) {
            viewer.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            otherChannel.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            try (var wearer = connect(101)) {
                wearer.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                assertThat(equip(red).statusCode()).isEqualTo(200);
                wearer.await(message -> WorldAppearanceFlowTests.hasItem(message, "RED_TOP"));
                JsonNode state = viewer.await(message -> WorldAppearanceFlowTests.hasItem(message, "RED_TOP"));
                var item = state.path("payload").path("avatars").findValues("equipment").stream()
                        .filter(value -> value.isArray() && !value.isEmpty()).findFirst().orElseThrow().get(0);
                assertThat(item.properties()).extracting(Map.Entry::getKey)
                        .containsExactlyInAnyOrder("itemId", "itemCode", "equipSlot", "imageKey");
                otherChannel.assertNoMessage(message -> WorldAppearanceFlowTests.hasItem(message, "RED_TOP"));
                new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    shop.equip(101, blue); status.setRollbackOnly();
                });
                viewer.assertNoMessage(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
            }
            viewer.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.path("payload").path("avatars").findValuesAsText("userId").stream()
                            .noneMatch("101"::equals));
            assertThat(equip(blue).statusCode()).isEqualTo(200);
            try (var restored = connect(101)) {
                restored.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                restored.await(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
                viewer.await(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
                otherChannel.assertNoMessage(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
            }
        }
    }

    @Test
    void 장착후이동입력_착석준비_heartbeat정리와재입장을한흐름으로확인한다() throws Exception {
        long red = shop.purchase(101, 1, 1, "flow-red").userItemId();
        long blue = shop.purchase(101, 2, 1, "flow-blue").userItemId();
        String tableId = tables().get(0).path("tableId").asText();
        try (var wearer = connect(101); var partner = connect(202)) {
            wearer.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            partner.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(equip(red).statusCode()).isEqualTo(200);
            wearer.await(message -> WorldAppearanceFlowTests.hasItem(message, "RED_TOP"));
            partner.await(message -> WorldAppearanceFlowTests.hasItem(message, "RED_TOP"));
            JsonNode move = wearer.request("WORLD_MOVE",
                    Map.of("seq", 1, "dx", 1, "dz", 0, "run", false, "jump", false));
            assertThat(move.path("type").asText()).isEqualTo("WORLD_STATE");
            assertThat(WorldAppearanceFlowTests.hasItem(move, "RED_TOP")).isTrue();
            assertThat(avatar(move, "101").path("position").path("lastInputSeq").asInt()).isEqualTo(1);

            assertThat(wearer.request("TABLE_JOIN", Map.of("tableId", tableId)).path("type").asText())
                    .isEqualTo("TABLE_STATE");
            partner.request("TABLE_JOIN", Map.of("tableId", tableId));
            wearer.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
            wearer.request("READY_SET", Map.of("ready", true));
            assertThat(partner.request("READY_SET", Map.of("ready", true))
                    .path("payload").path("allReady").asBoolean()).isTrue();
            JsonNode ready = tables().get(0);
            assertThat(ready.path("occupiedSeats").asInt()).isEqualTo(2);
            assertThat(ready.path("readyCount").asInt()).isEqualTo(2);
            // 실제 경기 DB Gateway는 연결하지 않는다. 준비 완료와 경기/차감 확정을 구분한다.
            assertThat(ready.path("status").asText()).isEqualTo("WAITING");

            assertThat(equip(blue).statusCode()).isEqualTo(200);
            wearer.await(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
            partner.await(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
            assertThat(tables().get(0)).isEqualTo(ready); // 장착 갱신이 좌석·준비·버전을 바꾸지 않는다.
            wearer.stopPong();
            assertThat(wearer.awaitClose()).isEqualTo(1001);
            partner.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("seats").findValuesAsText("userId").stream()
                            .noneMatch("101"::equals));
            JsonNode cleaned = tables().get(0);
            assertThat(cleaned.path("occupiedSeats").asInt()).isEqualTo(1);
            assertThat(cleaned.path("readyCount").asInt()).isZero();

            try (var restored = connect(101)) {
                restored.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                JsonNode recovered = restored.await(message -> WorldAppearanceFlowTests.hasItem(message, "BLUE_TOP"));
                assertThat(avatar(recovered, "101").path("position").path("lastInputSeq").asInt()).isZero();
                assertThat(restored.request("READY_SET", Map.of("ready", true))
                        .path("payload").path("code").asText()).isEqualTo("NOT_SEATED");
                restored.request("TABLE_JOIN", Map.of("tableId", tableId));
                assertThat(tables().get(0).path("readyCount").asInt()).isZero();
                partner.request("READY_SET", Map.of("ready", true));
                assertThat(restored.request("READY_SET", Map.of("ready", true))
                        .path("payload").path("allReady").asBoolean()).isTrue();
                System.out.println("[APPEARANCE_FLOW] 실제 JWT/HTTP/MySQL/RawWS: 장착→이동 입력→착석/전원준비→장착변경→heartbeat→새티켓/채널입장→외형복구/재착석 PASS. 물리 시간 고정, 경기 DB 차감·3D 렌더링 검증 아님.");
                System.out.println("[PUBLIC_WORLD_STATE] " + recovered);
                restored.request("TABLE_LEAVE", Map.of());
            }
            partner.request("TABLE_LEAVE", Map.of());
        }
    }

    private JsonNode tables() throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/tables?channelId=a")).header("Authorization", "Bearer " + accessTokens.get(101L))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body()).path("tables");
    }

    private JsonNode avatar(JsonNode message, String userId) {
        for (var avatar : message.path("payload").path("avatars")) {
            if (avatar.path("userId").asText().equals(userId)) { return avatar; }
        }
        throw new AssertionError("아바타 없음: " + userId);
    }

    private ScenarioClient connect(long userId) throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + accessTokens.get(userId))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return new ScenarioClient(port, Long.toString(userId), mapper.readTree(response.body()).path("ticket").asText());
    }

    private HttpResponse<String> equip(long ownedId) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/users/me/equipment")).header("Authorization", "Bearer " + accessTokens.get(101L))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"userItemId\":" + ownedId + "}"))
                .build(), HttpResponse.BodyHandlers.ofString());
    }
}
