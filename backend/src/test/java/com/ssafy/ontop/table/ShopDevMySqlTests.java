package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 새 격리 DB의 dev,db 상점/장착/소켓 흐름. 위치 시간만 fixture, 인증·구매·저장은 실제 구현이다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(FrozenWorldFixture.class)
class ShopDevMySqlTests {
    private static final String ORIGIN = "https://dev.on-top.world";
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired Environment environment;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private final Map<Long, String> tokens = new HashMap<>();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry properties) {
        String url = System.getenv("TEST_SHOP_DEV_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_dev_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("새 loopback ontop_shop_test_dev_ 검증 DB가 필요합니다.");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
        properties.add("SHOP_ENABLED", () -> "true");
        // 기존 V100만 명시적으로 포함한다. 공유 DB의 이력/locations는 변경하지 않는다.
        properties.add("spring.flyway.locations", () -> "classpath:db/migration,classpath:db/shop,"
                + "classpath:db/minigame");
    }

    @Test
    void dev에서_예약금보호_구매재시도_보유장착_같은채널전파_재접속을_연결한다() throws Exception {
        assertThat(environment.getActiveProfiles()).contains("dev", "db").doesNotContain("local");
        assertThat(environment.getProperty("ontop.shop.enabled", Boolean.class)).isTrue();
        for (long user : new long[]{101, 202}) {
            jdbc.update("""
                    INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,
                        created_at,updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', NOW(3), NOW(3))
                    """, user, "dev-shop-" + user, "shop" + user);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,100,30)", user);
            tokens.put(user, issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken());
        }
        jdbc.update("""
                INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale)
                VALUES (1,'DEV_TOP','검증 의상','EQUIPMENT','TOP',10,'synthetic-top',TRUE),
                       (2,'DEV_COSTLY','잔액 검증','EQUIPMENT','TOP',80,'synthetic-costly',TRUE)
                """);
        try (var buyer = connect(101); var viewer = connect(202)) {
            buyer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            viewer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            assertThat(send(101, "GET", "/api/v1/shop/items", null, null).statusCode()).isEqualTo(200);
            var bought = send(101, "POST", "/api/v1/shop/purchases", "{\"itemId\":1,\"quantity\":1}", "buy");
            assertThat(bought.statusCode()).isEqualTo(200);
            var receipt = json.readTree(bought.body());
            assertThat(receipt.path("balanceAfter").asLong()).isEqualTo(90);
            assertThat(send(101, "POST", "/api/v1/shop/purchases", "{\"itemId\":1,\"quantity\":1}", "buy")
                    .body()).isEqualTo(bought.body());
            var duplicate = send(101, "POST", "/api/v1/shop/purchases",
                    "{\"itemId\":1,\"quantity\":1}", "duplicate");
            assertThat(duplicate.statusCode()).isEqualTo(409);
            assertThat(duplicate.body()).contains("ITEM_ALREADY_OWNED");
            var reserved = send(101, "POST", "/api/v1/shop/purchases",
                    "{\"itemId\":2,\"quantity\":1}", "reserved");
            assertThat(reserved.statusCode()).isEqualTo(409);
            assertThat(reserved.body()).contains("INSUFFICIENT_BALANCE");
            var inventory = send(101, "GET", "/api/v1/users/me/items", null, null);
            assertThat(inventory.statusCode()).isEqualTo(200);
            assertThat(json.readTree(inventory.body()).path("items")).hasSize(1);
            String equipped = "{\"userItemId\":" + receipt.path("userItemId").asLong() + "}";
            assertThat(send(101, "PATCH", "/api/v1/users/me/equipment", equipped, null).statusCode()).isEqualTo(200);
            buyer.await(this::hasEquipment);
            viewer.await(this::hasEquipment);
            assertThat(send(202, "PATCH", "/api/v1/users/me/equipment", equipped, null).statusCode()).isEqualTo(404);
            buyer.close();
            viewer.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.path("payload").path("avatars").findValuesAsText("userId").stream()
                            .noneMatch("101"::equals));
            try (var restored = connect(101)) {
                restored.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
                restored.await(this::hasEquipment);
            }
        }
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(90);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class))
                .isEqualTo(30);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=202", Long.class)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='SHOP_PURCHASE'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM shop_purchases", Integer.class)).isEqualTo(1);
    }

    private boolean hasEquipment(JsonNode message) {
        if (!message.path("type").asText().equals("WORLD_STATE")) {
            return false;
        }
        for (var avatar : message.path("payload").path("avatars")) {
            if (avatar.path("userId").asText().equals("101")
                    && avatar.path("equipment").findValuesAsText("itemCode").contains("DEV_TOP")) {
                return true;
            }
        }
        return false;
    }

    private ScenarioClient connect(long user) throws Exception {
        var response = send(user, "POST", "/api/v1/auth/websocket-ticket", null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        return new ScenarioClient(port, Long.toString(user), json.readTree(response.body()).path("ticket").asText(),
                ORIGIN);
    }

    private HttpResponse<String> send(long user, String method, String path, String body, String key) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Authorization", "Bearer " + tokens.get(user)).header("Origin", ORIGIN);
        if (key != null) {
            request.header("Idempotency-Key", key);
        }
        if (body != null) {
            request.header("Content-Type", "application/json");
        }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
