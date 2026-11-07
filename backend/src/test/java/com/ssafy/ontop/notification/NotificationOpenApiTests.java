package com.ssafy.ontop.notification;

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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class NotificationOpenApiTests {
    @LocalServerPort int port;

    @Test
    void 알림_항목은_기존_의견_항목과_섞이지_않고_답변_필수필드를_명시한다() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/v3/api-docs")).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var api = new ObjectMapper().readTree(response.body());
            assertThat(api.at("/components/schemas/NotificationListResponse/properties/items/items/$ref").asText())
                    .isEqualTo("#/components/schemas/PersonalNotificationEntry");
            var entry = api.at("/components/schemas/PersonalNotificationEntry/properties");
            assertThat(entry.has("readAt")).isTrue();
            assertThat(entry.has("authorUserId")).isFalse();
            var request = api.at("/components/schemas/FeedbackReplyInput");
            assertThat(request.path("required")).hasSize(4);
            assertThat(request.path("additionalProperties").asBoolean()).isFalse();
            for (String field : new String[]{"feedbackId", "feedbackText", "feedbackStatus"}) {
                assertThat(api.at("/components/schemas/NotificationDetailResponse/properties/" + field + "/nullable").asBoolean()).isTrue();
            }
            for (String field : new String[]{"balanceAfter", "ticketsAfter"}) {
                assertThat(api.at("/components/schemas/ClaimResponse/properties/" + field + "/nullable").asBoolean()).isTrue();
            }
        }
    }
}
