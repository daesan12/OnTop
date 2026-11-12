package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.file.*;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class JevPolicyAuditTests {
    @TempDir Path directory;
    record Scores(double personal,double member,double profanity,double mention) { }
    final ObjectMapper mapper=new ObjectMapper();
    final AtomicReference<com.fasterxml.jackson.databind.JsonNode> captured=new AtomicReference<>();
    final AtomicReference<Double> conflictScore=new AtomicReference<>(.01);
    final AtomicReference<Scores> scores=new AtomicReference<>(new Scores(.1,.1,.65,.01));
    HttpServer server() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            var request=mapper.readTree(exchange.getRequestBody()); captured.set(request); var answers=mapper.createObjectNode(); var s=scores.get();
            request.path("questions").fieldNames().forEachRemaining(name -> {
                double value=name.startsWith("utterance_")?s.personal():name.startsWith("message_")?s.member():
                        name.startsWith("profanity_")?s.profanity():name.startsWith("mention_")?s.mention():name.equals("negative_1")?.01:conflictScore.get();
                answers.putObject(name).put("type","noul").put("noul",value);
            });
            byte[] bytes=mapper.writeValueAsBytes(Map.of("answers",answers));
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start(); return server;
    }
    JevDecisions client(HttpServer server) {
        return new JevDecisions(mapper,"test-not-real","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),
                .95,.85,() -> JevDecisions.DEFAULT_MODERATION_GUIDANCE,.85);
    }
    @Test void advisoryClassifiesEachNewMessageEvenWithOneSpeakerAndKeepsFeedbackQuestions() throws Exception {
        var server=server();
        try {
            var client=client(server);
            var a=new AiDecisions.Chat("a","world:one","A","너나 그만해",10_000,4,4);
            var b=new AiDecisions.Chat("b","world:one","B","차분하게 이야기해요",10_001,4,4);
            assertThat(client.assessConflict(List.of(a),List.of(a),10_001).suspected()).isFalse();
            assertThat(client.usage().get("calls")).isEqualTo(1L);
            conflictScore.set(.98);
            var result=client.assessConflict(List.of(a,b),List.of(a,b),10_001);
            assertThat(result.suspected()).isTrue();
            assertThat(result.policyVersion()).isEqualTo("negative-advisory-v5");
            assertThat(captured.get().path("questions").size()).isEqualTo(2);
            assertThat(captured.get().path("questions").has("negative_0")).isTrue();
            assertThat(result.pendingMessageIds()).containsExactly("a");
            var instructions=captured.get().path("questions").path("negative_0").path("instructions");
            assertThat(instructions.path("target").asText()).isEqualTo("A: 너나 그만해");
            assertThat(instructions.path("question").asText()).contains("Profanity is NOT required", "그렇게 살지마", "가정교육 못 받으심?", "caring advice", "신고하고 싶어요");
            client.triage("전체 접속 불가입니다");
            assertThat(captured.get().path("questions").size()).isEqualTo(6);
            assertThat(captured.get().path("questions").has("global")).isTrue();
        } finally { server.stop(0); }
    }
    @Test void advisoryThresholdIncludesHalfWithoutChangingLegacyModerationThreshold()throws Exception {
        var server=server();
        try {
            var client=client(server);var chats=List.of(new AiDecisions.Chat("a","world:one","A","합성 검증 문구",10_000,4,4));
            for(double value:List.of(.499,.5,.61)){
                conflictScore.set(value);var assessment=client.assessConflict(chats,chats,10_001);
                assertThat(assessment.threshold()).isEqualTo(.5);
                assertThat(assessment.suspected()).isEqualTo(value>=.5);
            }
            var pair=List.of(chats.getFirst(),new AiDecisions.Chat("b","world:one","B","다른 합성 문구",10_001,4,4));
            assertThat(client.moderate(pair,pair).conflict()).isFalse();
            conflictScore.set(.85);assertThat(client.moderate(pair,pair).conflict()).isTrue();
            var old=client.assessConflict(chats,chats,50_001);assertThat(old.threshold()).isEqualTo(.5);assertThat(old.suspected()).isFalse();
        }finally{server.stop(0);}
    }
    @Test void profanityAndInsultHaveIndependentGatesAndGenuineMentionIsProtected() throws Exception {
        var server=server();
        try {
            var client=client(server);
            var chats=List.of(new AiDecisions.Chat("id","world:one","A","합성 검증 문구",0,4,4));
            var first=client.moderate(chats,chats);
            assertThat(first.messages().get("id")).isEqualTo(AiDecisions.Verdict.VIOLATION);
            assertThat(first.assessments().get("id").reason()).isEqualTo("HIDE_PROFANITY");
            assertThat(first.assessments().get("id").utteranceProbability()).isEqualTo(.1);
            scores.set(new Scores(.85,.95,.01,.01));
            assertThat(client.moderate(chats,chats).assessments().get("id").reason()).isEqualTo("HIDE_PERSONAL_INSULT");
            scores.set(new Scores(.99,.99,.99,.85));
            var quote=client.moderate(chats,chats);
            assertThat(quote.messages().get("id")).isEqualTo(AiDecisions.Verdict.NORMAL);
            assertThat(quote.assessments().get("id").reason()).isEqualTo("KEEP_CONTEXTUAL_MENTION");
            scores.set(new Scores(.01,.01,.649,.01));
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.UNCERTAIN);
            scores.set(new Scores(.01,.01,.65,.849));
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.VIOLATION);
            scores.set(new Scores(.01,.01,.65,.85));
            assertThat(client.moderate(chats,chats).assessments().get("id").reason()).isEqualTo("KEEP_CONTEXTUAL_MENTION");
            scores.set(new Scores(.01,.01,.01,.01));
            assertThat(client.moderate(chats,chats).assessments().get("id").reason()).isEqualTo("NO_VIOLATION_SIGNAL");
            var preserved=client.assessments().get("id");
            scores.set(new Scores(.99,.99,.99,2));
            assertThatThrownBy(() -> client.moderate(chats,chats)).isInstanceOf(IllegalArgumentException.class);
            assertThat(client.assessments().get("id")).isEqualTo(preserved);
        } finally { server.stop(0); }
    }
    @Test void originalDecisionSurvivesHistoryRereadAndRestartInTheSameVerdictTransaction() throws Exception {
        // Old schema-1 files have no assessments; the additive field must start empty.
        Files.writeString(directory.resolve("state.json"),"{\"schema\":1}");
        var server=server(); String id; AiDecisions.Assessment original;
        try {
            var client=client(server);
            try(var store=new LocalAiStore(directory,mapper)) {
                var op=new AiOperations(store,client,AiText.fixed(),AiNotifier.local(),Clock.systemUTC(),dispatch -> {});
                id=op.chat("A","world:one","씨발",4,4); op.flush();
                var data=store.read(); original=data.assessments.get(id);
                assertThat(data.messages.getFirst().hidden()).isTrue();
                assertThat(original.reason()).isEqualTo("HIDE_PROFANITY");
                assertThat(original.profanityProbability()).isEqualTo(.65);
                assertThat(original.profanityThreshold()).isEqualTo(.65);
                assertThat(original.policyVersion()).isEqualTo(JevDecisions.POLICY_VERSION);
                scores.set(new Scores(.01,.01,.01,.99));
                String next=op.chat("A","world:one","단어를 설명하는 인용입니다",4,4); op.flush();
                assertThat(store.read().assessments.get(id)).isEqualTo(original);
                assertThat(client.assessments().get(id)).isEqualTo(original);
                assertThat(store.read().assessments.get(next).reason()).isEqualTo("KEEP_CONTEXTUAL_MENTION");
            }
            try(var reopened=new LocalAiStore(directory,mapper)) {
                assertThat(reopened.read().assessments.get(id)).isEqualTo(original);
                assertThat(reopened.read().messages.getFirst().hidden()).isTrue();
            }
        } finally { server.stop(0); }
    }
}
