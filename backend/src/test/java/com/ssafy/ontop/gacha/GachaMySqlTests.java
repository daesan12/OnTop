package com.ssafy.ontop.gacha;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.gacha.GachaDtos.*;
import com.ssafy.ontop.ranking.repository.RankingRepository;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@Tag("mysql")
@SpringBootTest(properties={"spring.profiles.active=local,db","ontop.shop.enabled=true","ontop.gacha.enabled=true",
        "ontop.gacha.broadcast-enabled=false","spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class GachaMySqlTests {
    private static final AtomicLong USERS=new AtomicLong(880000);
    @Autowired JdbcTemplate jdbc;
    @Autowired GachaRepository repository;
    @Autowired WalletRepository wallets;
    @Autowired WalletTransactionRepository ledger;
    @Autowired EntityManager entities;
    @Autowired PlatformTransactionManager manager;
    @Autowired ObjectMapper json;
    @Autowired Flyway flyway;
    @Autowired RankingRepository rankings;
    @Autowired ParkBalanceRankingRepository board;
    @Autowired com.ssafy.ontop.shop.service.ShopService shop;
    @DynamicPropertySource static void isolated(DynamicPropertyRegistry properties) {
        String url=System.getenv("TEST_GACHA_DB_URL");
        if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_gacha_test_[A-Za-z0-9_]+(?:\\?.*)?"))
            throw new IllegalStateException("전용 loopback ontop_gacha_test_ DB가 필요합니다.");
        properties.add("spring.datasource.url",()->url);
        properties.add("spring.datasource.username",()->System.getenv("TEST_GACHA_DB_USERNAME"));
        properties.add("spring.datasource.password",()->System.getenv().getOrDefault("TEST_GACHA_DB_PASSWORD",""));
    }
    @BeforeEach void fixture() {
        USERS.accumulateAndGet(jdbc.queryForObject("SELECT COALESCE(MAX(id),880000) FROM users",Long.class),Math::max);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id>=880000 AND deleted_at IS NULL");
        jdbc.update("DELETE FROM gacha_receipts");jdbc.update("DELETE FROM gacha_inventory");
        jdbc.update("DELETE FROM gacha_events");jdbc.update("DELETE FROM gacha_delivery_cursors");
        jdbc.update("DELETE FROM shop_purchases WHERE user_id>=880000");
        jdbc.update("DELETE FROM user_items WHERE user_id>=880000");
        jdbc.update("DELETE FROM gacha_product_items");jdbc.update("DELETE FROM gacha_products");
        jdbc.update("UPDATE gacha_machine SET round_id=1,state_version=0,first_remaining=1,second_remaining=2,third_remaining=4,fourth_remaining=8,coin_remaining=15,refill_ends_at=NULL WHERE id=1");
        for(int grade=1;grade<=4;grade++) {
            long id=890000+grade;
            jdbc.update("INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale,set_code) "
                    +"VALUES(?,?,?,'EQUIPMENT','HAIR',0,'test/hair',FALSE,'SAME_DESIGN') ON DUPLICATE KEY UPDATE name=VALUES(name)",id,"GACHA_TEST_"+grade,"test"+grade);
            jdbc.update("INSERT INTO gacha_products(product_code,name,grade,compatibility,image_key,active) VALUES(?,?,?,'ANY','test/hair',TRUE)","P"+grade,"상품"+grade,grade);
            jdbc.update("INSERT INTO gacha_product_items VALUES(?,?)","P"+grade,id);
        }
    }
    private GachaService service(int slot) {
        return new GachaService(repository,wallets,ledger,entities,manager,json,Clock.systemUTC(),bound->Math.min(slot,bound-1));
    }
    private long user(long balance) {
        long id=USERS.incrementAndGet();
        jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                id,UUID.randomUUID().toString(),"g"+id);
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,?,0)",id,balance);
        return id;
    }
    private long amount(long user) { return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?",Long.class,user); }
    private long scalar(String sql,Object... args) { return jdbc.queryForObject(sql,Long.class,args); }
    @Test void V157_and_missing_catalog_or_reserved_money_never_charge() {
        assertThat(flyway.info().applied()).anySatisfy(m->assertThat(m.getVersion().getVersion()).isEqualTo("157"));
        long user=user(100);
        jdbc.update("UPDATE wallets SET reserved_balance=1 WHERE user_id=?",user);
        assertThatThrownBy(()->service(0).purchase(user,"reserved")).isInstanceOf(GachaException.class);
        assertThat(amount(user)).isEqualTo(100);
        jdbc.update("UPDATE wallets SET reserved_balance=0 WHERE user_id=?",user);
        jdbc.update("UPDATE gacha_products SET active=FALSE WHERE grade=4");
        assertThatThrownBy(()->service(0).purchase(user,"catalog")).isInstanceOf(GachaException.class);
        assertThat(amount(user)).isEqualTo(100);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_receipts WHERE user_id=?",user)).isZero();
    }
    @Test void purchases_and_payouts_above_the_notification_safe_integer_limit_roll_back() {
        long maximum=9_007_199_254_740_991L;
        long buyer=user(1000);jdbc.update("INSERT INTO gacha_inventory(user_id,tickets) VALUES(?,?)",buyer,maximum);
        assertThatThrownBy(()->service(0).purchase(buyer,"capacity-buy")).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_CAPACITY_EXCEEDED"));
        assertThat(amount(buyer)).isEqualTo(1000);
        assertThat(service(0).state(buyer).inventory().tickets()).isEqualTo(maximum);
        long winner=user(maximum-10);jdbc.update("INSERT INTO gacha_inventory(user_id,tickets) VALUES(?,1)",winner);
        assertThatThrownBy(()->service(Integer.MAX_VALUE).draw(winner,"capacity-draw","1")).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_CAPACITY_EXCEEDED"));
        assertThat(amount(winner)).isEqualTo(maximum-10);
        assertThat(service(0).state(winner).inventory().tickets()).isEqualTo(1);
        assertThat(service(0).state(winner).machine().remaining()).isEqualTo(30);
        long opener=user(maximum-1);jdbc.update("INSERT INTO gacha_inventory(user_id,first_boxes) VALUES(?,1)",opener);
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) VALUES(?,890001,1,FALSE)",opener);
        assertThatThrownBy(()->service(0).open(opener,"capacity-open",1)).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_CAPACITY_EXCEEDED"));
        assertThat(service(0).state(opener).inventory().boxes().getFirst().quantity()).isEqualTo(1);
        assertThat(amount(opener)).isEqualTo(maximum-1);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_receipts")).isZero();
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isZero();
    }
    @Test void six_retries_buy_once_and_conflicting_operation_is_rejected() throws Exception {
        long user=user(1000); var service=service(0);
        try(var workers=Executors.newFixedThreadPool(6)) {
            var jobs=new ArrayList<java.util.concurrent.Future<Result>>();
            for(int i=0;i<6;i++)jobs.add(workers.submit(()->service.purchase(user,"one-buy")));
            var results=new ArrayList<Result>();for(var f:jobs)results.add(f.get(15,TimeUnit.SECONDS));
            assertThat(results.stream().distinct()).hasSize(1);
        }
        assertThat(amount(user)).isEqualTo(900);assertThat(service.state(user).inventory().tickets()).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='GACHA_PURCHASE' AND wallet_id=(SELECT id FROM wallets WHERE user_id=?)",user)).isEqualTo(1);
        assertThatThrownBy(()->service.draw(user,"one-buy","1")).isInstanceOf(GachaException.class);
    }
    @Test void several_tickets_are_one_purchase_and_replay_or_conflict_by_quantity() {
        long user=user(1000); var service=service(0);
        var bought=service.purchase(user,"three-buy",3);
        assertThat(bought.paidCoins()).isEqualTo(300);
        assertThat(amount(user)).isEqualTo(700);assertThat(service.state(user).inventory().tickets()).isEqualTo(3);
        assertThat(scalar("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='GACHA_PURCHASE' AND wallet_id=(SELECT id FROM wallets WHERE user_id=?)",user)).isEqualTo(1);
        assertThat(service.purchase(user,"three-buy",3)).isEqualTo(bought);
        assertThatThrownBy(()->service.purchase(user,"three-buy",2)).isInstanceOfSatisfying(GachaException.class,e->assertThat(e.code()).isEqualTo("IDEMPOTENCY_CONFLICT"));
        assertThatThrownBy(()->service.purchase(user,"too-many",11)).isInstanceOfSatisfying(GachaException.class,e->assertThat(e.code()).isEqualTo("INVALID_REQUEST"));
        assertThatThrownBy(()->service.purchase(user,"too-few",0)).isInstanceOfSatisfying(GachaException.class,e->assertThat(e.code()).isEqualTo("INVALID_REQUEST"));
        // 남은 700냥으로 8장(800냥)은 거래 전체가 거절되고 아무것도 바뀌지 않는다.
        assertThatThrownBy(()->service.purchase(user,"short-buy",8)).isInstanceOfSatisfying(GachaException.class,e->assertThat(e.code()).isEqualTo("INSUFFICIENT_BALANCE"));
        assertThat(amount(user)).isEqualTo(700);assertThat(service.state(user).inventory().tickets()).isEqualTo(3);
        // 한 장은 예전 요청과 같은 영수증 대상이라 수량 없이 다시 보내도 같은 결과다.
        var one=service.purchase(user,"one-more",1);assertThat(service.purchase(user,"one-more")).isEqualTo(one);
    }
    @Test void same_draw_replays_first_prize_after_round_reset_without_another_announcement() throws Exception {
        long user=user(1000);var service=service(0);service.purchase(user,"buy");
        try(var workers=Executors.newFixedThreadPool(6)) {
            var jobs=new ArrayList<java.util.concurrent.Future<Result>>();
            for(int i=0;i<6;i++)jobs.add(workers.submit(()->service.draw(user,"same-draw","1")));
            var results=new ArrayList<Result>();for(var f:jobs)results.add(f.get(15,TimeUnit.SECONDS));
            assertThat(results.stream().distinct()).hasSize(1);assertThat(results.getFirst().grade()).isEqualTo(1);
        }
        var state=service.state(user);assertThat(state.machine().roundId()).isEqualTo("2");
        assertThat(state.machine().remaining()).isEqualTo(30);assertThat(state.inventory().tickets()).isZero();
        assertThat(state.inventory().boxes().getFirst().quantity()).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isEqualTo(1);
        assertThat(service.recover(user,"same-draw").roundId()).isEqualTo("1");
        assertThatThrownBy(()->service.recover(user(100),"same-draw")).isInstanceOf(GachaException.class);
    }
    @Test void competing_users_cannot_spend_on_the_new_round_without_confirmation() throws Exception {
        long a=user(1000),b=user(1000);var service=service(0);service.purchase(a,"buy");service.purchase(b,"buy");
        try(var workers=Executors.newFixedThreadPool(2)) {
            var start=new java.util.concurrent.CountDownLatch(1);
            var jobs=List.of(workers.submit(()->{start.await();return attempt(service,a);}),workers.submit(()->{start.await();return attempt(service,b);}));
            start.countDown();var outcomes=new ArrayList<String>();for(var f:jobs)outcomes.add(f.get(15,TimeUnit.SECONDS));
            assertThat(outcomes).containsExactlyInAnyOrder("FIRST","GACHA_ROUND_CHANGED");
        }
        assertThat(service.state(a).inventory().tickets()+service.state(b).inventory().tickets()).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isEqualTo(1);
    }
    private String attempt(GachaService service,long user) {
        try { service.draw(user,"race","1");return "FIRST"; } catch(GachaException e) { return e.code(); }
    }
    @Test void coin_reward_is_immediate_and_prize_counts_decrease() {
        long user=user(1000);var service=service(29);service.purchase(user,"buy");
        var result=service.draw(user,"coin","1");assertThat(result.grade()).isEqualTo(5);
        assertThat(result.awardedCoins()).isEqualTo(20);assertThat(amount(user)).isEqualTo(920);
        assertThat(service.state(user).machine().remaining()).isEqualTo(29);
        assertThat(service.state(user).inventory().boxes()).allSatisfy(box->assertThat(box.quantity()).isZero());
    }

    @Test void existing_shop_purchase_and_gacha_purchase_share_member_fk_locks_without_deadlocking() throws Exception {
        long user=user(1000);var service=service(0);
        jdbc.update("INSERT INTO items(id,item_code,name,item_type,price,image_key,is_for_sale) VALUES(899999,'GACHA_TEST_SNACK','간식','CONSUMABLE',10,'test/snack',TRUE) ON DUPLICATE KEY UPDATE is_for_sale=TRUE");
        try(var workers=Executors.newFixedThreadPool(6)) {
            var start=new java.util.concurrent.CountDownLatch(1);
            var jobs=new ArrayList<java.util.concurrent.Future<?>>();
            for(int i=0;i<3;i++) {
                final int n=i;
                jobs.add(workers.submit(()->{start.await();return shop.purchase(user,899999,1,"shop-"+n);}));
                jobs.add(workers.submit(()->{start.await();return service.purchase(user,"gacha-"+n);}));
            }
            start.countDown();for(var f:jobs)f.get(15,TimeUnit.SECONDS);
        }
        assertThat(amount(user)).isEqualTo(670);assertThat(service.state(user).inventory().tickets()).isEqualTo(3);
        assertThat(scalar("SELECT quantity FROM user_items WHERE user_id=? AND item_id=899999",user)).isEqualTo(3);
    }

    @Test void rolled_back_first_prize_does_not_consume_ticket_reset_round_or_publish() {
        long user=user(1000);var service=service(0);service.purchase(user,"buy");
        assertThatThrownBy(()->new TransactionTemplate(manager).execute(s->{
            service.draw(user,"rollback-first","1");throw new IllegalStateException("fixture rollback");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(service.state(user).machine().roundId()).isEqualTo("1");
        assertThat(service.state(user).machine().refillEndsAt()).isNull();
        assertThat(service.state(user).inventory().tickets()).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isZero();
        assertThatThrownBy(()->service.recover(user,"rollback-first")).isInstanceOf(GachaException.class);
    }
    @Test void concurrent_open_grants_once_then_duplicates_pay_half_without_auto_equipping() throws Exception {
        long user=user(1000);var service=service(0);service.purchase(user,"buy");service.draw(user,"first","1");
        try(var workers=Executors.newFixedThreadPool(6)) {
            var jobs=new ArrayList<java.util.concurrent.Future<Result>>();
            for(int i=0;i<6;i++)jobs.add(workers.submit(()->service.open(user,"open",1)));
            for(var f:jobs)assertThat(f.get(15,TimeUnit.SECONDS).duplicate()).isFalse();
        }
        assertThat(scalar("SELECT COUNT(*) FROM user_items WHERE user_id=? AND quantity>0",user)).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM user_items WHERE user_id=? AND is_equipped=TRUE",user)).isZero();
        service.purchase(user,"buy2");
        jdbc.update("UPDATE gacha_machine SET refill_ends_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=1");
        service.draw(user,"first2","2");
        var duplicate=service.open(user,"open2",1);assertThat(duplicate.duplicate()).isTrue();
        assertThat(duplicate.awardedCoins()).isEqualTo(500);assertThat(amount(user)).isEqualTo(1300);
        assertThat(service.open(user,"open2",1)).isEqualTo(duplicate);
    }
    @Test void incompatible_catalog_and_outer_rollback_preserve_box_wallet_and_outbox() {
        long user=user(1000);var service=service(0);service.purchase(user,"buy");service.draw(user,"first","1");
        jdbc.update("UPDATE gacha_products SET compatibility='FEMALE' WHERE grade=1");
        assertThatThrownBy(()->service.open(user,"wrong-character",1)).isInstanceOf(GachaException.class);
        assertThat(service.state(user).inventory().boxes().getFirst().quantity()).isEqualTo(1);
        jdbc.update("UPDATE gacha_products SET compatibility='ANY' WHERE grade=1");
        var outer=new TransactionTemplate(manager);
        assertThatThrownBy(()->outer.execute(s->{service.open(user,"rolled-back",1);throw new IllegalStateException("fixture rollback");})).isInstanceOf(IllegalStateException.class);
        assertThat(service.state(user).inventory().boxes().getFirst().quantity()).isEqualTo(1);
        assertThat(scalar("SELECT COUNT(*) FROM user_items WHERE user_id=?",user)).isZero();
        assertThatThrownBy(()->service.recover(user,"rolled-back")).isInstanceOf(GachaException.class);
        assertThat(amount(user)).isEqualTo(900);
    }
    @Test void both_rankings_count_complete_products_once_without_multiplying_internal_parts() {
        long user=user(100);long other=user(500);
        jdbc.update("UPDATE items SET equip_slot='FACE' WHERE id=890002");
        for(long item:new long[]{890002}) {
            jdbc.update("DELETE FROM gacha_product_items WHERE item_id=?",item);
            jdbc.update("INSERT INTO gacha_product_items VALUES('P1',?)",item);
        }
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) VALUES(?,890001,3,FALSE)",user);
        assertThat(rankings.findStandings(user,100).stream().filter(v->v.userId()==user).findFirst().orElseThrow().equipmentValue()).isZero();
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) VALUES(?,890002,1,FALSE)",user);
        var row=rankings.findStandings(user,100).stream().filter(v->v.userId()==user).findFirst().orElseThrow();
        assertThat(row.equipmentValue()).isEqualTo(1000);assertThat(row.totalAssets()).isEqualTo(1100);assertThat(row.coinBalance()).isEqualTo(100);
        assertThat(row.rank()).isLessThan(rankings.findStandings(other,100).stream().filter(v->v.userId()==other).findFirst().orElseThrow().rank());
        assertThat(board.findTopTen().stream().filter(v->v.userId()==user).findFirst().orElseThrow().totalAssets()).isEqualTo(1100);
    }
    @Test void outbox_restarts_and_each_node_delivers_the_same_event_without_sharing_a_cursor() {
        var deliveredA=new ArrayList<Event>();var deliveredB=new ArrayList<Event>();
        var a=new GachaOutbox(repository,manager,json,"node-a",deliveredA::add);a.initialize();
        var b=new GachaOutbox(repository,manager,json,"node-b",deliveredB::add);b.initialize();
        long user=user(1000);var service=service(0);service.purchase(user,"buy");service.draw(user,"first","1");
        var failing=new GachaOutbox(repository,manager,json,"node-a",e->{throw new IllegalStateException("fixture delivery");});
        failing.initialize();failing.deliver();
        a.deliver();a.deliver();b.deliver();
        assertThat(deliveredA).hasSize(1);assertThat(deliveredB).hasSize(1);
        assertThat(deliveredA.getFirst().eventId()).isEqualTo(deliveredB.getFirst().eventId());
        assertThat(deliveredA.getFirst().winner().winningRoundId()).isEqualTo("1");
        assertThat(deliveredA.getFirst().machine().roundId()).isEqualTo("2");
        assertThat(deliveredA.getFirst().machine().refillEndsAt()).isNotNull();
    }
    @Test void refill_is_persisted_uses_shared_db_time_and_never_automatically_draws_the_next_round() {
        assertThat(flyway.info().applied()).anySatisfy(m->assertThat(m.getVersion().getVersion()).isEqualTo("159"));
        long a=user(1000),b=user(1000);var firstNode=service(0);
        firstNode.purchase(a,"buy-a");firstNode.purchase(a,"buy-extra");firstNode.purchase(b,"buy-b");
        var won=firstNode.draw(a,"won","1");
        var state=firstNode.state(b);
        assertThat(state.machine().refillEndsAt()).isEqualTo(won.completedAt().plusMillis(3000));
        assertThat(state.serverNow()).isBefore(state.machine().refillEndsAt());
        // Another instance with a deliberately wrong application clock cannot bypass the shared gate.
        var nextNode=new GachaService(new GachaRepository(jdbc),wallets,ledger,entities,manager,json,
                Clock.fixed(java.time.Instant.parse("2100-01-01T00:00:00Z"),java.time.ZoneOffset.UTC),bound->bound-1);
        assertThat(nextNode.state(b).machine().refillEndsAt()).isEqualTo(state.machine().refillEndsAt());
        assertThatThrownBy(()->nextNode.draw(b,"old-round","1")).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_ROUND_CHANGED"));
        assertThatThrownBy(()->nextNode.draw(b,"during-refill","2")).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_REFILLING"));
        assertThat(nextNode.state(b).inventory().tickets()).isEqualTo(1);
        assertThat(amount(b)).isEqualTo(900);
        assertThat(scalar("SELECT COUNT(*) FROM gacha_receipts WHERE user_id=? AND operation_kind='DRAW'",b)).isZero();
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isEqualTo(1);
        assertThat(nextNode.draw(a,"won","1")).isEqualTo(won); // Receipt precedes both gates.
        assertThat(nextNode.recover(a,"won")).isEqualTo(won);
        jdbc.update("UPDATE gacha_machine SET refill_ends_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=1");
        var resumed=nextNode.draw(b,"clicked-again","2");
        assertThat(resumed.grade()).isEqualTo(5);
        assertThat(nextNode.state(b).inventory().tickets()).isZero();
        assertThat(nextNode.state(b).machine().refillEndsAt()).isNull();
        assertThat(scalar("SELECT COUNT(*) FROM gacha_events")).isEqualTo(2);
        // An old round remains rejected even after the waiting period; no rollover draw.
        assertThatThrownBy(()->nextNode.draw(a,"late-old","1")).isInstanceOfSatisfying(GachaException.class,
                e->assertThat(e.code()).isEqualTo("GACHA_ROUND_CHANGED"));
        assertThat(nextNode.state(a).inventory().tickets()).isEqualTo(1);
    }
}
