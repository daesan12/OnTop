package com.ssafy.ontop.notes;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.notes.enabled=true", "ontop.feedback.enabled=true",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
@ActiveProfiles("local")
class NotesOpenApiTests {
    @Autowired private TestRestTemplate http;

    @Test void 실제API문서는_메모선택주제만추가하고_소리함계약은유지한다() {
        var response = http.getForEntity("/v3/api-docs", JsonNode.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        var notes = response.getBody().at("/paths/~1api~1v1~1notes/post");
        var body = notes.at("/requestBody/content/application~1json/schema");
        assertThat(body.at("/properties/category/enum")).extracting(JsonNode::asText)
                .containsExactly("daily", "cheer", "worry", "recommend", "free");
        assertThat(body.at("/properties/category/default").asText()).isEqualTo("free");
        assertThat(body.path("required")).extracting(JsonNode::asText)
                .containsExactlyInAnyOrder("operationId", "channelId", "text");
        assertThat(body.path("additionalProperties").asBoolean(true)).isFalse();
        assertThat(notes.at("/responses/400/description").asText()).contains("NOTES_CATEGORY_INVALID");
        assertThat(response.getBody().at("/paths/~1api~1v1~1feedback/post/requestBody/content/application~1json/schema/properties")
                .has("category")).isFalse();
    }
}
