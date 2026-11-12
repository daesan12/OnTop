package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LlmJokeJudgeTests {
    @Test void explanationFitsTheJdbcColumnAtThe100CharacterBoundary() throws Exception {
        var mapper=new ObjectMapper();var judge=new LlmJokeJudge(mapper,"fixture-key","fixture-model",JokeJudge.fixture());
        for(int length:new int[]{100,101,180}){
            var result=judge.parse(((com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED)).put("explanation","가".repeat(length)).toString());
            assertThat(result.reason()).isEqualTo("가".repeat(100));
        }
    }
    @Test void explanationTruncationDoesNotSplitASupplementaryUnicodeCharacter() throws Exception {
        var mapper=new ObjectMapper();var judge=new LlmJokeJudge(mapper,"fixture-key","fixture-model",JokeJudge.fixture());
        var result=judge.parse(((com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED)).put("explanation","가".repeat(99)+"🙂끝").toString());
        assertThat(result.reason()).isEqualTo("가".repeat(99)+"🙂");
    }
    @Test void identicalResubmissionIsScoredAgainstSelectedRankAndGetsQuieterLaughter(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory)throws Exception {
        var calls=new AtomicInteger();var captured=new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{calls.incrementAndGet();captured.set(mapper.readTree(exchange.getRequestBody()));
            String value=SCORED.substring(0,SCORED.length()-1)+",\"reaction\":\"소리의 연결은 좋지만 반전은 익숙하구먼.\",\"similarity\":\"NONE\",\"matchedId\":\"\"}";
            byte[] bytes=mapper.writeValueAsBytes(Map.of("choices",java.util.List.of(Map.of("finish_reason","stop","message",Map.of("content",value)))));
            exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        var clock=new LocalJokeContestTests.TestClock();
        try(var contest=new LocalJokeContest(mapper,directory,new LlmJokeJudge(mapper,"not-real-key","test-model",JokeJudge.fixture(),URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/")),AiText.fixed(),clock,true)){
            var first=contest.submit("one","시험","왕이 넘어지면?","킹콩","first-request",true);
            for(int i=0;i<500&&contest.own("one",first.id()).status().equals("PENDING");i++)Thread.sleep(5);
            assertThat(contest.own("one",first.id()).scoreX10()).isEqualTo(640);
            clock.advance(2100);var second=contest.submit("one","시험","왕이 넘어지면?","킹콩","second-request",true);
            for(int i=0;i<500&&contest.own("one",second.id()).status().equals("PENDING");i++)Thread.sleep(5);
            var result=contest.own("one",second.id());
            assertThat(result.status()).isEqualTo("SCORED");assertThat(result.originalityX10()).isEqualTo(20);assertThat(result.scoreX10()).isEqualTo(580);
            assertThat(result.reaction()).startsWith("허허.").contains(JokeJudge.SIMILAR_REASON).endsWith("58.0점일세!");
            assertThat(contest.submit("one","시험","왕이 넘어지면?","킹콩","second-request",true).id()).isEqualTo(second.id());
            assertThat(calls).hasValue(2);
            var data=mapper.readTree(captured.get().path("messages").path(1).path("content").asText());
            assertThat(data.path("references")).hasSize(1);assertThat(data.path("references").get(0).path("id").asText()).isEqualTo(first.id());
        }finally{server.stop(0);}
    }
    private final ObjectMapper mapper=new ObjectMapper();
    private static final String SCORED="{\"status\":\"SCORED\",\"connectionType\":\"SOUND\",\"connectionEvidence\":\"문제 단서와 답의 동음 관계\",\"witBand\":\"MODERATE\",\"wordplayX10\":320,\"witX10\":240,\"originalityX10\":80,\"explanation\":\"동음어를 이용한 말장난\"}";
    @Test void absentConnectionCannotBecomeALowScoredJoke()throws Exception {
        var judge=new LlmJokeJudge(mapper,"fixture","gpt-5.4-mini",JokeJudge.fixture());
        var value=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED);
        value.put("connectionType","NONE").put("connectionEvidence","");
        var result=judge.parse(value.toString());
        assertThat(result.status()).isEqualTo("INVALID_JOKE");
        assertThat(result.wordplayX10()+result.witX10()+result.originalityX10()).isZero();
        assertThat(result.reaction()).isEmpty();
    }
    @Test void weakWitAssessmentCapsOnlyWitAndIsRecorded()throws Exception {
        var judge=new LlmJokeJudge(mapper,"fixture","gpt-5.4-mini",JokeJudge.fixture());
        var value=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED);value.put("witBand","WEAK").put("witX10",330);
        var events=new java.util.ArrayList<Map<String,Object>>();
        try(var trace=JokeDiagnostics.open("consistency",events::add)){
            var result=judge.parse(value.toString());
            assertThat(result.witX10()).isEqualTo(133);
            assertThat(result.wordplayX10()).isEqualTo(320);assertThat(result.originalityX10()).isEqualTo(80);
        }
        assertThat(events.stream().filter(e->e.get("stage").equals("wit_consistency_adjustment")).findFirst().orElseThrow()).containsEntry("beforeX10",330).containsEntry("afterX10",133);
        value.put("connectionEvidence","");assertThatThrownBy(()->judge.parse(value.toString())).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void belowBandScoresArePreservedAndOnlyTheDiagnosticBandIsLowered()throws Exception {
        var judge=new LlmJokeJudge(mapper,"fixture","gpt-5.4-mini",JokeJudge.fixture());
        var value=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED);
        for(String band:java.util.List.of("MODERATE","STRONG")){
            int minimum=band.equals("MODERATE")?134:267;
            for(int wit:new int[]{0,10,133,134,266,267}){
                if(wit> (band.equals("MODERATE")?266:400))continue;
                var events=new java.util.ArrayList<Map<String,Object>>();
                try(var trace=JokeDiagnostics.open("low-score",events::add)){
                    var result=judge.parse(value.put("witBand",band).put("witX10",wit).toString());
                    assertThat(result.status()).isEqualTo("SCORED");
                    assertThat(result.witX10()).isEqualTo(wit);
                    assertThat(result.wordplayX10()).isEqualTo(320);assertThat(result.originalityX10()).isEqualTo(80);
                }
                var adjustments=events.stream().filter(e->e.get("stage").equals("wit_band_adjustment")).toList();
                if(wit<minimum)assertThat(adjustments).singleElement().satisfies(e->assertThat(e)
                    .containsEntry("beforeBand",band).containsEntry("afterBand",wit<=133?"WEAK":"MODERATE").containsEntry("witX10",wit));
                else assertThat(adjustments).isEmpty();
            }
        }
    }
    @Test void belowBandHttpResultCompletesWithItsScoreAndReactionInsteadOfRefunding(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory)throws Exception {
        var calls=new AtomicInteger();
        var value=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(SCORED);
        value.put("witBand","STRONG").put("witX10",10);
        value.put("reaction","말장난의 연결은 보이지만 반전은 약하구먼.").put("similarity","NONE").put("matchedId","");
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{calls.incrementAndGet();exchange.getRequestBody().readAllBytes();
            byte[] bytes=mapper.writeValueAsBytes(Map.of("choices",java.util.List.of(Map.of("finish_reason","stop","message",Map.of("content",value.toString())))));
            exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        var clock=new LocalJokeContestTests.TestClock();
        try(var contest=new LocalJokeContest(mapper,directory,new LlmJokeJudge(mapper,"fixture","gpt-5.4-mini",JokeJudge.fixture(),URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/")),AiText.fixed(),clock)){
            var submitted=contest.submit("one","시험","질문 데이터","답 데이터","low-score-request",true);
            for(int i=0;i<500&&contest.own("one",submitted.id()).status().equals("PENDING");i++)Thread.sleep(5);
            var result=contest.own("one",submitted.id());
            assertThat(result.status()).isEqualTo("SCORED");assertThat(result.witX10()).isEqualTo(10);
            assertThat(result.scoreX10()).isEqualTo(410);
            assertThat(result.reactionSource()).isEqualTo("SPRING_AI");
            assertThat(result.reaction()).contains("반전은 약하구먼").endsWith("41.0점일세!");
            assertThat(contest.mine("one").get("remaining")).isEqualTo(2L);
            assertThat(contest.rankings(submitted.date())).singleElement().satisfies(row->assertThat(row).containsEntry("scoreX10",410));
            assertThat(calls).hasValue(1);
        }finally{server.stop(0);}
    }
    @Test void usesLlmStructuredScoreWithoutCallingGuardsJokeValidityAndDelegatesReactionSafety()throws Exception {
        var calls=new AtomicInteger();var guardStatus=new AtomicReference<>("SCORED");
        JokeJudge guard=new JokeJudge(){
            public Evaluation evaluate(String q,String a){throw new AssertionError("Must not ask Jev to grade or validate the joke");}
            public Evaluation screen(String q,String a){return new Evaluation(guardStatus.get(),0,0,0,"GUARD");}
            public boolean safeReaction(String s){return s.equals("safe");}
            public String mode(){return "TEST_GUARD";}
        };
        var captured=new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
        var response=new AtomicReference<>(SCORED);
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        response.set(SCORED.substring(0,SCORED.length()-1)+",\"reaction\":\"허허, 말맛이 살아 있구먼!\",\"similarity\":\"NONE\",\"matchedId\":\"\"}");
        server.createContext("/",exchange->{calls.incrementAndGet();captured.set(mapper.readTree(exchange.getRequestBody()));byte[] bytes=mapper.writeValueAsBytes(Map.of("usage",Map.of("prompt_tokens",123,"completion_tokens",67),"choices",java.util.List.of(Map.of("finish_reason","stop","message",Map.of("content",response.get())))));exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        try {
            var judge=new LlmJokeJudge(mapper,"not-real-key","test-model",guard,URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            var result=judge.evaluate("질문 데이터","답 데이터");
            assertThat(result.status()).isEqualTo("SCORED");assertThat(result.wordplayX10()+result.witX10()+result.originalityX10()).isEqualTo(640);
            assertThat(result.integratedReaction()).isTrue();assertThat(result.reaction()).contains("말맛");
            assertThat(judge.usage()).containsEntry("llm.calls",1L).containsEntry("llm.input_tokens",123L).containsEntry("llm.output_tokens",67L);
            assertThat(captured.get().path("response_format").path("json_schema").path("strict").asBoolean()).isTrue();
            assertThat(captured.get().path("messages").path(1).path("content").asText()).contains("질문 데이터","답 데이터");
            assertThat(captured.get().path("messages").path(0).path("content").asText()).contains(JokeJudge.PERSONA,"점수의 이유","잘된 점 또는 아쉬운 점","세 항목을 독립적으로 평가","글자 모양과 표기 방식").doesNotContain("1+1","창문","킹콩","열바다","32점");
            guardStatus.set("REVIEW");assertThat(judge.evaluate("q","a").status()).isEqualTo("REVIEW");
            guardStatus.set("REJECTED");assertThat(judge.evaluate("q","a").status()).isEqualTo("REJECTED");assertThat(calls).hasValue(1);
            assertThat(judge.safeReaction("safe")).isTrue();assertThat(judge.safeReaction("unsafe")).isFalse();
            guardStatus.set("SCORED");response.set("{}");assertThatThrownBy(()->judge.evaluate("q","a")).isInstanceOf(IllegalArgumentException.class);
        }finally{server.stop(0);}
    }
    @Test void similarityCapsOnlyOriginalityValidatesReferenceAndStillUsesOneCall()throws Exception {
        var similarity=new AtomicReference<>("SIMILAR");var matched=new AtomicReference<>("rank-one");var calls=new AtomicInteger();
        var captured=new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{calls.incrementAndGet();captured.set(mapper.readTree(exchange.getRequestBody()));
            var value=mapper.readTree(SCORED).deepCopy();((com.fasterxml.jackson.databind.node.ObjectNode)value).put("similarity",similarity.get()).put("matchedId",matched.get()).put("reaction","허허, 익숙한 말맛이구먼!");
            byte[] bytes=mapper.writeValueAsBytes(Map.of("choices",java.util.List.of(Map.of("finish_reason","stop","message",Map.of("content",value.toString())))));
            exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        try {
            var judge=new LlmJokeJudge(mapper,"not-real-key","test-model",JokeJudge.fixture(),URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            var refs=java.util.List.of(new JokeJudge.Reference("rank-one","왕이 넘어지면?","킹콩!"));
            var similar=judge.evaluate("왕이 꽈당하면?","킹콩",refs);
            assertThat(similar.wordplayX10()).isEqualTo(320);assertThat(similar.witX10()).isEqualTo(240);assertThat(similar.originalityX10()).isEqualTo(20);
            assertThat(similar.reason()).isEqualTo(JokeJudge.SIMILAR_REASON);assertThat(calls).hasValue(1);
            assertThat(captured.get().path("messages").path(1).path("content").asText()).contains("references","rank-one","킹콩!");
            similarity.set("NONE");matched.set("");assertThat(judge.evaluate("전혀 다른 문제","다른 답",refs).originalityX10()).isEqualTo(80);
            assertThat(judge.evaluate("왕이  넘어지면！","킹콩",refs).originalityX10()).isEqualTo(20);
            assertThat(judge.evaluate("질문","답").originalityX10()).isEqualTo(80);
            similarity.set("SIMILAR");matched.set("invented");assertThatThrownBy(()->judge.evaluate("질문","답",refs)).isInstanceOf(IllegalArgumentException.class);
            matched.set("rank-one");assertThatThrownBy(()->judge.evaluate("질문","답")).isInstanceOf(IllegalArgumentException.class);
            similarity.set("NONE");assertThatThrownBy(()->judge.evaluate("질문","답",refs)).isInstanceOf(IllegalArgumentException.class);
            assertThat(judge.usage()).containsEntry("similarity.matches",2L).containsEntry("similarity.penalty_x10",120L);
        }finally{server.stop(0);}
    }
    @Test void rejectsCoercionOutOfRangeContradictionAndTrailingTokens()throws Exception {
        var judge=new LlmJokeJudge(mapper,"not-real-key","test-model",JokeJudge.fixture());
        assertThat(judge.parse(SCORED).originalityX10()).isEqualTo(80);
        for(String bad:java.util.List.of(SCORED.replace("320","401"),SCORED.replace("320","320.1"),SCORED.replace("320","\"320\""),SCORED.replace("SCORED","INVALID_JOKE"),SCORED+" {}",SCORED.replace("SCORED","REJECTED")))
            assertThatThrownBy(()->judge.parse(bad)).isInstanceOfAny(IllegalArgumentException.class,java.io.IOException.class);
        assertThat(judge.parse(SCORED.replace("SCORED","INVALID_JOKE").replace("320","0").replace("240","0").replace("80","0")).status()).isEqualTo("INVALID_JOKE");
    }
    @Test void recoverableReactionFieldNeverDestroysValidScore()throws Exception {
        var judge=new LlmJokeJudge(mapper,"not-real-key","test-model",JokeJudge.fixture());
        for(String value:java.util.List.of(SCORED,SCORED.substring(0,SCORED.length()-1)+",\"reaction\":null}",SCORED.substring(0,SCORED.length()-1)+",\"reaction\":123}")){
            var score=judge.parse(value);assertThat(score.wordplayX10()).isEqualTo(320);assertThat(score.integratedReaction()).isTrue();assertThat(score.reaction()).isEmpty();
        }
    }
    @Test void incompleteRefusedAndHttpFailureNeverBecomeSuccessfulScores()throws Exception {
        var status=new AtomicInteger(200);var finish=new AtomicReference<>("length");var refused=new AtomicReference<>("");
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{exchange.getRequestBody().readAllBytes();byte[] bytes=mapper.writeValueAsBytes(Map.of("choices",java.util.List.of(Map.of("finish_reason",finish.get(),"message",Map.of("content",SCORED,"refusal",refused.get())))));exchange.sendResponseHeaders(status.get(),bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        try {
            var judge=new LlmJokeJudge(mapper,"not-real-key","test-model",JokeJudge.fixture(),URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            assertThatThrownBy(()->judge.evaluate("질문","정답")).isInstanceOf(IllegalArgumentException.class);
            finish.set("stop");refused.set("refused");assertThatThrownBy(()->judge.evaluate("질문","정답")).isInstanceOf(IllegalArgumentException.class);
            refused.set("");status.set(429);assertThatThrownBy(()->judge.evaluate("질문","정답")).isInstanceOf(IllegalStateException.class);
        }finally{server.stop(0);}
    }
}
