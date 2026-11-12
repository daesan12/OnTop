package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.LocalJokeContest.Submission;
import com.ssafy.ontop.demo.JokeLocalDatabase;
import com.zaxxer.hikari.HikariDataSource;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@Tag("mysql")
class JokeContestMySqlTests {
    static HikariDataSource source;static JdbcTemplate jdbc;static final ObjectMapper mapper=new ObjectMapper();
    final LocalJokeContestTests.TestClock clock=new LocalJokeContestTests.TestClock();
    @BeforeAll static void connect(){
        String url=System.getenv("AI_LAB_JOKE_DB_URL");if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:(?:19306|13339)/ontop_joke_local_test_[a-z0-9_]+(?:\\?.*)?"))throw new IllegalStateException("별도 아재왕 테스트 DB가 필요합니다.");
        source=JokeLocalDatabase.open(System.getenv());jdbc=new JdbcTemplate(source);
        for(long id=101;id<=122;id++)jdbc.update("INSERT IGNORE INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES(?,'NAVER',?,?,'MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",id,"joke-test-"+id,"아재"+id);
    }
    @AfterAll static void close(){if(source!=null)source.close();}
    @BeforeEach void cleanOnlyDedicatedTables(){jdbc.update("DELETE FROM joke_contest_daily_winners");jdbc.update("DELETE FROM joke_contest_submissions");jdbc.update("DELETE FROM joke_contest_daily_quotas");}
    JdbcJokeContestStore store(){return new JdbcJokeContestStore(source,mapper);}
    LocalJokeContest contest(){return new LocalJokeContest(mapper,store(),JokeJudge.fixture(),AiText.fixed(),clock);}
    Submission draft(String user,String key,String question){return new Submission(UUID.randomUUID().toString(),user,"아재"+user,"2026-11-09",question,"정답",LocalJokeContest.normalizedHash(question,"정답"),key,"PENDING",null,0,0,0,"","심사 중","PENDING",clock.millis(),0,"test");}
    Submission terminal(Submission s,String status,Integer score){return LocalJokeContest.finished(s,status,score,status.equals("SCORED")?300:0,status.equals("SCORED")?300:0,status.equals("SCORED")?150:0,"test","반응입니다","FIXED",clock.millis());}
    Submission send(LocalJokeContest c,String user,String q,String a){return c.submit(user,"아재"+user,q,a,UUID.randomUUID().toString(),true);}
    Submission await(LocalJokeContest c,String user,String id)throws Exception{for(int i=0;i<500;i++){var s=c.own(user,id);if(!s.status().equals("PENDING"))return s;Thread.sleep(10);}throw new AssertionError("DB 심사 지연");}
    @Test void v170AndDatabaseConstraintsAreReal(){
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='170' AND success=1",Integer.class)).isEqualTo(1);
        var s=store();var row=s.reserve(draft("101","schema-check","제약 검증")).submission();
        assertThatThrownBy(()->s.finish(terminal(row,"SCORED",1001),clock.millis())).isInstanceOf(org.springframework.dao.DataAccessException.class).hasMessageContaining("ck_joke_final_score");
        assertThat(s.find(row.id()).orElseThrow().status()).isEqualTo("PENDING");assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=101",Integer.class)).isEqualTo(1);
        assertThatThrownBy(()->jdbc.update("UPDATE joke_contest_daily_quotas SET used_attempts=4 WHERE user_id=101")).isInstanceOf(org.springframework.dao.DataAccessException.class).hasMessageContaining("ck_joke_quota_used");
    }
    @Test void scoredRejectedInvalidConsumeThreeAndPersistenceSurvivesServiceRestart()throws Exception{
        String id;
        try(var c=contest()){
            id=await(c,"101",send(c,"101","왕이 넘어지면?","킹콩!").id()).id();clock.advance(2100);
            assertThat(await(c,"101",send(c,"101","검수거절 작품","답").id()).status()).isEqualTo("REJECTED");clock.advance(2100);
            assertThat(await(c,"101",send(c,"101","정답은 무엇일까","모르겠어요").id()).status()).isEqualTo("INVALID_JOKE");
            assertThat(c.mine("101").get("remaining")).isEqualTo(0L);assertThat(c.mine("101").get("storage")).isEqualTo("MYSQL");
        }
        try(var restarted=contest()){
            assertThat(restarted.own("101",id).scoreX10()).isEqualTo(823);assertThat(restarted.mine("101").get("remaining")).isEqualTo(0L);assertThat(restarted.rankings("2026-11-09")).hasSize(1);
            assertThat(mapper.writeValueAsString(restarted.rankings("2026-11-09"))).doesNotContain("킹콩","userId","answer","reaction");
        }
        assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=101",Integer.class)).isEqualTo(3);
    }
    @Test void concurrentIndependentStoresReserveSameRequestOnlyOnce()throws Exception{
        var gate=new CountDownLatch(1);var created=new AtomicInteger();var ids=ConcurrentHashMap.<String>newKeySet();
        try(var pool=Executors.newFixedThreadPool(6)){
            var jobs=new ArrayList<Future<?>>();for(int i=0;i<8;i++)jobs.add(pool.submit(()->{gate.await();var result=store().reserve(draft("101","parallel-request","동시 작품"));ids.add(result.submission().id());if(result.created())created.incrementAndGet();return null;}));gate.countDown();for(var job:jobs)job.get(15,TimeUnit.SECONDS);
        }
        assertThat(created).hasValue(1);assertThat(ids).hasSize(1);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM joke_contest_submissions",Integer.class)).isEqualTo(1);
        assertThatThrownBy(()->store().reserve(draft("101","parallel-request","다른 작품"))).hasMessageContaining("다른 작품");
        clock.advance(2100);assertThatThrownBy(()->store().reserve(draft("101","another-request","동시 작품"))).hasMessageContaining("이미 제출");
    }
    @Test void independentStoresCannotExceedThreePendingReservationsAndAiDoesNotHoldDbLock()throws Exception{
        var started=new CountDownLatch(1);var release=new CountDownLatch(1);var fixture=JokeJudge.fixture();
        JokeJudge delayed=new JokeJudge(){public Evaluation evaluate(String q,String a){started.countDown();try{release.await(8,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return fixture.evaluate(q,a);}public boolean safeReaction(String t){return true;}public String mode(){return "delayed";}};
        try(var c=new LocalJokeContest(mapper,store(),delayed,AiText.fixed(),clock)){
            send(c,"101","첫 작품","답");assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();clock.advance(2100);
            store().reserve(draft("101","second-request","두번째 작품"));clock.advance(2100);store().reserve(draft("101","third-request","세번째 작품"));
            assertThatThrownBy(()->store().reserve(draft("101","fourth-request","네번째 작품"))).hasMessageContaining("모두 사용");
            assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=101",Integer.class)).isEqualTo(3);
            release.countDown();
        }finally{release.countDown();}
    }
    @Test void timeoutRefundsExactlyOnceAndLateCompletionCannotOverwriteOrReroll(){
        var one=store();var row=one.reserve(draft("101","timeout-request","만료 작품")).submission();
        assertThat(store().find(row.id()).orElseThrow().status()).isEqualTo("PENDING");clock.advance(61_000);
        assertThat(one.pending(row.id(),clock.millis())).isFalse();one.finish(terminal(row,"SCORED",750),clock.millis());one.settle(clock.millis());
        assertThat(one.find(row.id()).orElseThrow().status()).isEqualTo("FAILED");assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=101",Integer.class)).isZero();
        assertThat(one.reserve(draft("101","retry-request","만료 작품")).created()).isTrue();
    }
    @Test void providerFailureRefundAndLlmFallbackAreDifferent()throws Exception{
        try(var c=contest()){
            assertThat(await(c,"101",send(c,"101","심사장애 작품","답").id()).status()).isEqualTo("FAILED");assertThat(c.mine("101").get("remaining")).isEqualTo(3L);clock.advance(2100);
            var row=await(c,"101",send(c,"101","정상 작품","정답").id());assertThat(row.status()).isEqualTo("SCORED");assertThat(row.reactionSource()).isEqualTo("FIXED");assertThat(c.mine("101").get("remaining")).isEqualTo(2L);
        }
    }
    @Test void rankedOnePerUserTopFiveRevealAndMidnightSnapshotSurviveRestart()throws Exception{
        var repository=store();var ids=new ArrayList<String>();
        for(int i=101;i<112;i++){var row=repository.reserve(draft(Integer.toString(i),"rank-request-"+i,"작품"+i)).submission();repository.finish(terminal(row,"SCORED",750),clock.millis());ids.add(row.id());clock.advance(2100);}
        try(var c=contest()){
            assertThat(c.rankings("2026-11-09")).hasSize(10);assertThat(c.reveal(ids.getFirst()).get("answer")).isEqualTo("정답");assertThatThrownBy(()->c.reveal(ids.get(5))).hasMessageContaining("상위 5위");assertThatThrownBy(()->c.own("102",ids.getFirst())).hasMessageContaining("내 제출");
            clock.time.set(java.time.Instant.parse("2026-11-09T15:01:00Z").toEpochMilli());assertThat(c.mine("101").get("remaining")).isEqualTo(3L);assertThat(c.yesterday().get("available")).isEqualTo(false);
            clock.advance(4*60_000);assertThat(c.yesterday().get("available")).isEqualTo(true);
        }
        try(var c=contest()){assertThat(c.hall()).hasSize(1);assertThat(((Map<?,?>)c.yesterday().get("winner")).get("id")).isEqualTo(ids.getFirst());}
    }
    @Test void localFactoryRejectsSharedOrUnexpectedDatabasesBeforeConnecting(){
        for(String url:List.of("jdbc:mysql://10.77.0.1:3306/ontop","jdbc:mysql://127.0.0.1:(?:19306|13339)/ontop","jdbc:mysql://localhost:(?:19306|13339)/ontop_joke_local_preview"))assertThatThrownBy(()->JokeLocalDatabase.open(Map.of("AI_LAB_JOKE_DB_URL",url))).isInstanceOf(IllegalArgumentException.class);
    }
}
