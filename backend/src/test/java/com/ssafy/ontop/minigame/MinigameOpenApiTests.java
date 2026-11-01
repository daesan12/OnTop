package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
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
            var pause = paths.path("/api/v1/minigames/sessions/{sessionId}/manual-pause").path("post");
            var pauseBody = pause.at("/requestBody/content/application~1json/schema");
            assertThat(pauseBody.path("required")).hasSize(2);
            assertThat(pauseBody.path("additionalProperties").asBoolean()).isFalse();
            assertThat(pauseBody.at("/properties/paused/type").asText()).isEqualTo("boolean");
            assertThat(pauseBody.at("/properties/expectedPauseRevision/maximum").asLong())
                    .isEqualTo(9007199254740991L);
            assertThat(pause.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("BungeoppangV4SessionResponse", "BungeoppangV5SessionResponse");
            var start = paths.path("/api/v1/minigames/sessions").path("post");
            assertThat(start.at("/security/0").has("AccessJwt")).isTrue();
            assertThat(start.at("/responses/201/content/application~1json/schema/oneOf").toString())
                    .contains("MinigameStartResponse", "BungeoppangV4StartResponse", "BungeoppangV5StartResponse");
            assertThat(start.at("/responses/409/description").asText())
                    .contains("IDEMPOTENCY_KEY_CONFLICT", "RULES_VERSION_MISMATCH");
            assertThat(start.path("parameters").size()).isEqualTo(1);
            assertThat(start.at("/parameters/0/name").asText()).isEqualTo("Idempotency-Key");
            assertThat(start.at("/parameters/0/required").asBoolean()).isTrue();
            var body = start.at("/requestBody/content/application~1json/schema");
            assertThat(body.at("/properties/minigameType/enum/0").asText()).isEqualTo("BUNGEOPPANG");
            assertThat(body.at("/properties/rulesVersion/enum").toString()).isEqualTo("[\"v2\",\"v4\",\"v5\"]");
            assertThat(body.at("/properties/rulesVersion/description").asText())
                    .contains("ontop.minigames.bungeoppang-v5-enabled", "RULES_VERSION_MISMATCH");
            assertThat(body.path("required").toString()).isEqualTo("[\"minigameType\"]");
            assertThat(body.path("additionalProperties").asBoolean(true)).isFalse();

            var status = paths.path("/api/v1/minigames/sessions").path("get");
            assertThat(status.path("parameters")).anyMatch(parameter ->
                    parameter.path("name").asText().equals("rulesVersion")
                            && parameter.at("/schema/enum").toString().equals("[\"v2\",\"v4\",\"v5\"]"));
            assertThat(status.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("BungeoppangStatusResponse", "BungeoppangV4LobbyResponse");
            assertThat(status.at("/responses/409/description").asText()).contains("RULES_VERSION_MISMATCH");

            var load = paths.path("/api/v1/minigames/sessions/{sessionId}").path("get");
            assertThat(load.path("parameters")).anyMatch(parameter ->
                    parameter.path("name").asText().equals("includeSource")
                            && parameter.at("/schema/type").asText().equals("boolean"));
            assertThat(load.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("MinigameStatusResponse", "BungeoppangV4SessionResponse", "BungeoppangV5SessionResponse");

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
            assertThat(paths.has("/api/v1/minigames/sessions/{sessionId}/deliveries")).isTrue();
            var delivery = paths.path("/api/v1/minigames/sessions/{sessionId}/deliveries").path("post");
            var deliverySchemas = delivery.at("/requestBody/content/application~1json/schema/oneOf");
            assertThat(deliverySchemas).hasSize(2);
            assertThat(deliverySchemas.get(0).path("additionalProperties").asBoolean(true)).isFalse();
            assertThat(deliverySchemas.get(0).at("/properties/rulesVersion/enum/0").asText()).isEqualTo("v4");
            assertThat(deliverySchemas.get(0).at("/properties/log/maxItems").asInt()).isEqualTo(1200);
            assertThat(deliverySchemas.get(0).at("/properties/log/items/properties/t/maximum").asInt())
                    .isEqualTo(59_999);
            assertThat(deliverySchemas.get(1).at("/properties/rulesVersion/enum/0").asText()).isEqualTo("v5");
            assertThat(deliverySchemas.get(1).at("/properties/log/maxItems").asInt()).isEqualTo(3600);
            assertThat(deliverySchemas.get(1).at("/properties/log/items/properties/t/maximum").asInt())
                    .isEqualTo(179_999);
            // The schema bound still admits stored three-minute rounds; each round enforces its own length.
            assertThat(deliverySchemas.get(1).at("/properties/log/items/properties/t/description").asText())
                    .contains("rules.durationMs", "v5-20261029.1", "119999", "v5-20261027.1", "179999");
            assertThat(deliverySchemas.get(0).at("/properties/log/items/properties/t/description").isMissingNode())
                    .isTrue();
            assertThat(delivery.at("/responses/200/content/application~1json/schema/oneOf").toString())
                    .contains("BungeoppangV4DeliveryResponse", "BungeoppangV5DeliveryResponse");
            assertThat(schemas.at("/BungeoppangV5DeliveryResponse/properties/replacementOrder/$ref").asText())
                    .endsWith("/BungeoppangV5Order");
            assertThat(schemas.at("/BungeoppangV5Checkpoint/properties/activeOrders/type").asText())
                    .isEqualTo("array");
            assertThat(schemas.at("/BungeoppangV5Rules/properties/heatAssignment/type").asText())
                    .isEqualTo("string");
            var complete = paths.path("/api/v1/minigames/sessions/{sessionId}/complete").path("post");
            assertThat(complete.at("/responses/422/description").asText()).contains("LOG_INVALID", "TOO_EARLY");
            var completeSchemas = complete.at("/requestBody/content/application~1json/schema/oneOf");
            assertThat(completeSchemas).hasSize(3);
            assertThat(completeSchemas.get(0).path("additionalProperties").asBoolean(true)).isFalse();
            assertThat(completeSchemas.get(1).path("additionalProperties").asBoolean(true)).isFalse();
            assertThat(completeSchemas.get(1).at("/properties/log/maxItems").asInt()).isEqualTo(1200);
            assertThat(completeSchemas.get(2).at("/properties/rulesVersion/enum/0").asText()).isEqualTo("v5");
            assertThat(completeSchemas.get(2).at("/properties/log/maxItems").asInt()).isEqualTo(3600);
            assertThat(complete.at("/responses/200/content/application~1json/schema/oneOf/1/$ref").asText())
                    .endsWith("/BungeoppangV4CompleteResponse");
            assertThat(complete.path("parameters").toString()).contains("Idempotency-Key", "v4 완료에는 필수");
            assertThat(schemas.at("/BungeoppangV4CompleteResponse/description").asText()).contains("v5");
            assertThat(delivery.path("summary").asText()).isEqualTo("붕어빵 v4·v5 납품 승인");
            assertThat(delivery.path("description").asText()).contains("replacementOrder", "1 MiB", "256 KiB");
            assertThat(load.path("parameters")).filteredOn(parameter -> List.of("includeSource", "includeProgress",
                    "deliveryKey").contains(parameter.path("name").asText()))
                    .hasSize(3).allMatch(parameter -> parameter.path("description").asText().contains("v4·v5"));
            assertThat(complete.path("description").asText())
                    .contains("local,db", "dev,db", "v2", "v4", "V124", "V125", "V126", "500냥")
                    .doesNotContain("local 전용");
            assertThat(paths.path("/api/v1/minigames/sessions").has("get")).isTrue();
        }
    }
}
