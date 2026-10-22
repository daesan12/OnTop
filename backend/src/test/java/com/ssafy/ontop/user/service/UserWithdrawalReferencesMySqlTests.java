package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest(properties = {"ontop.shop.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop-fixture,classpath:db/shop"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class UserWithdrawalReferencesMySqlTests {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private MockMvc mvc;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SHOP_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("참조 데이터 검증은 기존 격리 상점 테스트 DB에서만 수행합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 회원을_참조하는_지갑_예약액_원장_아이템_구매기록과_FK를_보존한다() throws Exception {
        User user = users.saveAndFlush(new User(LoginProvider.SSAFY, "withdrawal-fk-" + UUID.randomUUID(),
                "F" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE));
        String access = issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,1000,50)", user.getId());
        Long walletId = jdbc.queryForObject("SELECT id FROM wallets WHERE user_id=?", Long.class, user.getId());
        String code = "wd-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO items(item_code,name,item_type,price,image_key,is_for_sale)
                VALUES (?,'탈퇴검증','CONSUMABLE',10,'fixture/withdrawal',TRUE)
                """, code);
        Long itemId = jdbc.queryForObject("SELECT id FROM items WHERE item_code=?", Long.class, code);
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) VALUES (?,?,2,FALSE)",
                user.getId(), itemId);
        Long ownedId = jdbc.queryForObject("SELECT id FROM user_items WHERE user_id=? AND item_id=?",
                Long.class, user.getId(), itemId);
        String purchase = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO shop_purchases(purchase_id,user_id,request_key,item_id,quantity,unit_price,
                    total_price,balance_after,user_item_id) VALUES (?,?,?,?,2,10,20,1000,?)
                """, purchase, user.getId(), UUID.randomUUID().toString(), itemId, ownedId);
        String key = "withdrawal-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id,item_id,transaction_type,balance_delta,
                    reserved_delta,idempotency_key) VALUES (?,?,'SHOP_PURCHASE',-20,0,?)
                """, walletId, itemId, key);
        var wallet = jdbc.queryForMap("SELECT * FROM wallets WHERE id=?", walletId);
        var ledger = jdbc.queryForMap("SELECT * FROM wallet_transactions WHERE idempotency_key=?", key);
        var owned = jdbc.queryForMap("SELECT * FROM user_items WHERE id=?", ownedId);
        var receipt = jdbc.queryForMap("SELECT * FROM shop_purchases WHERE purchase_id=?", purchase);

        mvc.perform(delete("/api/v1/users/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isNoContent());

        assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(jdbc.queryForMap("SELECT * FROM wallets WHERE id=?", walletId)).isEqualTo(wallet);
        assertThat(jdbc.queryForMap("SELECT * FROM wallet_transactions WHERE idempotency_key=?", key))
                .isEqualTo(ledger);
        assertThat(jdbc.queryForMap("SELECT * FROM user_items WHERE id=?", ownedId)).isEqualTo(owned);
        assertThat(jdbc.queryForMap("SELECT * FROM shop_purchases WHERE purchase_id=?", purchase)).isEqualTo(receipt);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='users'
                """, Long.class)).isGreaterThanOrEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id=? AND revoked_at IS NULL",
                Long.class, user.getId())).isZero();
    }
}
