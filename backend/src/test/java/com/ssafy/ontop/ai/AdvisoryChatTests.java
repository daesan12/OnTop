package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class AdvisoryChatTests {
    @Test void noticeScoreSurvivesFileRestartRetryAndSuccessfulDelivery()throws Exception {
        var mapper=new ObjectMapper();var clock=new MutableClock();
        AiDecisions provider=new AiDecisions(){
            public Moderation moderate(List<Chat> c,List<Chat> t){throw new AssertionError();}
            public ConflictAssessment assessConflict(List<Chat> c,List<Chat> t,long now){return new ConflictAssessment("fixture",.61,.5,true,now,c.stream().map(Chat::id).toList(),t.stream().map(Chat::id).toList(),"COARSE_NEGATIVITY_SUSPECTED","negative-advisory-v5");}
            public Triage triage(String text){throw new AssertionError();}
        };
        try(var store=new LocalAiStore(directory,mapper)){
            var op=new AiOperations(store,provider,AiText.fixed(),AiNotifier.local(),clock,d->{},60_000,true);
            op.failures(false,true);op.chat("A","world:one","부정적 발언 대역",0,0);op.flush();
            assertThat(store.read().notices).hasSize(1);assertThat(store.read().notices.getFirst().modelScore()).isEqualTo(.61);
        }
        var delivered=new ArrayList<Double>();
        AiNotifier notifier=new AiNotifier(){public String send(String id,String kind,String text){throw new AssertionError("Score must reach notifier");}public String send(String id,String kind,String text,Double score){delivered.add(score);return "FIXTURE";}};
        try(var store=new LocalAiStore(directory,mapper)){
            var op=new AiOperations(store,provider,AiText.fixed(),notifier,clock,d->{},60_000,true);
            op.retryNotices();op.flush();assertThat(delivered).containsExactly(.61);
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT");assertThat(store.read().notices.getFirst().modelScore()).isEqualTo(.61);
        }
        var old=mapper.readValue("{\"id\":\"old\",\"key\":\"old\",\"kind\":\"NEGATIVE_SPEECH\",\"text\":\"기존 알림\",\"status\":\"PENDING\",\"attempts\":0,\"nextAttemptAt\":0,\"sentAt\":0}",LocalAiStore.Notice.class);
        assertThat(old.modelScore()).isNull();
    }
    @Test void noticesQuoteOnlyDetectedMessagesWithTheirOriginalNicknamesAndSafeFormatting() throws Exception {
        var clock=new MutableClock();
        try(var store=new LocalAiStore(directory,new ObjectMapper())) {
            var op=new AiOperations(store,new OfflineDecisions(),AiText.fixed(),AiNotifier.local(),clock,d->{},60_000,true);
            op.acceptChat(new AiDecisions.Chat("normal","world:one","N","안녕하세요",clock.millis(),0,0,List.of(),"인사한 사람"));
            op.acceptChat(new AiDecisions.Chat("rule-a","world:one","A","씨발",clock.millis(),0,0,List.of(),"철수"));
            op.acceptChat(new AiDecisions.Chat("rule-b","world:one","B","병신\n``` @channel",clock.millis(),0,0,List.of(),"영희"));
            op.acceptChat(new AiDecisions.Chat("negative","world:one","C","아 ㅈ같네",clock.millis(),0,0,List.of(),"민수"));
            op.flush();
            var rule=store.read().notices.stream().filter(n->n.kind().equals("PROFANITY_RULE")).findFirst().orElseThrow().text();
            assertThat(rule).contains("감지된 발언","철수: 씨발","영희: 병신 ↵ ``` ＠channel","\n````\n").doesNotContain("인사한 사람","안녕하세요","민수: 아 ㅈ같네","@channel");
            var negative=store.read().notices.stream().filter(n->n.kind().equals("NEGATIVE_SPEECH")).findFirst().orElseThrow().text();
            assertThat(negative).contains("민수: 아 ㅈ같네").doesNotContain("철수: 씨발","영희: 병신","안녕하세요");
            assertThat(store.read().messages.stream().filter(m->m.chat().id().equals("rule-b")).findFirst().orElseThrow().chat().text()).isEqualTo("병신\n``` @channel");
        }
    }
    @TempDir Path directory;
    @Test void sharedFilterTriggersForEverythingMaskedIncludingQuotedTokens() {
        for(String text:List.of("씨발","씨.발","씨 발","ㅅㅂ","ＦＵＣＫ","병신년", "누가 '씨발'이라고 했어요"))assertThat(ChatWarningRules.matches(text)).as(text).isTrue();
        for(String text:List.of("안녕하세요","새끼 고양이","시발점","시발역","와 미친 실력","아 ㅈ같네","Scunthorpe"))assertThat(ChatWarningRules.matches(text)).as(text).isFalse();
    }
    @Test void ruleWarningsDispatchBeforeConflictFailureAndNeverHideOrRepeatTheSameInput() throws Exception {
        var mapper=new ObjectMapper(); var dispatched=new ArrayList<AiOperations.PoliceDispatch>();
        AiDecisions provider=new AiDecisions() {
            public Moderation moderate(List<Chat> c,List<Chat> t) { throw new AssertionError("No detailed chat moderation"); }
            public ConflictAssessment assessConflict(List<Chat> c,List<Chat> t,long now) {
                assertThat(dispatched).hasSize(1); throw new IllegalStateException("provider unavailable");
            }
            public Triage triage(String text) { return new Triage("BUG","AUTH",0,"fixture"); }
        };
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=new AiOperations(store,provider,AiText.fixed(),AiNotifier.local(),Clock.systemUTC(),dispatched::add,60_000,true);
            var chat=new AiDecisions.Chat("one","world:one","A","씨발",System.currentTimeMillis(),4,4);
            op.acceptChat(chat); op.acceptChat(chat); op.flush();
            assertThat(store.read().messages).hasSize(1).noneMatch(LocalAiStore.Message::hidden);
            assertThat(store.read().incidents).hasSize(1).allMatch(i -> i.kind().equals("PROFANITY_RULE"));
            assertThat(store.read().notices).hasSize(1).allMatch(n -> n.status().equals("SENT"));
            assertThat(store.read().notices.getFirst().text()).contains("욕설 규칙 감지","채팅은 유지").doesNotContain("개 가림");
            assertThat(store.read().messages.getFirst().processed()).isFalse();
        }
    }
    @Test void newBatchesNotifyAgainAndFeedbackIsUnchanged() throws Exception {
        var conflictCalls=new AtomicInteger(); var feedbackCalls=new AtomicInteger(); var dispatched=new ArrayList<AiOperations.PoliceDispatch>();
        AiDecisions provider=new AiDecisions() {
            public Moderation moderate(List<Chat> c,List<Chat> t) { throw new AssertionError("No detailed chat moderation"); }
            public ConflictAssessment assessConflict(List<Chat> c,List<Chat> t,long now) {
                conflictCalls.incrementAndGet();return new ConflictAssessment("fixture",.98,.85,true,now,
                        c.stream().map(Chat::id).toList(),t.stream().map(Chat::id).toList(),"MEDIATION_SUSPECTED","conflict-advisory-v1");
            }
            public Triage triage(String text) { feedbackCalls.incrementAndGet();return new Triage("BUG","AUTH",0,"fixture"); }
        };
        try(var store=new LocalAiStore(directory,new ObjectMapper())) {
            var op=new AiOperations(store,provider,AiText.fixed(),AiNotifier.local(),Clock.systemUTC(),dispatched::add,60_000,true);
            op.chat("A","world:one","씨발",4,4); op.chat("A","world:one","씨발 또",4,4);
            op.chat("B","world:one","너나 그만해",4,4); op.feedback("A","feedback-test","전체 접속 불가입니다");op.flush();
            assertThat(conflictCalls).hasValue(1);assertThat(feedbackCalls).hasValue(1);
            assertThat(store.read().messages).allMatch(LocalAiStore.Message::processed).noneMatch(LocalAiStore.Message::hidden);
            assertThat(dispatched).hasSize(2);
            assertThat(store.read().notices.stream().filter(n -> n.kind().equals("PROFANITY_RULE"))).hasSize(1);
            assertThat(store.read().notices).anyMatch(n -> n.kind().equals("NEGATIVE_SPEECH"))
                    .anyMatch(n -> n.kind().equals("URGENT_FEEDBACK"));
            assertThat(store.read().conflictAssessments).hasSize(1);
        }
    }
    @Test void eachNewBatchNotifiesAgainWithoutReplayingRulesAfterProviderFailure() throws Exception {
        var dispatched=new ArrayList<AiOperations.PoliceDispatch>();var clock=new MutableClock();
        AiDecisions failing=new AiDecisions(){public Moderation moderate(List<Chat> c,List<Chat> t){throw new IllegalStateException();}public Triage triage(String s){return new Triage("SUGGESTION","OTHER",3,"fixture");}};
        try(var store=new LocalAiStore(directory,new ObjectMapper())){
            var op=new AiOperations(store,failing,AiText.fixed(),AiNotifier.local(),clock,dispatched::add,60_000,true);
            op.acceptChat(new AiDecisions.Chat("m1","world:one","A","씨발",clock.millis(),0,0));op.acceptChat(new AiDecisions.Chat("pending","world:one","A","아 ㅈ같네",clock.millis(),0,0));op.tick();assertThat(dispatched).isEmpty();
            clock.at+=10_000;op.tick();assertThat(dispatched).hasSize(1);
            op.acceptChat(new AiDecisions.Chat("m2","world:one","A","병신",clock.millis(),0,0));clock.at+=10_000;op.tick();
            assertThat(dispatched).hasSize(2);assertThat(store.read().notices).hasSize(2);
            assertThat(store.read().incidents.stream().flatMap(i->i.messageIds().stream()).toList()).containsExactly("m1","m2");
            op.flush();assertThat(dispatched).hasSize(2);
        }
    }
    @Test void oneSpeakersUnmaskedFrustrationCanWarnWithoutTouchingText() throws Exception {
        var clock=new MutableClock();var dispatched=new ArrayList<AiOperations.PoliceDispatch>();
        try(var store=new LocalAiStore(directory,new ObjectMapper())){
            var op=new AiOperations(store,new OfflineDecisions(),AiText.fixed(),AiNotifier.local(),clock,dispatched::add,60_000,true);
            op.chat("A","world:one","아 ㅈ같네",0,0);clock.at+=10_000;op.tick();
            assertThat(dispatched).hasSize(1);assertThat(dispatched.getFirst().kind()).isEqualTo("NEGATIVE_SPEECH");
            assertThat(store.read().messages).noneMatch(LocalAiStore.Message::hidden);assertThat(store.read().notices).hasSize(1);
        }
    }
    static class MutableClock extends Clock {long at=100_000;public java.time.ZoneId getZone(){return java.time.ZoneOffset.UTC;}public Clock withZone(java.time.ZoneId z){return this;}public java.time.Instant instant(){return java.time.Instant.ofEpochMilli(at);}}

}
