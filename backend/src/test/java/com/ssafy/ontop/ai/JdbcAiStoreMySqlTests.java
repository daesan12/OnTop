package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.LocalAiStore.*;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

@Tag("mysql")
class JdbcAiStoreMySqlTests {
    static DataSource source;
    final ObjectMapper mapper=new ObjectMapper();
    @BeforeAll static void schema() {
        String url=System.getenv("TEST_AI_DB_URL");
        if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ai_operations_test_[A-Za-z0-9_]+(?:\\?.*)?"))
            throw new IllegalStateException("전용 loopback AI 테스트 DB URL이 필요합니다.");
        source=new DriverManagerDataSource(url,"root",System.getenv().getOrDefault("TEST_AI_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/minigame","classpath:db/shop").load().migrate();
    }
    @BeforeEach void cleanOwnedFixture()throws Exception {
        // Only this class's disposable, explicitly named loopback database is reachable.
        for(String table:List.of("ai_incident_messages","ai_incidents","ai_notice_outbox","ai_feedback_reports","ai_chat_assessments","ai_chat_messages"))execute("DELETE FROM "+table);
        execute("UPDATE ai_runtime_state SET digest_slot='' WHERE id=1");
    }
    @Test void storesMessageIncidentAndOutboxAtomicallyAndResumesAfterRestart()throws Exception {
        var clock=new TestClock();var visits=new AtomicInteger();
        try(var store=new JdbcAiStore(source,mapper)){
            var op=new AiOperations(store,new OfflineDecisions(),AiText.fixed(),(id,kind,text)->{throw new IllegalStateException("fixture offline");},clock,d->visits.incrementAndGet(),60_000,true);
            op.acceptChatAndWarn(chat("durable","씨발",clock.millis()));op.flush();
            assertThat(count("ai_chat_messages")).isEqualTo(1);assertThat(count("ai_incidents")).isEqualTo(1);
            assertThat(count("ai_incident_messages")).isEqualTo(1);assertThat(count("ai_notice_outbox")).isEqualTo(1);
            assertThat(store.read().notices).singleElement().satisfies(n->{assertThat(n.status()).isEqualTo("PENDING");assertThat(n.attempts()).isPositive();});
        }
        clock.now+=20_000;var delivered=new ArrayList<String>();
        try(var store=new JdbcAiStore(source,mapper)){
            var op=new AiOperations(store,new OfflineDecisions(),AiText.fixed(),(id,kind,text)->{
                // Proves external sending does not hold the store's database transaction lock.
                try(var c=source.getConnection();var s=c.createStatement()){
                    c.setAutoCommit(false);s.executeQuery("SELECT id FROM ai_runtime_state WHERE id=1 FOR UPDATE NOWAIT").close();c.rollback();
                }catch(SQLException e){throw new IllegalStateException(e);}
                delivered.add(text);return "TEST_MM";
            },clock,d->visits.incrementAndGet(),60_000,true);
            op.tick();op.acceptChatAndWarn(chat("durable","씨발",clock.millis()));op.flush();
            assertThat(delivered).hasSize(1).first().asString().contains("닉네임: 씨발");
            assertThat(visits).hasValue(1);assertThat(count("ai_incidents")).isEqualTo(1);
            assertThat(store.read().notices).allMatch(n->n.status().equals("SENT"));
        }
    }
    @Test void archiveRemainsInDbWhileWorkViewAndOldIdDedupStayBounded()throws Exception {
        try(var store=new JdbcAiStore(source,mapper)){
            store.change(data->{for(int i=0;i<125;i++)data.messages.add(new Message(chat("archive-"+i,"정상 대화",i),false,0,true));});
            assertThat(count("ai_chat_messages")).isEqualTo(125);assertThat(store.read().messages).hasSize(100);
            var op=new AiOperations(store,new OfflineDecisions(),AiText.fixed(),AiNotifier.local(),new TestClock(),d->{},60_000,true);
            op.acceptChatAndWarn(chat("archive-0","정상 대화",0));
            assertThat(count("ai_chat_messages")).isEqualTo(125);assertThat(count("ai_incidents")).isZero();
            op.acceptChatAndWarn(chat("fresh","씨발",System.currentTimeMillis()));op.flush();
            assertThat(count("ai_chat_messages")).isEqualTo(126);assertThat(count("ai_incidents")).isEqualTo(1);
        }
    }
    @Test void digestOnlyMarksTheReportsActuallySentToTheSummarizer()throws Exception {
        var factCounts=new ArrayList<Long>();
        AiText text=new AiText(){public Reply generate(String persona,String facts,String fallback){factCounts.add(facts.lines().count());return new Reply("요약","SPRING_AI");}public String mode(){return "TEST";}};
        try(var store=new JdbcAiStore(source,mapper)){
            store.change(data->{for(int i=0;i<125;i++)data.reports.add(new Report(UUID.randomUUID().toString(),"operation-"+i,"A","꽃을 심어 주세요",i,new AiDecisions.Triage("IDEA","OTHER",2,"TEST"),""));});
            var op=new AiOperations(store,new OfflineDecisions(),text,AiNotifier.local(),new TestClock(),d->{},60_000,true);
            op.digest();assertThat(queryCount("SELECT COUNT(*) FROM ai_feedback_reports WHERE state='DONE'")).isEqualTo(100);
            op.digest();assertThat(queryCount("SELECT COUNT(*) FROM ai_feedback_reports WHERE state='DONE'")).isEqualTo(125);
            assertThat(factCounts).containsExactly(100L,25L);
            var repeated=op.feedback("A","operation-0","꽃을 심어 주세요");
            assertThat(repeated.operationId()).isEqualTo("operation-0");assertThat(count("ai_feedback_reports")).isEqualTo(125);
            assertThatThrownBy(()->op.feedback("A","operation-0","다른 제보 내용입니다")).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void mutationRollsBackEveryTableAndConnectionStaysUsable()throws Exception {
        try(var store=new JdbcAiStore(source,mapper)){
            assertThatThrownBy(()->store.change(data->{
                data.messages.add(new Message(chat("rollback","정상",0),false,0,false));
                data.reports.add(new Report("x".repeat(80),"operation","A","실패용 제보",0,null,""));
            })).isInstanceOf(IllegalStateException.class);
            assertThat(count("ai_chat_messages")).isZero();assertThat(count("ai_feedback_reports")).isZero();
            store.change(data->data.messages.add(new Message(chat("after","정상",0),false,0,false)));
            assertThat(count("ai_chat_messages")).isEqualTo(1);
        }
    }
    @Test void longFeedbackIsCarriedIntoFollowingDigestsInsteadOfBeingTruncatedAndMarkedDone()throws Exception {
        var inputs=new ArrayList<String>();
        AiText text=new AiText(){public Reply generate(String persona,String facts,String fallback){inputs.add(facts);return new Reply("요약","SPRING_AI");}public String mode(){return "TEST";}};
        try(var store=new JdbcAiStore(source,mapper)){
            store.change(data->{for(int i=0;i<40;i++)data.reports.add(new Report(UUID.randomUUID().toString(),"long-"+i,"A","긴 제보 "+i+" "+"가".repeat(590),i,new AiDecisions.Triage("IDEA","OTHER",2,"TEST"),""));});
            var op=new AiOperations(store,new OfflineDecisions(),text,AiNotifier.local(),new TestClock(),d->{},60_000,true);
            op.digest();long first=inputs.getFirst().lines().count();
            assertThat(first).isBetween(1L,39L);
            assertThat(queryCount("SELECT COUNT(*) FROM ai_feedback_reports WHERE state='DONE'")).isEqualTo(first);
            op.digest();op.digest();
            assertThat(inputs).allMatch(facts->facts.length()<=AiText.MAX_FACTS_CHARACTERS);
            assertThat(inputs.stream().mapToLong(facts->facts.lines().count()).sum()).isEqualTo(40);
            assertThat(queryCount("SELECT COUNT(*) FROM ai_feedback_reports WHERE state='DONE'")).isEqualTo(40);
        }
    }
    @Test void onlyOneWorkerOwnsDatabaseAndShutdownReleasesOwnership()throws Exception {
        try(var first=new JdbcAiStore(source,mapper)){
            assertThatThrownBy(()->new JdbcAiStore(source,mapper)).isInstanceOf(IllegalStateException.class);
            first.change(data->data.lastDigestSlot="saved");
        }
        try(var next=new JdbcAiStore(source,mapper)){assertThat(next.read().lastDigestSlot).isEqualTo("saved");}
    }
    @Test void sameTimestampPreservesArrivalOrderInsteadOfSortingRandomMessageIds()throws Exception {
        try(var store=new JdbcAiStore(source,mapper)){
            store.change(data->data.messages.add(new Message(chat("z-first","첫 발화",100),false,0,false)));
            store.change(data->data.messages.add(new Message(chat("a-second","다음 발화",100),false,0,false)));
            assertThat(store.read().messages).extracting(m->m.chat().id()).containsExactly("z-first","a-second");
        }
    }
    @Test void duplicateLogicalOutboxKeyCannotOverwriteTheOriginalRecord()throws Exception {
        try(var store=new JdbcAiStore(source,mapper)){
            store.change(data->data.notices.add(new Notice(UUID.randomUUID().toString(),"case:fixed","PROFANITY_RULE","원문","PENDING",0,0,0)));
            assertThatThrownBy(()->store.change(data->data.notices.add(new Notice(UUID.randomUUID().toString(),"case:fixed","PROFANITY_RULE","덮어쓰기","PENDING",0,0,0))))
                    .isInstanceOf(IllegalStateException.class);
            assertThat(store.read().notices).singleElement().satisfies(n->assertThat(n.text()).isEqualTo("원문"));
        }
    }
    @Test void explicitRetryResetsDurableFailureStateWithoutResendingSuccessfulNotices()throws Exception {
        try(var store=new JdbcAiStore(source,mapper)){
            String incident=UUID.randomUUID().toString();
            store.change(data->{
                data.messages.add(new Message(chat("retry-source","정상",0),false,0,true));
                data.incidents.add(new Incident(incident,"world:one","NEGATIVE_SPEECH",List.of("retry-source"),0,"TEST",List.of("101"),0,0,"FAILED",5,5000));
                data.notices.add(new Notice(UUID.randomUUID().toString(),"case:"+incident,"NEGATIVE_SPEECH","재시도","FAILED",5,5000,0));
                data.notices.add(new Notice(UUID.randomUUID().toString(),"sent","NEGATIVE_SPEECH","이미 전송","SENT",1,0,100));
            });
            store.retryFailures(1234);
            assertThat(store.read().notices.stream().filter(n->n.key().startsWith("case:")).findFirst().orElseThrow())
                    .satisfies(n->{assertThat(n.status()).isEqualTo("PENDING");assertThat(n.attempts()).isZero();assertThat(n.nextAttemptAt()).isEqualTo(1234);});
            assertThat(store.incident(incident)).satisfies(i->{assertThat(i.policeStatus()).isEqualTo("PENDING");assertThat(i.policeAttempts()).isZero();assertThat(i.policeNextAttemptAt()).isEqualTo(1234);});
            assertThat(store.read().notices.stream().filter(n->n.key().equals("sent")).findFirst().orElseThrow().status()).isEqualTo("SENT");
        }
    }
    @Test void failedStartupReleasesSessionLockBeforeReturningPooledConnection()throws Exception {
        var config=new HikariConfig();config.setDataSource(source);config.setMaximumPoolSize(1);
        try(var pool=new HikariDataSource(config)){
            execute("RENAME TABLE ai_runtime_state TO ai_runtime_state_fixture");
            try{assertThatThrownBy(()->new JdbcAiStore(pool,mapper)).isInstanceOf(IllegalStateException.class);}
            finally{execute("RENAME TABLE ai_runtime_state_fixture TO ai_runtime_state");}
            try(var owner=new JdbcAiStore(source,mapper)){assertThat(owner.read()).isNotNull();}
        }
    }
    @Test void serviceConfigurationActuallyChoosesJdbcInProduction() {
        new WebApplicationContextRunner().withUserConfiguration(WorldAiConfiguration.class)
                .withPropertyValues("spring.profiles.active=prod,db","ontop.ai.enabled=true","AI_JEV_ENABLED=false","AI_MM_ENABLED=false","AI_POLICE_ENABLED=false","OPENAI_API_KEY=")
                .withBean(DataSource.class,()->source).withBean(ObjectMapper.class,ObjectMapper::new)
                .withInitializer(c->{c.getBeanFactory().registerSingleton("hub",mock(com.ssafy.ontop.table.service.TableHub.class));
                    c.getBeanFactory().registerSingleton("map",mock(com.ssafy.ontop.world.map.WorldMapRuntime.class));
                    c.getBeanFactory().registerSingleton("jumpmap",mock(com.ssafy.ontop.world.jumpmap.JumpmapActivation.class));})
                .run(c->{assertThat(c).hasSingleBean(LocalWorldAi.class);assertThat(c.getBean(AiStore.class)).isInstanceOf(JdbcAiStore.class);});
    }
    private static AiDecisions.Chat chat(String id,String text,long time){return new AiDecisions.Chat(id,"world:one","101",text,time,0,0,List.of("101"),"닉네임",0,true);}
    private static long count(String table)throws Exception{return queryCount("SELECT COUNT(*) FROM "+table);}
    private static long queryCount(String sql)throws Exception{try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery(sql)){r.next();return r.getLong(1);}}
    private static void execute(String sql)throws Exception{try(var c=source.getConnection();var s=c.createStatement()){s.execute(sql);}}
    static class TestClock extends Clock {
        long now=System.currentTimeMillis();public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return Instant.ofEpochMilli(now);}
    }
}
