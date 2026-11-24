package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.Map;

/** 제브 품질 대역이 아닌 HTTP/임계값 검수용 합성 응답. 운영 classpath에는 포함되지 않는다. */
public final class PoliceJudgeFixture implements AutoCloseable {
    private final HttpServer server;
    private final Map<String, Double> scores;

    public PoliceJudgeFixture(ObjectMapper mapper, Map<String, Double> scores) throws IOException {
        this.scores = Map.copyOf(scores);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            var request = mapper.readTree(exchange.getRequestBody());
            var answers = mapper.createObjectNode();
            request.path("questions").fields().forEachRemaining(entry -> {
                String target = entry.getValue().path("instructions").path("target").asText();
                double score = this.scores.entrySet().stream()
                        .filter(value -> target.endsWith(": " + value.getKey()))
                        .mapToDouble(Map.Entry::getValue).findFirst().orElse(.61);
                answers.putObject(entry.getKey()).put("type", "noul").put("noul", score);
            });
            byte[] body = mapper.writeValueAsBytes(Map.of("answers", answers));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            } finally {
                exchange.close();
            }
        });
        server.start();
    }

    public JevDecisions client(ObjectMapper mapper) {
        return new JevDecisions(mapper, "test-not-a-secret", "POLICE_HTTP_FIXTURE",
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"), .95, .85);
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
