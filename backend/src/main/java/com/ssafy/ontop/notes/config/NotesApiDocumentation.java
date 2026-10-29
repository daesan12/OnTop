package com.ssafy.ontop.notes.config;

import io.swagger.v3.oas.models.media.StringSchema;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** 공통 요청 스키마 보정 뒤 익명 메모의 선택 필드만 덧붙인다. */
@Configuration(proxyBeanMethods = false)
@Profile("(local | dev) & !prod & !production")
@ConditionalOnProperty(name = "ontop.notes.enabled", havingValue = "true")
public class NotesApiDocumentation {
    @Bean
    OpenApiCustomizer noteCategoryDocumentation() {
        return api -> {
            var path = api.getPaths().get("/api/v1/notes");
            if (path == null || path.getPost() == null) { return; }
            var category = new StringSchema();
            category.setEnum(List.of("daily", "cheer", "worry", "recommend", "free"));
            category.setDefault("free");
            category.setDescription("생략 시 free. 명시적 null은 허용하지 않는다.");
            path.getPost().getRequestBody().getContent().get("application/json").getSchema()
                    .addProperty("category", category);
            path.getPost().getResponses().get("400")
                    .setDescription("INVALID_REQUEST / NOTES_TEXT_INVALID / NOTES_CATEGORY_INVALID");
        };
    }
}
