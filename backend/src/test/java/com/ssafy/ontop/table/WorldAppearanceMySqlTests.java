package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.shop.ShopService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.shop.enabled=true", "ontop.websocket.authenticated=true",
        "ontop.shop.duplicate-equipment-policy=REJECT",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop-fixture,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=3", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=3"
})
@Import(FrozenWorldFixture.class)
class WorldAppearanceMySqlTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccessJwtService jwt;
    @Autowired ShopService shop;
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
        for (String table : List.of("shop_purchases", "wallet_transactions", "user_items", "wallets",
                "items", "refresh_tokens", "users")) { jdbc.update("DELETE FROM " + table); }
        for (long id : new long[]{101, 202, 303}) {
            jdbc.update("""
                    INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender,
                        created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', NOW(3), NOW(3))
                    """, id, "appearance-" + id, "look" + id);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 0)", id);
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

    private ScenarioClient connect(long userId) throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(userId))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return new ScenarioClient(port, Long.toString(userId), mapper.readTree(response.body()).path("ticket").asText());
    }

    private HttpResponse<String> equip(long ownedId) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/users/me/equipment")).header("Authorization", "Bearer " + jwt.issue(101))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"userItemId\":" + ownedId + "}"))
                .build(), HttpResponse.BodyHandlers.ofString());
    }
}
