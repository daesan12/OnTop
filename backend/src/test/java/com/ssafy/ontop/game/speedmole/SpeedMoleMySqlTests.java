package com.ssafy.ontop.game.speedmole;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@Tag("mysql")
@SpringBootTest(properties = {"spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class SpeedMoleMySqlTests {
    private static final AtomicLong USERS = new AtomicLong(790000);
    @Autowired private SpeedMoleService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactions;
    @DynamicPropertySource static void isolatedOnly(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SPEED_MOLE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_speed_mole_test_[A-Za-z0-9_]+(?:\\?.*)?"))
            throw new IllegalStateException("A dedicated loopback ontop_speed_mole_test_ database is required");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SPEED_MOLE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SPEED_MOLE_DB_PASSWORD"));
    }
    @Test void V151_and_duplicate_start_completion_write_one_result_and_one_reward() throws Exception {
        long user = user();
        try (var pool = Executors.newFixedThreadPool(6)) {
            var starts = new java.util.ArrayList<java.util.concurrent.Future<SpeedMoleDtos.Round>>();
            for (int i=0;i<6;i++) starts.add(pool.submit(() -> service.start(user,"same-start")));
            var rounds = new java.util.ArrayList<SpeedMoleDtos.Round>();
            for (var f:starts) rounds.add(f.get(15,TimeUnit.SECONDS));
            assertThat(rounds.stream().map(SpeedMoleDtos.Round::id).distinct()).hasSize(1);
            long id = Long.parseLong(rounds.getFirst().id());
            jdbc.update("UPDATE speed_mole_rounds SET seed=1, started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),id);
            var taps = taps(1,120);
            var finishes = new java.util.ArrayList<java.util.concurrent.Future<SpeedMoleDtos.Result>>();
            for (int i=0;i<6;i++) finishes.add(pool.submit(() -> service.complete(user,id,taps)));
            var results = new java.util.ArrayList<SpeedMoleDtos.Result>();
            for (var f:finishes) results.add(f.get(15,TimeUnit.SECONDS));
            assertThat(results.stream().distinct()).hasSize(1);
            assertThat(results.getFirst().score()).isEqualTo(120);
            assertThat(results.getFirst().reward()).isEqualTo(24);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM speed_mole_rounds WHERE user_id=? AND status='SETTLED'",Long.class,user)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,user)).isEqualTo(103);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key=?",Long.class,"mole:reward:speed:"+id)).isEqualTo(1);
        }
        assertThat(flyway.info().pending()).isEmpty();
    }
    @Test void invalid_and_other_users_taps_never_publish_a_score() {
        long owner=user(), other=user();
        long id=Long.parseLong(service.start(owner,"reject").id());
        jdbc.update("UPDATE speed_mole_rounds SET started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),id);
        assertThatThrownBy(()->service.complete(other,id,List.of())).isInstanceOf(SpeedMoleException.class);
        assertThatThrownBy(()->service.complete(owner,id,List.of(new SpeedMoleRules.Tap(8,0)))).isInstanceOf(SpeedMoleException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM speed_mole_rounds WHERE id=?",String.class,id)).isEqualTo("ACTIVE");
        assertThat(service.rankings(owner,20,0).me()).isNull();
    }
    @Test void best_per_user_competition_ties_earlier_completion_pagination_and_deleted_members() {
        long a=user(),b=user(),c=user(),deleted=user(),oldRules=user(),active=user();
        Instant at=Instant.parse("2030-01-01T00:00:00Z");
        settled(a,1000,0,at,1); settled(a,900,0,at.minusSeconds(1),1);
        settled(b,1000,0,at.plusSeconds(1),1); settled(c,1000,1,at,1);
        settled(deleted,5000,0,at,1); settled(oldRules,5000,0,at,2);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?",deleted);
        service.start(active,"unfinished");
        var top=service.rankings(a,3,0);
        assertThat(top.items().stream().map(SpeedMoleDtos.Item::userId)).containsExactly(Long.toString(a),Long.toString(b),Long.toString(c));
        assertThat(top.items().stream().map(SpeedMoleDtos.Item::rank)).containsExactly(1L,1L,3L);
        assertThat(top.items().getFirst().completedAt()).isEqualTo(at);
        var page=service.rankings(a,1,2);
        assertThat(page.items()).hasSize(1); assertThat(page.items().getFirst().userId()).isEqualTo(Long.toString(c));
        assertThat(page.me().userId()).isEqualTo(Long.toString(a));
        assertThat(service.rankings(deleted,100,0).items().stream().map(SpeedMoleDtos.Item::userId))
                .doesNotContain(Long.toString(deleted),Long.toString(oldRules),Long.toString(active));
    }
    @Test void settled_row_cannot_contain_null_score_or_more_than_allowed_taps() {
        long user=user();
        assertThatThrownBy(()->jdbc.update("INSERT INTO speed_mole_rounds(user_id,request_key,seed,rules_version,status,started_at,completed_at,score,hits,misses) "
                + "VALUES (?,'invalid',1,1,'SETTLED',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL,1,0)",user))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .hasRootCauseInstanceOf(java.sql.SQLException.class)
                .hasMessageContaining("ck_speed_mole_result");
    }
    private long user() {
        long id=USERS.incrementAndGet();
        jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES (?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                id,UUID.randomUUID().toString(),"s"+id);
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,100,0)",id);
        return id;
    }
    private static List<SpeedMoleRules.Tap> taps(long seed,int count) {
        var result = new java.util.ArrayList<SpeedMoleRules.Tap>();
        // The prefix replay identifies which of the 8 holes is active next; only test fixtures synthesize taps.
        for(int i=0;i<count;i++) {
            for(int hole=0;hole<8;hole++) {
                var candidate = new java.util.ArrayList<>(result); candidate.add(new SpeedMoleRules.Tap(hole,i*10));
                if(SpeedMoleRules.replay(seed,candidate).hits()==i+1) { result=candidate; break; }
            }
        }
        return result;
    }
    @Test void common_budget_caps_rewards_and_an_old_ranking_is_not_retroactively_paid() {
        long user=user();
        jdbc.update("UPDATE wallets SET balance=597 WHERE user_id=?",user);
        jdbc.update("INSERT INTO wallet_transactions(wallet_id,transaction_type,balance_delta,reserved_delta,idempotency_key,created_at) "
                +"SELECT id,'MINIGAME_REWARD',497,0,?,CURRENT_TIMESTAMP(3) FROM wallets WHERE user_id=?",UUID.randomUUID().toString(),user);
        long id=Long.parseLong(service.start(user,"cap").id());
        jdbc.update("UPDATE speed_mole_rounds SET seed=1,started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),id);
        var result=service.complete(user,id,taps(1,200));
        assertThat(result.calculatedReward()).isEqualTo(40); assertThat(result.reward()).isEqualTo(3); assertThat(result.todayEarned()).isEqualTo(500);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,user)).isEqualTo(600);
        long next=Long.parseLong(service.start(user,"cap-next").id());
        jdbc.update("UPDATE speed_mole_rounds SET seed=1,started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),next);
        assertThat(service.complete(user,next,taps(1,80)).reward()).isZero();
        long oldUser=user(); settled(oldUser,120,0,Instant.now().minusSeconds(120),1);
        long old=jdbc.queryForObject("SELECT id FROM speed_mole_rounds WHERE user_id=?",Long.class,oldUser);
        assertThat(service.complete(oldUser,old,List.of()).reward()).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,oldUser)).isEqualTo(100);
    }
    @Test void outer_transaction_failure_rolls_back_round_wallet_and_ledger_together() {
        long user=user(); long id=Long.parseLong(service.start(user,"rollback").id());
        jdbc.update("UPDATE speed_mole_rounds SET seed=1,started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),id);
        var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
        tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        assertThatThrownBy(()->tx.executeWithoutResult(status->{ service.complete(user,id,taps(1,120)); throw new IllegalStateException("test rollback"); }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM speed_mole_rounds WHERE id=?",String.class,id)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,user)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key=?",Long.class,"mole:reward:speed:"+id)).isZero();
    }
    @Test void opening_a_new_round_invalidates_an_unfinished_older_round() {
        long user=user();long old=Long.parseLong(service.start(user,"old").id());
        jdbc.update("UPDATE speed_mole_rounds SET seed=1,started_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(61)),old);
        service.start(user,"new");
        assertThatThrownBy(()->service.complete(user,old,taps(1,80))).isInstanceOf(SpeedMoleException.class).hasMessageContaining("다른 창");
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,user)).isEqualTo(100);
    }
    private void settled(long user,int score,int misses,Instant at,int version) {
        jdbc.update("INSERT INTO speed_mole_rounds(user_id,request_key,seed,rules_version,status,started_at,completed_at,score,hits,misses) VALUES (?,?,1,?,'SETTLED',?,?,?,?,?)",
                user,UUID.randomUUID().toString(),version,Timestamp.from(at.minusSeconds(60)),Timestamp.from(at),score,score+misses,misses);
    }
}
