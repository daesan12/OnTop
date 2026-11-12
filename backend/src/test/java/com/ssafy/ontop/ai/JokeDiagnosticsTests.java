package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class JokeDiagnosticsTests {
    @Test void llmDiagnosticsKeepOriginalScoresAndResponseBeforeDuplicatePenalty()throws Exception {
        var mapper=new ObjectMapper();var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        String original=mapper.writeValueAsString(Map.of("status","SCORED","wordplayX10",300,"witX10",250,"originalityX10",100,"explanation","말장난 해석","reaction","단어를 나눈 연결이 자연스럽네.","similarity","SIMILAR","matchedId","prior"));
        server.createContext("/",e->{e.getRequestBody().readAllBytes();byte[] bytes=mapper.writeValueAsBytes(Map.of("usage",Map.of("prompt_tokens",100,"completion_tokens",50),"choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",original)))));e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});server.start();
        var events=new ArrayList<Map<String,Object>>();
        try(var scope=JokeDiagnostics.open("llm-test",events::add)){
            var judge=new LlmJokeJudge(mapper,"not-a-key","gpt-5.4-mini",JokeJudge.fixture(),URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            var result=judge.evaluate("왕이 넘어지면?","킹콩",List.of(new JokeJudge.Reference("prior","왕이 넘어지면?","킹콩")));
            assertThat(result.originalityX10()).isEqualTo(20);
            assertThat(events.stream().filter(e->e.get("stage").equals("llm_response")).findFirst().orElseThrow()).containsEntry("rawContent",original).containsEntry("inputTokens",100L);
            assertThat(events.stream().filter(e->e.get("stage").equals("similarity_adjustment")).findFirst().orElseThrow()).containsEntry("beforeX10",100).containsEntry("afterX10",20).containsEntry("penaltyX10",80);
        }finally{server.stop(0);}
    }
    @Test void fallbackReasonsPreserveTheScoreAndNeverExposeDiagnosticsInSubmissions(@TempDir Path directory)throws Exception {
        var mapper=new ObjectMapper();
        for(String scenario:List.of("NONE","EMPTY_REACTION","REACTION_TOO_LONG","SCORE_TEXT_FORBIDDEN","REACTION_GUARD_BLOCKED","REACTION_EXCEPTION","PROVIDER_NOT_GENERATED")){
            String raw=switch(scenario){case "EMPTY_REACTION"->"";case "REACTION_TOO_LONG"->"가".repeat(181);case "SCORE_TEXT_FORBIDDEN"->"1+1 모양을 연결했네.";default->"모양을 연결한 반전이 자연스럽구먼.";};
            JokeJudge judge=new JokeJudge(){
                public Evaluation evaluate(String q,String a){return new Evaluation("SCORED",150,120,50,"해석",raw,!scenario.equals("PROVIDER_NOT_GENERATED"));}
                public boolean safeReaction(String text){if(scenario.equals("REACTION_EXCEPTION"))throw new IllegalStateException("never log this secret");return !scenario.equals("REACTION_GUARD_BLOCKED");}
                public String mode(){return "diagnostic-test";}
            };
            var events=new CopyOnWriteArrayList<Map<String,Object>>();
            try(var contest=new LocalJokeContest(mapper,new JsonJokeContestStore(mapper,directory.resolve(scenario),System.currentTimeMillis()),judge,AiText.fixed(),Clock.systemUTC(),events::add)){
                var row=contest.submit("1","시험","문제인가?","답","diagnostic-request",true);
                for(int i=0;i<500&&contest.own("1",row.id()).status().equals("PENDING");i++)Thread.sleep(5);
                var done=contest.own("1",row.id());
                assertThat(done.scoreX10()).isEqualTo(320);
                assertThat(done.reactionSource()).isEqualTo(scenario.equals("NONE")?"SPRING_AI":"FIXED");
                var selection=events.stream().filter(e->e.get("stage").equals("reaction_selection")).findFirst().orElseThrow();
                assertThat(selection).containsEntry("fallbackReason",scenario).containsEntry("submissionId",row.id());
                if(!scenario.equals("PROVIDER_NOT_GENERATED"))assertThat(selection).containsEntry("rawReaction",raw);
                assertThat(mapper.writeValueAsString(done)).doesNotContain("rawReaction","fallbackReason","rawContent");
                assertThat(events.toString()).doesNotContain("never log this secret");
            }
        }
    }
    @Test void guardRecordsValidatedValuesAndDistinguishesOriginalFromReaction()throws Exception {
        var mapper=new ObjectMapper();var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",e->{e.getRequestBody().readAllBytes();var answers=Map.of("unsafe_targeted",Map.of("type","noul","noul",.01),"personal_info",Map.of("type","noul","noul",.4),"severely_inappropriate",Map.of("type","noul","noul",.02));byte[] bytes=mapper.writeValueAsBytes(Map.of("answers",answers));e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});server.start();
        var events=new ArrayList<Map<String,Object>>();
        try(var scope=JokeDiagnostics.open("guard-test",events::add)){
            var judge=new JevJokeJudge(mapper,"not-a-key","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            assertThat(judge.screen("문제","답").status()).isEqualTo("REVIEW");assertThat(judge.safeReaction("반응")).isFalse();
            assertThat(events).hasSize(2);assertThat(events.get(0)).containsEntry("phase","original").containsEntry("personal_info",.4).containsEntry("decision","REVIEW");assertThat(events.get(1)).containsEntry("phase","reaction");
        }finally{server.stop(0);}
    }
    @Test void scopesRestoreAndDiagnosticFailureCannotBreakScoring(){
        var outer=new ArrayList<Map<String,Object>>();var inner=new ArrayList<Map<String,Object>>();
        try(var first=JokeDiagnostics.open("outer",outer::add)){
            try(var second=JokeDiagnostics.open("inner",inner::add)){JokeDiagnostics.emit("event",Map.of());}
            JokeDiagnostics.emit("event",Map.of());
            try(var broken=JokeDiagnostics.open("broken",e->{throw new IllegalStateException();})){assertThatCode(()->JokeDiagnostics.emit("event",Map.of())).doesNotThrowAnyException();}
        }
        JokeDiagnostics.emit("no-leak",Map.of());
        assertThat(outer).hasSize(1);assertThat(inner).hasSize(1);assertThat(outer.get(0)).containsEntry("submissionId","outer");
        assertThat(JokeDiagnostics.text("sk-abcdefghijklmnop Bearer secret-token")).isEqualTo("[REDACTED] [REDACTED]");
        assertThat(JokeDiagnostics.text("x".repeat(9000))).endsWith("[TRUNCATED]").hasSize(8203);
    }
    @Test void modelCompatibilityKeepsTheScoringPromptAndSchema()throws Exception {
        var mapper=new ObjectMapper();var old=new LlmJokeJudge(mapper,"fixture","gpt-4.1-mini",JokeJudge.fixture()).requestPayload("왕이 넘어지면?","킹콩",List.of());
        var next=new LlmJokeJudge(mapper,"fixture","gpt-5.4-mini",JokeJudge.fixture()).requestPayload("왕이 넘어지면?","킹콩",List.of());
        assertThat(next.get("messages")).isEqualTo(old.get("messages"));assertThat(next.get("response_format")).isEqualTo(old.get("response_format"));
        assertThat(next).containsEntry("max_completion_tokens",500).containsEntry("reasoning_effort","none").doesNotContainKeys("max_tokens","temperature");
        assertThat(old).containsEntry("max_tokens",500).containsEntry("temperature",0);
    }
    @Test void comparisonReservationsRejectUnknownOrOversizedRequests(){
        assertThat(JokeModelComparison.reservation("gpt-4.1-mini",10000)).isLessThan(.01);
        assertThat(JokeModelComparison.reservation("gpt-5.4-mini",10000)).isLessThan(.02);
        assertThatThrownBy(()->JokeModelComparison.reservation("expensive-unknown",1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->JokeModelComparison.reservation("gpt-5.4-mini",20001)).isInstanceOf(IllegalArgumentException.class);
    }
}
