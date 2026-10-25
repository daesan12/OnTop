package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@ActiveProfiles({"dev", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
@Import(RankingMySqlTests.SqlConfiguration.class)
class RankingMySqlTests {
    @LocalServerPort private int port;
    @Autowired private UserRepository users;
    @Autowired private WalletInitializationService initializer;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ReadInspector inspector;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("랭킹 검증은 새로 생성한 격리 loopback MySQL DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 실제_지갑과JWT로_동점_본인순위_탈퇴제외_예약금불변을_한흐름으로_확인한다() throws Exception {
        User missing = member("미생성");
        String missingToken = access(missing);
        var empty = get(missingToken, 20);
        assertThat(empty.path("items").isEmpty()).isTrue();
        assertThat(empty.path("myRank").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallets", Long.class)).isZero();

        User first = member("선두가");
        User second = member("선두나");
        User mine = member("본인");
        User deleted = member("탈퇴");
        for (User user : List.of(first, second, mine, deleted)) {
            initializer.initializeActiveMember(user.getId());
        }
        jdbc.update("UPDATE wallets SET balance=300,reserved_balance=300 WHERE user_id=?", first.getId());
        jdbc.update("UPDATE wallets SET balance=300 WHERE user_id=?", second.getId());
        jdbc.update("UPDATE wallets SET balance=99999 WHERE user_id=?", deleted.getId());
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", deleted.getId());
        String mineToken = access(mine);
        var before = jdbc.queryForList("SELECT * FROM wallets ORDER BY id");
        long ledgerBefore = jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class);
        var schemaBefore = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");

        inspector.recording = true;
        JsonNode topOne;
        List<ReadInspector.Statement> statements;
        try {
            topOne = get(mineToken, 1);
        } finally {
            inspector.recording = false;
            statements = List.copyOf(inspector.statements);
        }
        assertThat(topOne.path("items").size()).isEqualTo(1);
        assertThat(topOne.at("/items/0/userId").asText()).isEqualTo(first.getId().toString());
        assertThat(topOne.at("/items/0/coinBalance").asLong()).isEqualTo(300);
        assertThat(topOne.at("/myRank/rank").asLong()).isEqualTo(3);
        assertThat(topOne.at("/myRank/coinBalance").asLong()).isEqualTo(100);

        var all = get(mineToken, 100);
        assertThat(all.path("items").size()).isEqualTo(3);
        assertThat(all.path("items").findValuesAsText("rank")).containsExactly("1", "1", "3");
        assertThat(all.at("/items/1/userId").asText()).isEqualTo(second.getId().toString());
        assertThat(get(missingToken, 20).path("myRank").isNull()).isTrue();
        assertThat(jdbc.queryForList("SELECT * FROM wallets ORDER BY id")).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class)).isEqualTo(ledgerBefore);
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank"))
                .isEqualTo(schemaBefore);
        assertThat(statements).isNotEmpty().allSatisfy(statement -> {
            assertThat(statement.sql()).startsWith("select ");
            assertThat(statement.sql()).doesNotContain("for update", "for share");
            assertThat(statement.readOnly()).isTrue();
        });
        assertThat(statements).filteredOn(statement -> statement.sql().contains("rank() over")).hasSize(1);

        // 다른 기능에서 커밋한 새 잔액이 다음 조회에 반영된다. 조회 자체는 수정하지 않는다.
        jdbc.update("UPDATE wallets SET balance=400 WHERE user_id=?", mine.getId());
        var changed = get(mineToken, 20);
        assertThat(changed.at("/items/0/userId").asText()).isEqualTo(mine.getId().toString());
        assertThat(changed.path("items").findValuesAsText("rank")).containsExactly("1", "2", "2");
        assertThat(changed.at("/myRank/rank").asLong()).isEqualTo(1);
        Files.writeString(Path.of("build/ranking-verification.json"), mapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(Map.of("topOne", topOne, "ties", all, "afterCommittedBalance", changed,
                        "rankingSelects", 1, "readOnly", true, "schemaUnchanged", true)));
    }

    private User member(String nickname) {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "ranking-" + UUID.randomUUID(),
                nickname, CharacterGender.MALE));
    }

    private String access(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
    }

    private JsonNode get(String token, int limit) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                            + "/api/v1/rankings?limit=" + limit))
                    .header("Authorization", "Bearer " + token).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            return mapper.readTree(response.body());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlConfiguration {
        @Bean ReadInspector rankingReadInspector() {
            return new ReadInspector();
        }

        @Bean HibernatePropertiesCustomizer rankingSqlCustomizer(ReadInspector inspector) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", inspector);
        }
    }

    static class ReadInspector implements StatementInspector {
        private final ConcurrentLinkedQueue<Statement> statements = new ConcurrentLinkedQueue<>();
        private volatile boolean recording;

        @Override
        public String inspect(String sql) {
            if (recording) {
                statements.add(new Statement(sql.stripLeading().toLowerCase(Locale.ROOT),
                        TransactionSynchronizationManager.isCurrentTransactionReadOnly()));
            }
            return sql;
        }

        record Statement(String sql, boolean readOnly) { }
    }
}
