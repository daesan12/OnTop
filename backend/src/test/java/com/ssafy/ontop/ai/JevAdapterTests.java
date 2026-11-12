package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class JevAdapterTests {
    // Legacy personal-insult fixtures explicitly keep the new independent gates at zero.
    private static byte[] withPolicyDefaults(byte[] bytes) throws java.io.IOException {
        var mapper=new ObjectMapper(); var root=mapper.readTree(bytes);
        var answers=(com.fasterxml.jackson.databind.node.ObjectNode)root.path("answers");
        for(int i=0;i<15;i++) for(String prefix:List.of("profanity_","mention_"))
            if(!answers.has(prefix+i)) answers.putObject(prefix+i).put("type","noul").put("noul",0);
        return mapper.writeValueAsBytes(root);
    }

    @Test void sendsFiveHistoryAndTenNewMessagesWithStableIdsAndRejectsOversizedWindows() throws Exception {
        var mapper=new ObjectMapper(); var captured=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            captured.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            var answers=mapper.createObjectNode();
            // Distinct speakers exercise the maximum 15 utterance + 15 message + conflict questions.
            for(int i=0;i<15;i++) {
                answers.putObject("utterance_"+i).put("type","noul").put("noul",.1);
                answers.putObject("message_"+i).put("type","noul").put("noul",.1);
            }
            answers.putObject("conflict").put("type","noul").put("noul",.1);
            byte[] body=mapper.writeValueAsBytes(java.util.Map.of("answers",answers));
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client=new JevDecisions(mapper,"test-not-a-real-key","jev-1.14.0",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85);
            var context=java.util.stream.IntStream.range(0,15).mapToObj(i ->
                    new AiDecisions.Chat("id-"+i,"world:one","user-"+i,"정상 인사",i*1000,4,4,List.of(),"닉네임"+i)).toList();
            var result=client.moderate(context,context.subList(5,15));
            var input=mapper.readTree(captured.get());
            assertThat(input.path("state").path("conversation").size()).isEqualTo(15);
            assertThat(input.path("state").path("pendingMessageIds").size()).isEqualTo(10);
            assertThat(input.path("state").path("conversation").get(5).path("nickname").asText()).contains("닉네임5","user-5");
            assertThat(input.path("questions").size()).isEqualTo(41);
            assertThat(result.messages()).hasSize(10).allSatisfy((id,verdict) -> assertThat(verdict).isEqualTo(AiDecisions.Verdict.NORMAL));
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.moderate(context,context.subList(0,11))).isInstanceOf(IllegalArgumentException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.moderate(context,context.subList(6,15))).isInstanceOf(IllegalArgumentException.class);
        } finally { server.stop(0); }
    }
    @Test void documentedNoulWireContractAndUsageAreVerifiedWithoutExternalApi() throws Exception {
        var mapper=new ObjectMapper(); var captured=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            captured.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            byte[] body="{\"answers\":{\"utterance_0\":{\"type\":\"noul\",\"noul\":0.98},\"message_0\":{\"type\":\"noul\",\"noul\":0.98},\"conflict\":{\"type\":\"noul\",\"noul\":0.9}},\"usage\":{\"input_tokens\":210}}".getBytes(StandardCharsets.UTF_8);
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client=new JevDecisions(mapper,"test-not-a-real-key","jev-1.14.0",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85);
            var chats=List.of(new AiDecisions.Chat("original-id","world:one","a","synthetic fixture",0,4,4));
            var response=client.moderate(chats,chats);
            assertThat(response.messages()).containsEntry("original-id",AiDecisions.Verdict.VIOLATION);
            assertThat(response.conflict()).as("one speaker cannot create reciprocal conflict even with a high model response").isFalse();
            assertThat(client.usage()).containsEntry("calls",1L).containsEntry("inputTokens",210L);
            var input=mapper.readTree(captured.get());
            assertThat(input.path("questions").path("message_0").path("type").asText()).isEqualTo("noul");
            assertThat(input.path("questions").path("utterance_0").path("instructions").path("reviewGuidance").asText())
                    .isEqualTo(JevDecisions.DEFAULT_MODERATION_GUIDANCE);
            assertThat(input.path("state").path("conversation").get(0).path("messageId").asText()).isEqualTo("original-id");
            assertThat(input.path("state").path("conversation").get(0).path("nickname").asText()).isEqualTo("a");
            assertThat(input.path("questions").path("message_0").path("criteria").path("true").asText()).contains("personal insult");
            assertThat(client.assessments().get("original-id").probability()).isEqualTo(.98);
            assertThat(client.assessments().get("original-id").verdict()).isEqualTo(AiDecisions.Verdict.VIOLATION);
        } finally { server.stop(0); }
    }

    @Test void joinedUtteranceKeepsNicknameAndOriginalIdsIncludingEarlierProcessedFragments() throws Exception {
        var mapper=new ObjectMapper(); var captured=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            captured.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            var answers=new java.util.LinkedHashMap<String,Object>();
            for(int i=0;i<4;i++) answers.put("message_"+i,java.util.Map.of("type","noul","noul", .98));
            answers.put("utterance_0",java.util.Map.of("type","noul","noul",.98));
            answers.put("utterance_1",java.util.Map.of("type","noul","noul",.98));
            answers.put("conflict",java.util.Map.of("type","noul","noul",.01));
            byte[] body=mapper.writeValueAsBytes(java.util.Map.of("answers",answers));
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        }); server.start();
        try {
            var client=new JevDecisions(mapper,"fixture","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85);
            var chats=List.of(new AiDecisions.Chat("hello","world:one","B","안녕하세요",0,4,4),
                    new AiDecisions.Chat("part-1","world:one","A","님",1000,4,4),
                    new AiDecisions.Chat("part-2","world:one","A","도",2000,4,4),
                    new AiDecisions.Chat("part-3","world:one","A","라이세요?",3000,4,4));
            var result=client.moderate(chats,List.of(chats.getLast()));
            assertThat(result.messages()).containsOnlyKeys("part-3").containsEntry("part-3",AiDecisions.Verdict.VIOLATION);
            var state=mapper.readTree(captured.get()).path("state");
            assertThat(state.path("pendingMessageIds").toString()).isEqualTo("[\"part-3\"]");
            assertThat(state.path("utteranceCandidates")).hasSize(1);
            assertThat(state.path("utteranceCandidates").get(0).path("nickname").asText()).isEqualTo("A");
            assertThat(state.path("utteranceCandidates").get(0).path("joinedText").asText()).isEqualTo("님도라이세요?");
            assertThat(state.path("utteranceCandidates").get(0).path("spellingCandidates").toString()).contains("님또라이세요");
            assertThat(client.assessments().get("part-3").conversationIds()).containsExactly("hello","part-1","part-2","part-3");
        } finally { server.stop(0); }
    }
    @Test void malformedProbabilitiesAreRejectedInsteadOfHidingMessages() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] body="{\"answers\":{\"message_0\":{\"type\":\"noul\",\"noul\":2.0}}}".getBytes(StandardCharsets.UTF_8);
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client=new JevDecisions(new ObjectMapper(),"test-not-a-real-key","jev-1.14.0",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85);
            var chats=List.of(new AiDecisions.Chat("id","world:one","a","fixture",0,4,4));
            assertThatThrownBy(() -> client.moderate(chats,chats)).isInstanceOf(IllegalArgumentException.class);
            assertThat(client.assessments()).isEmpty();
        } finally { server.stop(0); }
    }

    @Test void differentModelProbabilitiesDriveDecisionsForTheSameMessageWithoutAWordList() throws Exception {
        var mapper=new ObjectMapper(); var score=new AtomicReference<>(.8);
        var guidance=new AtomicReference<>("Check the original context."); var captured=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            captured.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            byte[] body=mapper.writeValueAsBytes(java.util.Map.of("answers",java.util.Map.of(
                    "message_0",java.util.Map.of("type","noul","noul",score.get()),
                    "utterance_0",java.util.Map.of("type","noul","noul",.99),
                    "conflict",java.util.Map.of("type","noul","noul",.1))));
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client=new JevDecisions(mapper,"test-not-a-real-key","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85,guidance::get);
            var chats=List.of(new AiDecisions.Chat("id","world:one","a","이거 완전 또라이네",0,4,4));
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.UNCERTAIN);
            assertThat(client.assessments().get("id").probability()).isEqualTo(.8);
            String firstDigest=client.assessments().get("id").guidanceDigest();
            score.set(.97);
            guidance.set("Preserve quoted reports.");
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.VIOLATION);
            assertThat(client.assessments()).hasSize(1);
            assertThat(client.assessments().get("id").probability()).isEqualTo(.97);
            assertThat(client.assessments().get("id").hideThreshold()).isEqualTo(.95);
            assertThat(client.assessments().get("id").guidanceDigest()).isNotEqualTo(firstDigest);
            assertThat(mapper.readTree(captured.get()).path("questions").path("utterance_0").path("instructions").path("reviewGuidance").asText())
                    .isEqualTo("Preserve quoted reports.");
        } finally { server.stop(0); }
    }
    @Test void conflictQuestionUsesRecentReciprocalContextAndRejectsStaleSecondSpeaker() throws Exception {
        var mapper=new ObjectMapper(); var captured=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8); captured.set(body);
            var answers=new java.util.LinkedHashMap<String,Object>();
            mapper.readTree(body).path("questions").fieldNames().forEachRemaining(name ->
                    answers.put(name,java.util.Map.of("type","noul","noul",name.equals("conflict")?.99:.01)));
            byte[] bytes=mapper.writeValueAsBytes(java.util.Map.of("answers",answers));
            bytes=withPolicyDefaults(bytes); exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start();
        try {
            var client=new JevDecisions(mapper,"fixture","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85);
            var old=new AiDecisions.Chat("old","world:one","B","과거 발언",0,4,4);
            var current=new AiDecisions.Chat("current","world:one","A","현재 발언",31_000,4,4);
            assertThat(client.moderate(List.of(old,current),List.of(current)).conflict()).isFalse();
            var request=mapper.readTree(captured.get());
            assertThat(request.path("state").path("conversation")).hasSize(2);
            var instructions=request.path("questions").path("conflict").path("instructions");
            assertThat(instructions.path("recentConversation")).hasSize(1);
            assertThat(instructions.path("recentConversation").get(0).path("messageId").asText()).isEqualTo("current");
            assertThat(instructions.path("question").asText()).contains("TWO DIFFERENT", "one-way insult", "requests to stop abuse");
            var reply=new AiDecisions.Chat("reply","world:one","B","최근 답변",31_001,4,4);
            assertThat(client.moderate(List.of(old,current,reply),List.of(reply)).conflict()).isTrue();
            assertThat(mapper.readTree(captured.get()).path("questions").path("conflict").path("instructions").path("recentConversation")).hasSize(2);
            assertThat(client.usage().get("calls")).isEqualTo(2);
        } finally { server.stop(0); }
    }
    @Test void oversizedGuidanceIsRejectedBeforeAnyRemoteCall() {
        var client=new JevDecisions(new ObjectMapper(),"fixture","fixture",() -> "a".repeat(1201));
        var chats=List.of(new AiDecisions.Chat("id","world:one","A","정상",0,4,4));
        assertThatThrownBy(() -> client.moderate(chats,chats)).isInstanceOf(IllegalArgumentException.class);
        assertThat(client.usage()).containsEntry("calls",0L);
    }
    @Test void utteranceAndContributionGatesMustBothPassTheirOwnBoundaries() throws Exception {
        var mapper=new ObjectMapper(); var whole=new AtomicReference<>(.88); var part=new AtomicReference<>(.98);
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] body=mapper.writeValueAsBytes(java.util.Map.of("answers",java.util.Map.of(
                    "utterance_0",java.util.Map.of("type","noul","noul",whole.get()),
                    "message_0",java.util.Map.of("type","noul","noul",part.get()),
                    "conflict",java.util.Map.of("type","noul","noul",.01))));
            body=withPolicyDefaults(body); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        }); server.start();
        try {
            var client=new JevDecisions(mapper,"fixture","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"),.95,.85,
                    () -> JevDecisions.DEFAULT_MODERATION_GUIDANCE,.85);
            var chats=List.of(new AiDecisions.Chat("id","world:one","A","synthetic fixture",0,4,4));
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.VIOLATION);
            part.set(.94);
            assertThat(client.moderate(chats,chats).messages().get("id")).isNotEqualTo(AiDecisions.Verdict.VIOLATION);
            whole.set(.84); part.set(.99);
            assertThat(client.moderate(chats,chats).messages().get("id")).isNotEqualTo(AiDecisions.Verdict.VIOLATION);
            whole.set(.85); part.set(.95);
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.VIOLATION);
            assertThat(client.assessments().get("id").utteranceThreshold()).isEqualTo(.85);
            assertThat(client.assessments().get("id").hideThreshold()).isEqualTo(.95);
            whole.set(.2); part.set(.99);
            assertThat(client.moderate(chats,chats).messages().get("id")).isEqualTo(AiDecisions.Verdict.NORMAL);
        } finally { server.stop(0); }
    }
}
