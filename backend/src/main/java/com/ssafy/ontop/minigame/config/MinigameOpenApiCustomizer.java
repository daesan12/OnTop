package com.ssafy.ontop.minigame.config;

import com.ssafy.ontop.minigame.controller.MinigameController;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.parameters.RequestBody;
import java.util.List;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;

/** JsonNode 파싱의 엄격한 계약을 문서에만 반영한다. 실제 입력 검증·인증은 변경하지 않는다. */
@Component
@Profile("local & !prod & !production")
public class MinigameOpenApiCustomizer implements OperationCustomizer {
    @Override
    public Operation customize(Operation operation, HandlerMethod handler) {
        if (handler.getBeanType() != MinigameController.class) {
            return operation;
        }
        String method = handler.getMethod().getName();
        if (!method.equals("load")) {
            ObjectSchema schema = new ObjectSchema();
            schema.additionalProperties(false);
            if (method.equals("start")) {
                schema.addProperty("minigameType", new StringSchema()._enum(List.of("BUNGEOPPANG")));
                schema.required(List.of("minigameType"));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("[A-Za-z0-9_-]{1,64}").minLength(1).maxLength(64)));
            }
            operation.setRequestBody(new RequestBody().required(true).content(new Content()
                    .addMediaType("application/json", new io.swagger.v3.oas.models.media.MediaType().schema(schema))));
        }
        operation.setDescription((operation.getDescription() == null ? "" : operation.getDescription() + " ")
                + "local 전용. 서비스는 local,db + ontop.minigames.enabled=true 및 V110 선택 적용이 필요합니다. "
                + "실제 굽기 판정 소스가 없으면 완료/지급하지 않습니다. 점수·보상·userId를 본문에 넣지 않습니다.");
        return operation;
    }
}
