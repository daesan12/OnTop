package com.ssafy.ontop.ai.ontop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JevOntopIntentTests {
    @Test
    void 제브_선택_응답을_읽고_불확실하거나_알수없는_행동은_실행하지_않는다() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var mapper = new ObjectMapper();
        server.createContext("/", exchange -> {
            var request = mapper.readTree(exchange.getRequestBody());
            assertThat(request.at("/questions/intent/type").asText()).isEqualTo("choice");
            assertThat(request.at("/state/message").asText()).isEqualTo("눈싸움 하고 싶어");
            byte[] response = "{\"answers\":{\"intent\":{\"choice\":\"INVITE\",\"confidence\":0.96}}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try (var chooser = new JevOntopIntent(mapper, "fixture-key", "fixture-model",
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"))) {
            var decision = chooser.choose("눈싸움 하고 싶어", false, false).get(5, TimeUnit.SECONDS);
            assertThat(decision.intent()).isEqualTo(OntopIntent.INVITE);
            assertThat(decision.source()).isEqualTo("JEV");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void 연결_실패시_실제_제브_결과라고_표시하지_않고_기본_규칙으로_돌아간다() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        try (var chooser = new JevOntopIntent(new ObjectMapper(), "fixture-key", "fixture-model",
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"))) {
            var decision = chooser.choose("눈싸움하자", false, false).get(5, TimeUnit.SECONDS);
            assertThat(decision.intent()).isEqualTo(OntopIntent.INVITE);
            assertThat(decision.source()).isEqualTo("LOCAL_FALLBACK");
        } finally {
            server.stop(0);
        }
    }
}
