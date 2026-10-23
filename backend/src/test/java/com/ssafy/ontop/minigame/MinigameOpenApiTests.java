package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("local")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MinigameOpenApiTests {
    @LocalServerPort private int port;

    @Test
    void 문서가실제필수키와엄격한본문및회원인증과미검증차단을표현한다() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create(
                    "http://127.0.0.1:" + port + "/v3/api-docs")).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var paths = new ObjectMapper().readTree(response.body()).path("paths");
            var start = paths.path("/api/v1/minigames/sessions").path("post");
            assertThat(start.at("/security/0").has("AccessJwt")).isTrue();
            assertThat(start.at("/responses/201/content/application~1json/schema/$ref").asText())
                    .endsWith("/MinigameStartResponse");
            assertThat(start.path("parameters").size()).isEqualTo(1);
            assertThat(start.at("/parameters/0/name").asText()).isEqualTo("Idempotency-Key");
            assertThat(start.at("/parameters/0/required").asBoolean()).isTrue();
            var body = start.at("/requestBody/content/application~1json/schema");
            assertThat(body.at("/properties/minigameType/enum/0").asText()).isEqualTo("BUNGEOPPANG");
            assertThat(body.path("required").toString()).isEqualTo("[\"minigameType\"]");
            assertThat(body.path("additionalProperties").asBoolean(true)).isFalse();
            var complete = paths.path("/api/v1/minigames/sessions/{sessionId}/complete").path("post");
            assertThat(complete.at("/responses/422/description").asText()).contains("LOG_INVALID", "TOO_EARLY");
            assertThat(complete.at("/requestBody/content/application~1json/schema/additionalProperties")
                    .asBoolean(true)).isFalse();
            assertThat(complete.at("/requestBody/content/application~1json/schema/properties/log/maxItems").asInt())
                    .isEqualTo(1200);
            assertThat(complete.path("description").asText()).contains("local,db", "v2", "100냥");
            assertThat(paths.path("/api/v1/minigames/sessions").has("get")).isTrue();
        }
    }
}
