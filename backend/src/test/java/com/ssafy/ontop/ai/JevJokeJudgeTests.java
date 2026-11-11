package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class JevJokeJudgeTests {
    @Test void usesIndependentNoulAndScoreScalesAndRejectsMalformedProviderValues()throws Exception{
        var mapper=new ObjectMapper();var captured=new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();var unsafe=new AtomicReference<>(.01);var rawScore=new AtomicReference<>(3.2);
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",e->{var request=mapper.readTree(e.getRequestBody());captured.set(request);var answers=mapper.createObjectNode();request.path("questions").properties().forEach(pair->{String name=pair.getKey();if(pair.getValue().path("type").asText().equals("score"))answers.putObject(name).put("type","score").put("score",rawScore.get());else answers.putObject(name).put("type","noul").put("noul",name.equals("valid_joke")?.95:unsafe.get());});byte[] bytes=mapper.writeValueAsBytes(Map.of("answers",answers));e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});server.start();
        try {
            var judge=new JevJokeJudge(mapper,"test-not-real","fixture",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            var result=judge.evaluate("왕이 넘어지면?","킹콩!");assertThat(result.status()).isEqualTo("SCORED");assertThat(result.wordplayX10()).isEqualTo(320);assertThat(result.originalityX10()).isEqualTo(160);
            assertThat(captured.get().path("questions").size()).isEqualTo(7);assertThat(captured.get().path("questions").path("wordplay").path("criteria").size()).isEqualTo(5);assertThat(captured.get().path("state").path("answer").asText()).isEqualTo("킹콩!");
            unsafe.set(.81);assertThat(judge.evaluate("문제","답").status()).isEqualTo("REJECTED");unsafe.set(.4);assertThat(judge.evaluate("문제","답").status()).isEqualTo("REVIEW");
            assertThat(judge.screen("문제","답").status()).isEqualTo("REVIEW");assertThat(captured.get().path("questions").size()).isEqualTo(3);
            assertThat(captured.get().path("questions").has("valid_joke")).isFalse();
            unsafe.set(.01);rawScore.set(4.01);assertThatThrownBy(()->judge.evaluate("문제","답")).isInstanceOf(IllegalArgumentException.class);
            unsafe.set(2.0);assertThatThrownBy(()->judge.safeReaction("반응")).isInstanceOf(IllegalArgumentException.class);
        }finally{server.stop(0);}
    }
}
