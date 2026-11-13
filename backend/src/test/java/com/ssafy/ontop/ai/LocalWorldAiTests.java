package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class LocalWorldAiTests {
    @Test void feedbackDigestUsesInjectedTextProviderAndKeepsSummarySourceMetrics()throws Exception {
        var calls=new java.util.concurrent.atomic.AtomicInteger();var hub=mock(TableHub.class);
        AiText summary=new AiText(){
            public Reply generate(String persona,String facts,String fallback){calls.incrementAndGet();assertThat(persona).contains("소리함 요약","원문에 없는");assertThat(facts).contains("꽃을 심어 주세요");return new Reply("- 중앙 벤치 주변 조경 개선 요청 @channel","SPRING_AI");}
            public String mode(){return "SPRING_AI";}
        };
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,new OfflineDecisions(),AiNotifier.local(),hub,null,true,summary)){
            ai.feedback(new WorldAiBridge.Feedback("summary-fixture","505","one","중앙 벤치 주변에 꽃을 심어 주세요."));
            ai.digest();ai.step();assertThat(calls).hasValue(1);assertThat(ai.status()).containsEntry("feedbackSummaryProvider","SPRING_AI");
            var worker=(Map<?,?>)ai.status().get("worker");assertThat(((Map<?,?>)worker.get("metrics")).get("feedback_summary.generated")).isEqualTo(1L);
        }
        try(var store=new LocalAiStore(directory,new ObjectMapper())){
            assertThat(store.read().notices).hasSize(1);assertThat(store.read().notices.getFirst().text()).contains("조경 개선 요청","＠channel").doesNotContain("@channel");
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT");
        }
    }
    @Test void ruleWarningsContinueWhileSemanticProviderBlocksAndDuplicateIdsNeverWarnTwice()throws Exception {
        var started=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        var warned=new java.util.concurrent.CountDownLatch(1);var bothWarnings=new java.util.concurrent.CountDownLatch(2);var fixture=new OfflineDecisions();
        var decisions=mock(AiDecisions.class,org.mockito.AdditionalAnswers.delegatesTo(fixture));
        doAnswer(call->{started.countDown();release.await(5,java.util.concurrent.TimeUnit.SECONDS);return fixture.assessConflict(call.getArgument(0),call.getArgument(1),call.getArgument(2));})
                .when(decisions).assessConflict(anyList(),anyList(),anyLong());
        var hub=mock(TableHub.class);
        doAnswer(call->{warned.countDown();bothWarnings.countDown();return null;}).when(hub).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_PRIVATE_NOTICE"),any());
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,decisions,AiNotifier.local(),hub,null,true)){
            ai.chat(chat("context","안녕하세요",""));ai.flush();
            var running=java.util.concurrent.CompletableFuture.runAsync(ai::step);
            assertThat(started.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            long sent=System.nanoTime();ai.chat(chat("rule-during-api","씨발",""));
            assertThat(warned.await(2,java.util.concurrent.TimeUnit.SECONDS)).as("rule warning must not await semantic release").isTrue();
            assertThat(release.getCount()).isEqualTo(1);
            long delayMs=(System.nanoTime()-sent)/1_000_000;
            ai.chat(chat("rule-during-api","씨발",""));ai.chat(chat("new-rule","씨발",""));
            assertThat(bothWarnings.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            verify(hub,times(2)).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_PRIVATE_NOTICE"),any());
            release.countDown();running.get(3,java.util.concurrent.TimeUnit.SECONDS);ai.flush();ai.step();
            verify(hub,times(2)).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_PRIVATE_NOTICE"),any());
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_CHAT_MODERATED"),any(),anyString());
            System.out.println("rule-warning-under-blocked-provider-ms="+delayMs);
        }finally{release.countDown();}
        try(var store=new LocalAiStore(directory,new ObjectMapper())){
            assertThat(store.read().incidents).hasSize(2).allMatch(i->i.kind().equals("PROFANITY_RULE"));
            assertThat(store.read().notices).hasSize(2);
        }
    }
    @TempDir Path directory;
    @Test void advisoryChatWarnsWithoutMaskingOrReplayingHistoricalMasks() throws Exception {
        var mapper=new ObjectMapper(); var hub=mock(TableHub.class);
        try(var store=new LocalAiStore(directory,mapper)) {
            store.change(d -> d.messages.add(new LocalAiStore.Message(new AiDecisions.Chat("old","world:one","101","old",0,4,4),true,1,true)));
        }
        try(var ai=new LocalWorldAi(mapper,directory,new OfflineDecisions(),AiNotifier.local(),hub,null,true)) {
            ai.chat(chat("fresh","씨발","")); ai.flush(); ai.step();
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_CHAT_MODERATED"),any(),anyString());
            verify(hub).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_PRIVATE_NOTICE"),any());
        }
        try(var store=new LocalAiStore(directory,mapper)) {
            assertThat(store.read().messages.stream().filter(m -> m.chat().id().equals("fresh"))).noneMatch(LocalAiStore.Message::hidden);
        }
    }
    @Test void forcedBatchPublishesMasksBeforeStartingTheFollowingBatch() throws Exception {
        var hub=mock(TableHub.class); var masks=new java.util.concurrent.atomic.AtomicInteger();
        doAnswer(invocation -> { masks.incrementAndGet(); return null; }).when(hub)
                .publishAi(anyString(),anyList(),eq("WORLD_CHAT_MODERATED"),any(),anyString());
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var publishedFirst=new java.util.concurrent.atomic.AtomicBoolean();
        var second=new java.util.concurrent.CountDownLatch(1);
        AiDecisions probe=new AiDecisions() {
            public Moderation moderate(List<Chat> context,List<Chat> targets) {
                if(calls.incrementAndGet()==2) { publishedFirst.set(masks.get()>=10); second.countDown(); }
                return new OfflineDecisions().moderate(context,targets);
            }
            public Triage triage(String text) { return new OfflineDecisions().triage(text); }
        };
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,probe,AiNotifier.local(),hub)) {
            for(int i=0;i<25;i++) ai.chat(chat("ordered-"+i,"씨발", ""));
            ai.flush(); ai.step();
            assertThat(second.await(3,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(publishedFirst).isTrue();
        }
    }
    @Test void invalidInputDoesNotStarveFollowingModerationAndOutbox() throws Exception {
        var hub=mock(TableHub.class);
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,new OfflineDecisions(),AiNotifier.local(),hub)) {
            ai.chat(chat("bad","a".repeat(401),""));
            ai.chat(chat("good","씨발",""));
            ai.flush(); ai.step();
            assertThat(ai.status()).containsEntry("rejected",1L).containsEntry("hidden",1L);
            verify(hub).publishAi(eq("one"),eq(List.of("101","202")),eq("WORLD_CHAT_MODERATED"),any(),eq(""));
        }
    }
    @Test void gameScopeKeepsGameIdAndOriginalAudience() throws Exception {
        var hub=mock(TableHub.class);
        String game="1f045852-2f36-4ade-a966-e47e507f1eee";
        String event="00000000-0000-4000-8000-000000000001";
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,new OfflineDecisions(),AiNotifier.local(),hub)) {
            ai.chat(chat(game+":101:"+event,"씨발",game)); ai.flush(); ai.step();
            verify(hub).publishAi(eq("one"),eq(List.of("101","202")),eq("GAME_CHAT_MODERATED"),any(),eq(game));
        }
        try(var store=new LocalAiStore(directory,new ObjectMapper())) {
            var saved=store.read().messages.getFirst().chat();
            assertThat(saved.author()).isEqualTo("101");
            assertThat(saved.speaker()).isEqualTo("닉네임 [101]");
            assertThat(saved.y()).isEqualTo(3);
        }
    }
    @Test void gameAdvisoryOnlyNotifiesEachAuthorAndNeverCreatesAPoliceVisit() throws Exception {
        var mapper=new ObjectMapper();var hub=mock(TableHub.class);
        String game="1f045852-2f36-4ade-a966-e47e507f1eee";
        try(var ai=new LocalWorldAi(mapper,directory,new OfflineDecisions(),AiNotifier.local(),hub,
                () -> {throw new AssertionError("Game notice must not request a police path");},true)) {
            ai.chat(chat("game-rule","씨발",game));
            ai.chat(new WorldAiBridge.Chat("game-negative","one","202","다른 닉네임","아 ㅈ같네",System.currentTimeMillis(),-10,3,40,List.of("101","202"),game));
            ai.flush();ai.step();
            for(String author:List.of("101","202")) verify(hub).publishAi(eq("one"),eq(List.of(author)),eq("WORLD_AI_PRIVATE_NOTICE"),
                    argThat(p -> p instanceof Map<?,?> v && game.equals(v.get("gameId"))
                            && "함께 즐기는 게임이에요. 서로 존중하는 표현을 사용해주세요.".equals(v.get("text"))),eq(game));
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_AI_POLICE"),any(),anyString());
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_CHAT_MODERATED"),any(),anyString());
            verify(hub,never()).publishAi(anyString(),anyList(),eq("GAME_CHAT_MODERATED"),any(),anyString());
        }
        try(var store=new LocalAiStore(directory,mapper)) {
            assertThat(store.read().messages).hasSize(2).allMatch(m -> m.processed()&&!m.hidden());
            assertThat(store.read().incidents).hasSize(2).allMatch(i -> i.policeStatus().equals("NOTIFIED"));
            assertThat(store.read().notices).hasSize(2).allSatisfy(n -> {
                assertThat(n.status()).isEqualTo("SENT");
                assertThat(n.text()).contains("경기 채팅 안내","경찰은 출동하지 않습니다").doesNotContain("경찰 출동 요청");
            });
        }
    }
    private WorldAiBridge.Chat chat(String id,String text,String game) {
        return new WorldAiBridge.Chat(id,"one","101","닉네임",text,System.currentTimeMillis(),-10,3,40,List.of("101","202"),game);
    }
}
