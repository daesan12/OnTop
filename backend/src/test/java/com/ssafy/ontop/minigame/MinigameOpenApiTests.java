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
            assertThat(start.at("/responses/201/content/application~1json/schema/oneOf").toString())
                    .contains("MinigameStartResponse", "BungeoppangV4StartResponse");
            assertThat(start.at("/responses/409/description").asText())
                    .contains("IDEMPOTENCY_KEY_CONFLICT", "RULES_VERSION_MISMATCH");
            assertThat(start.path("parameters").size()).isEqualTo(1);
            assertThat(start.at("/parameters/0/name").asText()).isEqualTo("Idempotency-Key");
            assertThat(start.at("/parameters/0/required").asBoolean()).isTrue();
            var body = start.at("/requestBody/content/application~1json/schema");
            assertThat(body.at("/properties/minigameType/enum/0").asText()).isEqualTo("BUNGEOPPANG");
            assertThat(body.at("/properties/rulesVersion/enum").toString()).isEqualTo("[\"v2\",\"v4\"]");
            assertThat(body.path("required").toString()).isEqualTo("[\"minigameType\"]");
            assertThat(body.path("additionalProperties").asBoolean(true)).isFalse();

            var status = paths.path("/api/v1/minigames/sessions").path("get");
            assertThat(status.path("parameters")).anyMatch(parameter ->
                    parameter.path("name").asText().equals("rulesVersion")
                            && parameter.at("/schema/enum").toString().equals("[\"v2\",\"v4\"]"));
            assertThat(status.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("BungeoppangStatusResponse", "BungeoppangV4LobbyResponse");
            assertThat(status.at("/responses/409/description").asText()).contains("RULES_VERSION_MISMATCH");

            var load = paths.path("/api/v1/minigames/sessions/{sessionId}").path("get");
            assertThat(load.path("parameters")).anyMatch(parameter ->
                    parameter.path("name").asText().equals("includeSource")
                            && parameter.at("/schema/type").asText().equals("boolean"));
            assertThat(load.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("MinigameStatusResponse", "BungeoppangV4SessionResponse");

            var schemas = new ObjectMapper().readTree(response.body()).at("/components/schemas");
            assertThat(schemas.at("/BungeoppangV4StartResponse/properties/heats/type").asText()).isEqualTo("array");
            assertThat(schemas.at("/BungeoppangV4StartResponse/properties/checkpoint/$ref").asText())
                    .endsWith("/BungeoppangV4Checkpoint");
            assertThat(schemas.at("/BungeoppangV4Rules/properties/heatListLength/type").asText())
                    .isEqualTo("integer");
            assertThat(schemas.at("/BungeoppangV4SessionResponse/properties/result/nullable").asBoolean())
                    .isTrue();
            assertThat(schemas.at("/BungeoppangV4LobbyResponse/properties/activeSessionId/nullable").asBoolean())
                    .isTrue();
            assertThat(schemas.at("/BungeoppangV4SessionResponse/properties/checkpoint/nullable").asBoolean())
                    .isTrue();
            assertThat(schemas.at("/BungeoppangV4SessionResponse/properties/checkpoint/allOf/0/$ref").asText())
                    .endsWith("/BungeoppangV4Checkpoint");
            assertThat(paths.has("/api/v1/minigames/sessions/{sessionId}/deliveries")).isFalse();
            var complete = paths.path("/api/v1/minigames/sessions/{sessionId}/complete").path("post");
            assertThat(complete.at("/responses/422/description").asText()).contains("LOG_INVALID", "TOO_EARLY");
            assertThat(complete.at("/requestBody/content/application~1json/schema/additionalProperties")
                    .asBoolean(true)).isFalse();
            assertThat(complete.at("/requestBody/content/application~1json/schema/properties/log/maxItems").asInt())
                    .isEqualTo(1200);
            assertThat(complete.path("description").asText())
                    .contains("local,db", "dev,db", "v2", "v4", "V124", "후속 Story", "100냥")
                    .doesNotContain("local 전용");
            assertThat(paths.path("/api/v1/minigames/sessions").has("get")).isTrue();
        }
    }
}
