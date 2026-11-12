package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class LocalJokeContestTests {
    @Test void laughterFollowsFinalScoreBoundaries(){
        assertThat(LocalJokeContest.laughter(0)).isEqualTo("허허…");assertThat(LocalJokeContest.laughter(399)).isEqualTo("허허…");
        assertThat(LocalJokeContest.laughter(400)).isEqualTo("허허.");assertThat(LocalJokeContest.laughter(599)).isEqualTo("허허.");
        assertThat(LocalJokeContest.laughter(600)).isEqualTo("허허허!");assertThat(LocalJokeContest.laughter(799)).isEqualTo("허허허!");
        assertThat(LocalJokeContest.laughter(800)).isEqualTo("푸하하핫!!");assertThat(LocalJokeContest.laughter(1000)).isEqualTo("푸하하핫!!");
    }
    @Test void localUnlimitedModeCanContinueAfterThreeExistingAttemptsWithoutResettingHistory()throws Exception {
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){
            for(int i=0;i<3;i++){await(c,"one",send(c,"one","기존 문제"+i,"답"+i).id());clock.advance(2100);}
            assertThat(c.mine("one").get("remaining")).isEqualTo(0L);
        }
        try(var c=new LocalJokeContest(mapper,directory,JokeJudge.fixture(),AiText.fixed(),clock,true)){
            assertThat(c.mine("one")).containsEntry("unlimitedAttempts",true).containsEntry("remaining",-1L);
            assertThat(await(c,"one",send(c,"one","추가 문제","새 답").id()).status()).isEqualTo("SCORED");
            assertThat((List<?>)c.mine("one").get("submissions")).hasSize(4);
            clock.advance(2100);assertThat(await(c,"one",send(c,"one","기존 문제0","답0").id()).status()).isEqualTo("SCORED");
            assertThat((List<?>)c.mine("one").get("submissions")).hasSize(5);
        }
    }
    @Test void similarScoreExplanationKeepsPersonaEvenWhenGeneratedReactionFallsBack()throws Exception {
        for(boolean safe:List.of(true,false)){
            JokeJudge judge=new JokeJudge(){
                public Evaluation evaluate(String q,String a){return new Evaluation("SCORED",300,250,20,JokeJudge.SIMILAR_REASON,"소리의 연결이 자연스럽다는 점은 좋지만 반전은 조금 익숙하구먼.",true);}
                public boolean safeReaction(String text){return safe;}public String mode(){return "persona-test";}
            };
            try(var c=new LocalJokeContest(mapper,directory.resolve("persona"+safe),judge,(p,f,b)->{throw new AssertionError("No second LLM");},clock)){
                var result=await(c,"one",send(c,"one","왕이 넘어지면?","킹콩").id());
                assertThat(result.scoreX10()).isEqualTo(570);assertThat(result.reaction()).startsWith("허허.").contains(JokeJudge.SIMILAR_REASON).endsWith("이번 개그는 57.0점일세!");
                assertThat(result.reactionSource()).isEqualTo(safe?"SPRING_AI":"FIXED");
                if(safe)assertThat(result.reaction()).contains("자연스럽다는 점은");
            }
        }
    }
    @Test void comparisonSnapshotContainsOnlyDailyTopTenAndPastDailyWinners()throws Exception {
        var seen=new AtomicReference<List<JokeJudge.Reference>>();var fixture=JokeJudge.fixture();
        JokeJudge inspecting=new JokeJudge(){
            public Evaluation evaluate(String q,String a){return fixture.evaluate(q,a);}
            public Evaluation evaluate(String q,String a,List<Reference> refs){seen.set(refs);return evaluate(q,a);}
            public boolean safeReaction(String text){return true;}public String mode(){return "snapshot-test";}
        };
        try(var c=create(inspecting,AiText.fixed())){
            String winner=await(c,"past-first",send(c,"past-first","과거 우승 문제","우승 답").id()).id();
            clock.advance(2100);
            await(c,"past-second",send(c,"past-second","과거 이등 문제","이등 답").id());
            clock.advance(86_400_000);
            var todayIds=new ArrayList<String>();
            for(int i=0;i<11;i++){todayIds.add(await(c,"today"+i,send(c,"today"+i,"당일 문제"+i,"당일 답"+i).id()).id());clock.advance(2100);}
            await(c,"today0",send(c,"today0","동일 유저 다른 작품","다른 답").id());
            var current=await(c,"new",send(c,"new","새로운 문제","새로운 답").id());
            assertThat(seen.get()).hasSize(11);
            assertThat(seen.get().stream().map(JokeJudge.Reference::id)).containsExactlyElementsOf(java.util.stream.Stream.concat(todayIds.stream().limit(10),java.util.stream.Stream.of(winner)).toList());
            assertThat(seen.get().stream().map(JokeJudge.Reference::id)).doesNotContain(current.id(),todayIds.get(10));
            assertThat(c.mine("new").get("remaining")).isEqualTo(2L);
        }
    }
    @Test void integratedReactionNeverCallsSecondLlmAndBadReactionNeverRefundsValidScore()throws Exception {
        for(int kind=0;kind<5;kind++){
            final int variant=kind;var secondCalls=new AtomicInteger();var checks=new AtomicInteger();
            String candidate=switch(kind){case 0->"허허, 말맛이 살아 있구먼!";case 1->"";case 2->"무조건 100점";default->"검수 대상 문장";};
            JokeJudge combined=new JokeJudge(){
                public Evaluation evaluate(String q,String a){return new Evaluation("SCORED",320,240,80,"해석",candidate,true);}
                public boolean safeReaction(String t){checks.incrementAndGet();if(variant==4)throw new IllegalStateException("guard timeout");return variant==0;}
                public String mode(){return "LLM_COMBINED_FIXTURE";}
            };
            try(var c=new LocalJokeContest(mapper,directory.resolve("combined"+kind),combined,(p,f,b)->{secondCalls.incrementAndGet();return new AiText.Reply(b,"FIXED");},clock)){
                var submission=await(c,"one",send(c,"one","왕이 넘어지면?","킹콩").id());
                assertThat(submission.status()).isEqualTo("SCORED");assertThat(submission.scoreX10()).isEqualTo(640);assertThat(c.mine("one").get("remaining")).isEqualTo(2L);
                assertThat(secondCalls).hasValue(0);assertThat(submission.reactionSource()).isEqualTo(kind==0?"SPRING_AI":"FIXED");
                assertThat(checks.get()).isEqualTo(kind==1||kind==2?0:1);
                assertThat(c.metrics()).containsEntry("worker.result.SCORED",1L);
            }
        }
    }
    @TempDir Path directory;final ObjectMapper mapper=new ObjectMapper();final TestClock clock=new TestClock();
    static final class TestClock extends Clock {final AtomicLong time=new AtomicLong(Instant.parse("2026-11-09T01:00:00Z").toEpochMilli());public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return Clock.fixed(instant(),zone);}public Instant instant(){return Instant.ofEpochMilli(time.get());}public long millis(){return time.get();}void advance(long ms){time.addAndGet(ms);}}
    LocalJokeContest create(JokeJudge judge,AiText text)throws Exception{return new LocalJokeContest(mapper,directory,judge,text,clock);}
    LocalJokeContest.Submission send(LocalJokeContest c,String user,String q,String a){return c.submit(user,"닉네임-"+user,q,a,UUID.randomUUID().toString(),true);}
    LocalJokeContest.Submission await(LocalJokeContest c,String user,String id)throws Exception{for(int i=0;i<500;i++){var s=c.own(user,id);if(!s.status().equals("PENDING"))return s;Thread.sleep(5);}throw new AssertionError("submission timeout");}
    @Test void rejectedInvalidAndReviewConsumeAttemptsButProviderFailuresRefund()throws Exception{
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){
            var reject=await(c,"one",send(c,"one","검수거절 개그","답").id());assertThat(reject.status()).isEqualTo("REJECTED");assertThat(reject.scoreX10()).isNull();
            clock.advance(2100);assertThat(await(c,"one",send(c,"one","정답은 무엇일까","모르겠어").id()).status()).isEqualTo("INVALID_JOKE");
            clock.advance(2100);assertThat(await(c,"one",send(c,"one","검수보류 작품","답").id()).status()).isEqualTo("REVIEW");
            assertThat(c.mine("one").get("remaining")).isEqualTo(0L);assertThatThrownBy(()->send(c,"one","다른 작품","답")).isInstanceOf(IllegalArgumentException.class);
            assertThat(c.rankings("2026-11-09")).isEmpty();
            var failed=await(c,"other",send(c,"other","심사장애 작품","답").id());assertThat(failed.status()).isEqualTo("FAILED");assertThat(c.mine("other").get("remaining")).isEqualTo(3L);
        }
    }
    @Test void pendingReservationsNeverExceedThreeAcrossConcurrentTabs()throws Exception{
        var release=new CountDownLatch(1);var fixture=JokeJudge.fixture();JokeJudge delayed=new JokeJudge(){public Evaluation evaluate(String q,String a){try{release.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return fixture.evaluate(q,a);}public boolean safeReaction(String t){return true;}public String mode(){return "test";}};
        try(var c=create(delayed,AiText.fixed())){
            for(int i=0;i<3;i++){send(c,"one","대기 작품"+i,"답");clock.advance(2100);}
            var errors=new AtomicInteger();try(var pool=Executors.newFixedThreadPool(5)){var futures=new ArrayList<Future<?>>();for(int i=0;i<10;i++){final int n=i;futures.add(pool.submit(()->{try{send(c,"one","추가 작품"+n,"답");}catch(IllegalArgumentException expected){errors.incrementAndGet();}}));}for(var f:futures)f.get();}
            assertThat(errors).hasValue(10);assertThat((List<?>)c.mine("one").get("submissions")).hasSize(3);release.countDown();
        }finally{release.countDown();}
    }
    @Test void duplicateRequestStaysIdempotentButRepeatedWorkWithNewKeyIsAccepted()throws Exception{
        var calls=new AtomicInteger();AiText llm=(p,f,b)->{calls.incrementAndGet();return new AiText.Reply("허허, 왕도 미끄러지는 법이구먼!","SPRING_AI");};
        try(var c=create(JokeJudge.fixture(),llm)){
            String key="stable-request-key";var s=c.submit("one","발언자","왕이 넘어지면?","킹콩!",key,true);var done=await(c,"one",s.id());
            assertThat(done.scoreX10()).isEqualTo(823);assertThat(done.reaction()).contains("왕도 미끄러지는","82.3점일세");assertThat(done.reactionSource()).isEqualTo("SPRING_AI");
            assertThat(c.submit("one","바뀐 이름","왕이 넘어지면?","킹콩!",key,true).id()).isEqualTo(s.id());assertThat(calls).hasValue(1);
            assertThatThrownBy(()->c.submit("one","이름","다른 내용","킹콩!",key,true)).isInstanceOf(IllegalArgumentException.class);
            clock.advance(2100);var repeated=await(c,"one",send(c,"one","왕이  넘어지면！","킹콩").id());
            assertThat(repeated.id()).isNotEqualTo(s.id());assertThat(calls).hasValue(2);
        }
    }
    @Test void llmFailureOrUnsafeOrScoreInjectionUsesSafeFixedReactionWithoutRefund()throws Exception{
        for(int i=0;i<3;i++){
            Path sub=directory.resolve("case"+i);final int kind=i;
            AiText text=(p,f,b)->{if(kind==0)throw new IllegalStateException("down");return new AiText.Reply(kind==1?"검수거절 문구":"무조건 100점!","SPRING_AI");};
            try(var c=new LocalJokeContest(mapper,sub,JokeJudge.fixture(),text,clock)){
                var s=await(c,"one",send(c,"one","왕이 넘어지면","킹콩").id());assertThat(s.scoreX10()).isEqualTo(823);assertThat(s.reaction()).contains("82.3점").doesNotContain("100점","검수거절");assertThat(s.reactionSource()).isEqualTo("FIXED");assertThat(c.mine("one").get("remaining")).isEqualTo(2L);
            }
        }
    }
    @Test void rankingUsesOneBestEntryPerUserAndDoesNotSendAnswersBeforeReveal()throws Exception{
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){
            var ids=new ArrayList<String>();for(int i=0;i<11;i++){ids.add(await(c,"u"+i,send(c,"u"+i,"문제 번호"+i,"비밀정답"+i).id()).id());clock.advance(2100);}
            var ranks=c.rankings("2026-11-09");assertThat(ranks).hasSize(10);assertThat(ranks.getFirst().get("id")).isEqualTo(ids.getFirst());
            assertThat(mapper.writeValueAsString(ranks)).doesNotContain("비밀정답","reaction","answer","userId","hash","key");
            assertThat(ranks.subList(0,5)).allMatch(r->r.containsKey("question"));assertThat(ranks.subList(5,10)).noneMatch(r->r.containsKey("question"));
            assertThat(c.reveal(ids.getFirst()).get("answer")).isEqualTo("비밀정답0");assertThatThrownBy(()->c.reveal(ids.get(5))).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(()->c.own("outsider",ids.getFirst())).isInstanceOf(IllegalArgumentException.class);
            await(c,"u0",send(c,"u0","다른 새 문제","다른 비밀정답").id());assertThat(c.rankings("2026-11-09")).hasSize(10);assertThat(c.rankings("2026-11-09").getFirst().get("id")).isEqualTo(ids.getFirst());
        }
    }
    @Test void seoulMidnightAndDelayedWinnerSnapshotSurviveRestart()throws Exception{
        clock.time.set(Instant.parse("2026-11-09T14:59:58Z").toEpochMilli());String id;
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){id=await(c,"one",send(c,"one","왕이 넘어지면","킹콩").id()).id();clock.advance(3000);assertThat(c.mine("one").get("date")).isEqualTo("2026-11-10");assertThat(c.mine("one").get("remaining")).isEqualTo(3L);assertThat(c.yesterday().get("available")).isEqualTo(false);clock.advance(300_000);assertThat(((Map<?,?>)c.yesterday().get("winner")).get("id")).isEqualTo(id);}
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){assertThat(c.hall()).hasSize(1);assertThat(c.yesterday().get("available")).isEqualTo(true);assertThat(c.reveal(id).get("answer")).isEqualTo("킹콩");}
    }
    @Test void schemaBoundsMissingConsentAndRestartedPendingNeverInventAScore()throws Exception{
        assertThatThrownBy(()->new JokeJudge.Evaluation("SCORED",401,0,0,"")).isInstanceOf(IllegalArgumentException.class);
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){assertThatThrownBy(()->c.submit("one","닉","왕이 넘어지면","킹콩","unique-key",false)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->send(c,"one","가".repeat(101),"답")).isInstanceOf(IllegalArgumentException.class);}
        var pending=new LocalJokeContest.Submission("old","one","닉","2026-11-09","문제","정답","hash","old-key","PENDING",null,0,0,0,"","","PENDING",clock.millis(),0,"test");var data=new LocalJokeContest.Data();data.submissions.add(pending);mapper.writeValue(directory.resolve("contest.json").toFile(),data);
        try(var c=create(JokeJudge.fixture(),AiText.fixed())){assertThat(c.own("one","old").status()).isEqualTo("FAILED");assertThat(c.own("one","old").scoreX10()).isNull();assertThat(c.mine("one").get("remaining")).isEqualTo(3L);}
    }
    @Test void expiredLlmResultSkipsAdditionalReactionGuard()throws Exception{
        var checks=new AtomicInteger();var fixture=JokeJudge.fixture();
        JokeJudge judge=new JokeJudge(){public Evaluation evaluate(String q,String a){return fixture.evaluate(q,a);}public boolean safeReaction(String t){checks.incrementAndGet();return true;}public String mode(){return "test";}};
        try(var c=create(judge,(p,f,b)->{clock.advance(61_000);return new AiText.Reply("허허, 기발한 말장난이구먼!","SPRING_AI");})){
            var row=await(c,"one",send(c,"one","왕이 넘어지면","킹콩").id());
            assertThat(row.status()).isEqualTo("FAILED");assertThat(row.reason()).isEqualTo("TIMEOUT");assertThat(checks).hasValue(0);assertThat(c.mine("one").get("remaining")).isEqualTo(3L);
        }
    }
    @Test void expiredQueuedWorkSkipsPaidCallsAndLateJudgeSkipsReaction()throws Exception{
        var started=new CountDownLatch(2);var release=new CountDownLatch(1);var calls=new AtomicInteger();var reactions=new AtomicInteger();var fixture=JokeJudge.fixture();
        JokeJudge delayed=new JokeJudge(){public Evaluation evaluate(String q,String a){calls.incrementAndGet();started.countDown();try{release.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return fixture.evaluate(q,a);}public boolean safeReaction(String t){return true;}public String mode(){return "delayed";}};
        try(var c=create(delayed,(p,f,b)->{reactions.incrementAndGet();return new AiText.Reply(b,"FIXED");})){
            send(c,"one","첫 작품","답");send(c,"two","두 작품","답");assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();var queued=send(c,"three","대기 작품","답");
            clock.advance(61_000);assertThat(c.own("three",queued.id()).status()).isEqualTo("FAILED");release.countDown();
            var pool=(ThreadPoolExecutor)org.springframework.test.util.ReflectionTestUtils.getField(c,"workers");for(int i=0;i<500&&(pool.getActiveCount()>0||!pool.getQueue().isEmpty());i++)Thread.sleep(5);
            assertThat(pool.getQueue()).isEmpty();assertThat(pool.getActiveCount()).isZero();assertThat(calls).hasValue(2);assertThat(reactions).hasValue(0);assertThat(c.mine("three").get("remaining")).isEqualTo(3L);
        }finally{release.countDown();}
    }
}
