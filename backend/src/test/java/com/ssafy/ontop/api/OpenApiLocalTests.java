package com.ssafy.ontop.api;

import io.swagger.v3.core.util.Yaml;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ontop.feedback.enabled=true", "ontop.notes.enabled=true"})
@ActiveProfiles("local")
class OpenApiLocalTests extends OpenApiHttpTestSupport {

    @Test
    void 주차별_행사_DTO가_기존_게임과_랭킹_스키마를_덮어쓰지_않는다() throws Exception {
        var api = json();
        var schemas = api.at("/components/schemas");
        assertThat(schemas.at("/Game/properties/started/type").asText()).isEqualTo("integer");
        assertThat(schemas.at("/Ranking/properties/items/items/$ref").asText())
                .isEqualTo("#/components/schemas/RankingEntry");
        assertThat(schemas.at("/RankingEntry/properties/finishMs/type").asText())
                .isEqualTo("integer");
        assertThat(schemas.at("/WeeklyMinigameGameConfig/properties/prizeName/type").asText())
                .isEqualTo("string");
        assertThat(schemas.at("/WeeklyMinigameRanking/properties/game/$ref").asText())
                .isEqualTo("#/components/schemas/WeeklyMinigameGameConfig");
        assertThat(api.path("paths")
                .path("/api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/ranking")
                .path("get").path("responses").path("200").path("content").path("*/*")
                .path("schema").path("$ref").asText())
                .isEqualTo("#/components/schemas/WeeklyMinigameRanking");
        assertThat(api.path("paths").path("/api/v1/minigames/jumpmap/rankings")
                .path("get").path("responses").path("200").path("content").path("*/*")
                .path("schema").path("$ref").asText())
                .isEqualTo("#/components/schemas/Ranking");
    }

    @Test
    void 경품_지급_확인_요청은_회원_ID를_필수로_명시한다() throws Exception {
        var required = json().at("/components/schemas/DeliveryRequest/required");
        assertThat(required.isArray()).isTrue();
        assertThat(required.toString()).contains("expectedUserId");
    }

    @Test
    void 실제_YAML을_내보내고_커밋된_정적_명세와_구조를_비교한다() throws Exception {
        var response = get("/v3/api-docs.yaml");
        assertThat(response.statusCode()).isEqualTo(200);
        Path specification = Path.of("../docs/api/openapi.yaml");
        if (Boolean.getBoolean("ontop.openapi.export")) {
            Files.createDirectories(specification.getParent());
            Files.writeString(specification, response.body().replace("\r\n", "\n"), StandardCharsets.UTF_8);
        }
        assertThat(Files.exists(specification)).isTrue();
        assertThat(Yaml.mapper().readTree(Files.readString(specification)))
                .isEqualTo(Yaml.mapper().readTree(response.body()));
    }
}
