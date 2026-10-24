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
        properties = "ontop.feedback.enabled=true")
@ActiveProfiles("local")
class OpenApiLocalTests extends OpenApiHttpTestSupport {

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
