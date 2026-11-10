package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.world.jumpmap.*;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 전용 MySQL + 실제 HTTP/WS. 착지 입력은 서버 판정 계층에 주입하며 지갑·정산은 대역을 쓰지 않는다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db,park-renewal-local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=새 공원",
        "ontop.world.channels[0].capacity=40"
})
class RenewalJumpmapMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired jakarta.persistence.EntityManager entities;
    @Autowired JumpmapStore store;
    @Autowired JumpmapService service;
    @Autowired JumpmapActivation activation;
    @Autowired WorldMapRuntime runtime;
    @Autowired AuthExchangePersistenceService issuer;
    @LocalServerPort int port;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_JUMPMAP_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_jumpmap_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("전용 loopback 점프맵 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_JUMPMAP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_JUMPMAP_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() throws Exception {
        service.drain(Duration.ofSeconds(10));
        jdbc.execute("DROP TRIGGER IF EXISTS renewal_test_fail_ledger");
        for (String table : List.of("jump_gate_rewards", "jump_daily_earnings", "jump_profiles", "jump_runs",
                "wallet_transactions", "wallets", "refresh_tokens", "users")) jdbc.update("DELETE FROM " + table);
        for (long id : new long[]{101,202}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES (?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))", id,"renewal-"+id,"jump"+id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,100,0)",id);
        }
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
        assertThat(store.ready()).isTrue();
    }

    private HttpResponse<String> get(String path, String access, boolean post) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path))
                .header("Authorization","Bearer "+access);
        if(post) request.POST(HttpRequest.BodyPublishers.noBody());
        return http.send(request.build(),HttpResponse.BodyHandlers.ofString());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void MySQL_드라이버의_불리언_매핑과_무관하게_첫_판과_재시도를_보존한다(boolean tinyInt1isBit) {
        String original = System.getenv("TEST_JUMPMAP_DB_URL");
        String url = original + (original.contains("?") ? "&" : "?") + "tinyInt1isBit=" + tinyInt1isBit;
        var source = new org.springframework.jdbc.datasource.DriverManagerDataSource(url,
                System.getenv("TEST_JUMPMAP_DB_USERNAME"), System.getenv("TEST_JUMPMAP_DB_PASSWORD"));
        var mappedJdbc = new JdbcTemplate(source);
        var generated = java.nio.file.Path.of("../frontend/generated/park-renewal");
        var mappedStore = new JdbcJumpmapStore(mappedJdbc, entities,
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(source),
                new com.ssafy.ontop.world.config.JumpmapProperties(true,
                        generated.resolve("course.local.json").toString(),
                        generated.resolve("course.local.sha256").toString()));

        Instant startedAt = Instant.parse("2026-11-10T03:00:00Z");
        var first = mappedStore.start("driver-first", 101, "channel-1", startedAt);
        var stored = mappedJdbc.queryForMap("SELECT is_first_run FROM jump_runs WHERE id='driver-first'")
                .get("is_first_run");
        var retry = mappedStore.start("driver-first", 101, "channel-1", startedAt.plusSeconds(1));
        var second = mappedStore.start("driver-second", 101, "channel-1", startedAt.plusSeconds(2));

        assertThat(stored).isInstanceOf(tinyInt1isBit ? Boolean.class : Number.class);
        assertThat(first.firstRun()).isTrue();
        assertThat(retry.firstRun()).isTrue();
        assertThat(second.firstRun()).isFalse();
    }

    @Test
    void 열단계_판정이_실제_소켓과_DB와_지갑에_250냥을_한번만_반영한다() throws Exception {
        String access = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER,101L,null)).accessToken();
        var ticketResponse=get("/api/v1/auth/websocket-ticket",access,true);
        assertThat(ticketResponse.statusCode()).isEqualTo(200);
        String ticket=json.readTree(ticketResponse.body()).path("ticket").asText();
        var course=activation.course().orElseThrow();
        var tracker=new JumpmapTracker(course);
        try(var socket=new ScenarioClient(port,"101",ticket)) {
            socket.await(m->m.path("type").asText().equals("CONNECTED"));
            var confirmation=socket.request("WORLD_MAP_CONFIRM",runtime.scene().metadata());
            assertThat(confirmation.path("type").asText()).as(confirmation.toString()).isEqualTo("WORLD_MAP_STATE");
            socket.state("LOBBY");
            var joined=socket.request("CHANNEL_JOIN",Map.of("channelId","channel-1"));
            assertThat(joined.path("type").asText()).as(joined.toString()).isEqualTo("CHANNEL_STATE");
            long now=0;
            tracker.observe("101","channel-1",JumpmapTracker.Sample.of(JumpmapTracker.Surface.NONE,"",false,0,0),now);
            List<JumpmapTracker.Signal> replay=new ArrayList<>();
            for(var pad:course.colliders()) {
                var sample=new JumpmapTracker.Sample(JumpmapTracker.Surface.COURSE,pad.id(),pad.block(),pad.gate(),false,pad.top(),0,false,pad.x(),pad.z());
                var signals=tracker.observe("101","channel-1",sample,now+=1000);
                replay.addAll(signals);
                signals.forEach(s->service.accept(s,List.of("101")));
                service.drain(Duration.ofSeconds(10));
                if(pad.block()==0) {
                    var started=socket.await(m->m.path("type").asText().equals("JUMPMAP_STARTED"));
                    assertThat(started.at("/payload/rulesVersion").asText()).isEqualTo("v4");
                }
                if(pad.gate()!=null) socket.await(m->m.path("type").asText().equals("JUMPMAP_GATE") && m.at("/payload/gate").asInt()==pad.gate());
            }
            assertThat(tracker.active("101",now).orElseThrow().gatesPassed()).isEqualTo(9);
            assertThat(balance()).isEqualTo(310); // 마지막 오리만 밟아서는 마지막 40냥을 지급하지 않는다.
            var finish=tracker.observe("101","channel-1",new JumpmapTracker.Sample(JumpmapTracker.Surface.GROUND,"island",-1,null,false,course.finish().y(),0,false,course.finish().x(),course.finish().z()),now+1000);
            finish.forEach(s->service.accept(s,List.of("101")));
            service.drain(Duration.ofSeconds(10));
            var ended=socket.await(m->m.path("type").asText().equals("JUMPMAP_ENDED"));
            assertThat(ended.at("/payload/gatesPassed").asInt()).isEqualTo(10);
            assertThat(ended.at("/payload/runCoins").asInt()).isEqualTo(250);
            assertThat(ended.at("/payload/reason").asText()).isEqualTo("FINISH");
            String run=ended.at("/payload/runId").asText();
            // 전송·작업 재시도. 이미 끝난 판의 이전 관문 신호도 지갑을 다시 늘리지 않는다.
            replay.stream().filter(s->s instanceof JumpmapTracker.Progress).forEach(s->service.accept(s,List.of("101")));
            finish.forEach(s->service.accept(s,List.of("101")));
            service.drain(Duration.ofSeconds(10));
            assertThat(balance()).isEqualTo(350);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key LIKE ?",Integer.class,"jumpmap:"+run+":%" )).isEqualTo(10);
            assertThat(jdbc.queryForList("SELECT coins_granted FROM jump_gate_rewards WHERE run_id=? ORDER BY gate",Integer.class,run)).containsExactly(5,10,15,20,25,30,32,35,38,40);
            var status=get("/api/v1/minigames/jumpmap/status?channelId=channel-1",access,false);
            assertThat(status.statusCode()).isEqualTo(200);
            assertThat(json.readTree(status.body()).at("/lastRun/gatesPassed").asInt()).isEqualTo(10);
            assertThat(json.readTree(status.body()).path("todayEarned").asInt()).isEqualTo(250);
            assertThat(store.ranking(101).me().userId()).isEqualTo("101");
        }
    }

    @Test
    void 동시_중복_정산과_잘못된_관문과_시작_재시도를_안전하게_처리한다() throws Exception {
        String run=UUID.randomUUID().toString(); Instant at=Instant.now();
        assertThat(store.start(run,101,"channel-1",at).firstRun()).isTrue();
        assertThat(store.start(run,101,"channel-1",at).firstRun()).isTrue();
        assertThatThrownBy(()->store.start(run,202,"channel-1",at)).isInstanceOf(RuntimeException.class).hasMessageContaining("다른 판의 시작 키");
        assertThat(store.passGate(run,101,10,40,1000,at)).isFalse();
        assertThat(store.passGate(run,202,1,5,1000,at)).isFalse();
        assertThat(store.passGate(run,101,1,99,1000,at)).isFalse();
        assertThat(store.passGate(run,101,11,40,1000,at)).isFalse();
        assertThat(store.passGate(run,101,1,5,1000,at)).isTrue();
        try(var pool=Executors.newFixedThreadPool(8)) {
            var start=new CountDownLatch(1); var tasks=new ArrayList<Future<Integer>>();
            for(int i=0;i<16;i++) tasks.add(pool.submit(()->{start.await();return store.settle(run,1,at).orElseThrow().coinsGranted();}));
            start.countDown(); for(var result:tasks) assertThat(result.get(30,TimeUnit.SECONDS)).isEqualTo(5);
        }
        assertThat(balance()).isEqualTo(105);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions",Integer.class)).isEqualTo(1);
    }

    @Test
    void 원장_실패시_전액_롤백하고_재시도로_정확히_한번_지급한다() {
        String run=UUID.randomUUID().toString(); Instant at=Instant.now();
        store.start(run,101,"channel-1",at);
        store.passGate(run,101,1,5,1000,at);
        jdbc.execute("CREATE TRIGGER renewal_test_fail_ledger BEFORE INSERT ON wallet_transactions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='renewal rollback test'");
        try { assertThatThrownBy(()->store.settle(run,1,at)).isInstanceOf(RuntimeException.class); }
        finally { jdbc.execute("DROP TRIGGER renewal_test_fail_ledger"); }
        assertThat(balance()).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT status FROM jump_gate_rewards WHERE run_id=?",String.class,run)).isEqualTo("PENDING");
        assertThat(store.settle(run,1,at).orElseThrow().coinsGranted()).isEqualTo(5);
        assertThat(store.settle(run,1,at).orElseThrow().coinsGranted()).isEqualTo(5);
        assertThat(balance()).isEqualTo(105);
    }

    @Test
    void dev_V166_데이터를_보존하며_V167을_순차_적용한다() {
        String name="ontop_jumpmap_test_upgrade167_"+UUID.randomUUID().toString().substring(0,8);
        jdbc.execute("CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin");
        String url=System.getenv("TEST_JUMPMAP_DB_URL").replaceFirst("/ontop_jumpmap_test_[A-Za-z0-9_]+", "/"+name);
        String username=System.getenv("TEST_JUMPMAP_DB_USERNAME"),password=System.getenv("TEST_JUMPMAP_DB_PASSWORD");
        String[] locations={"classpath:db/migration","classpath:db/minigame","classpath:db/shop"};
        org.flywaydb.core.Flyway.configure().dataSource(url,username,password).locations(locations).target("166").load().migrate();
        var old=new JdbcTemplate(new org.springframework.jdbc.datasource.DriverManagerDataSource(url,username,password));
        old.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES (101,'NAVER','upgrade','기존유저','MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))");
        old.update("INSERT INTO jump_runs(id,user_id,channel_id,status,rules_version,course_version,is_first_run,started_at,gate_times_ms,gates_passed,coins_granted) VALUES ('old-seven',101,'channel-1','STARTED','v3','park180-jump-v1',TRUE,CURRENT_TIMESTAMP(3),JSON_ARRAY(),7,250)");
        org.flywaydb.core.Flyway.configure().dataSource(url,username,password).locations(locations).load().migrate();
        assertThat(old.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='166' AND success=TRUE", Integer.class)).isEqualTo(1);
        assertThat(old.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='167' AND success=TRUE", Integer.class)).isEqualTo(1);
        assertThat(old.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='169'", Integer.class)).isZero();
        assertThat(old.queryForObject("SELECT coins_granted FROM jump_runs WHERE id='old-seven'",Integer.class)).isEqualTo(250);
        assertThat(old.queryForObject("SELECT gates_passed FROM jump_runs WHERE id='old-seven'",Integer.class)).isEqualTo(7);
        old.update("UPDATE jump_runs SET gates_passed=10 WHERE id='old-seven'");
        assertThatThrownBy(()->old.update("UPDATE jump_runs SET gates_passed=11 WHERE id='old-seven'")).isInstanceOf(RuntimeException.class);
    }

    @Test
    void 두바퀴_500냥_후_기존_일일상한을_지키고_열한단계는_DB도_거부한다() {
        Instant at=Instant.now(); var course=activation.course().orElseThrow();
        for(int lap=0;lap<3;lap++) {
            String run=UUID.randomUUID().toString();store.start(run,101,"channel-1",at);
            for(var stage:course.stages()) {
                assertThat(store.passGate(run,101,stage.stage(),stage.reward(),stage.stage()*1000,at)).isTrue();
                assertThat(store.settle(run,stage.stage(),at).orElseThrow().coinsGranted()).isEqualTo(lap<2?stage.reward():0);
            }
            assertThatThrownBy(()->jdbc.update("UPDATE jump_runs SET gates_passed=11 WHERE id=?",run)).isInstanceOf(RuntimeException.class);
        }
        assertThat(balance()).isEqualTo(600);
        assertThat(store.status(101,at).todayEarned()).isEqualTo(500);
    }

    private int balance() { return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101",Integer.class); }
}
