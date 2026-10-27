package com.ssafy.ontop.minigame.config;

import com.ssafy.ontop.minigame.controller.MinigameController;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.BooleanSchema;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.parameters.RequestBody;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;

/** JsonNode 파싱의 엄격한 계약을 문서에만 반영한다. 실제 입력 검증·인증은 변경하지 않는다. */
@Component
@Profile("(local | dev) & !prod & !production")
public class MinigameOpenApiCustomizer implements OperationCustomizer, OpenApiCustomizer {
    @Override
    public Operation customize(Operation operation, HandlerMethod handler) {
        if (handler.getBeanType() != MinigameController.class) {
            return operation;
        }
        String method = handler.getMethod().getName();
        if (!method.equals("load") && !method.equals("status")) {
            Schema<?> schema = new ObjectSchema();
            schema.additionalProperties(false);
            if (method.equals("start")) {
                schema.addProperty("minigameType", new StringSchema()._enum(List.of("BUNGEOPPANG")));
                schema.addProperty("rulesVersion", new StringSchema()._enum(List.of("v2", "v4"))
                        .description("선택값. 생략하거나 v2이면 기존 v2, v4이면 붕어빵 v4를 시작합니다."));
                schema.required(List.of("minigameType"));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "201", oneOf("MinigameStartResponse", "BungeoppangV4StartResponse"));
            }
            if (method.equals("complete")) {
                ObjectSchema v2 = (ObjectSchema) schema;
                ObjectSchema entry = new ObjectSchema();
                entry.additionalProperties(false);
                entry.addProperty("slot", new IntegerSchema().minimum(java.math.BigDecimal.ZERO).maximum(java.math.BigDecimal.valueOf(5)));
                entry.addProperty("action", new StringSchema()._enum(List.of("POUR", "FILL", "TURN", "DISCARD")));
                entry.addProperty("t", new IntegerSchema().minimum(java.math.BigDecimal.ZERO).maximum(java.math.BigDecimal.valueOf(60000)));
                entry.required(List.of("slot", "action", "t"));
                v2.addProperty("log", new ArraySchema().items(entry).maxItems(1200));
                v2.addProperty("seenTips", new ArraySchema().items(new Schema<>()).maxItems(5)
                        .description("선택 배열. 문자열 START/POUR/GOLD/BURNT/RUSH만 기억하고 그 외 값은 무시합니다."));
                v2.addProperty("clientScore", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                        .maximum(java.math.BigDecimal.valueOf(Integer.MAX_VALUE)));
                v2.required(List.of("log"));

                ObjectSchema v4 = new ObjectSchema();
                v4.additionalProperties(false);
                v4.addProperty("rulesVersion", new StringSchema()._enum(List.of("v4")));
                v4.addProperty("throughSeq", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                        .maximum(java.math.BigDecimal.valueOf(1_200)));
                v4.addProperty("prefixHash", new StringSchema().pattern("^[0-9a-f]{64}$"));
                v4.addProperty("log", new ArraySchema().items(v4Action()).maxItems(1_200));
                v4.addProperty("seenTips", new ArraySchema().items(new StringSchema()).maxItems(5));
                v4.addProperty("clientScore", new IntegerSchema().format("int64")
                        .minimum(java.math.BigDecimal.ZERO));
                v4.required(List.of("rulesVersion", "throughSeq", "prefixHash", "log"));
                schema = new ComposedSchema().addOneOfItem(v2).addOneOfItem(v4);
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(false)
                        .description("v4 완료에는 필수이며 v2 완료에는 사용하지 않습니다.")
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "200", oneOf("MinigameCompleteResponse",
                        "BungeoppangV4CompleteResponse"));
            }
            if (method.equals("deliver")) {
                ObjectSchema entry = new ObjectSchema();
                entry.additionalProperties(false);
                entry.addProperty("seq", new IntegerSchema().minimum(java.math.BigDecimal.ONE));
                entry.addProperty("action", new StringSchema()._enum(List.of(
                        "POUR", "FILL", "TURN", "DISCARD", "TRAY_DISCARD", "DELIVER")));
                entry.addProperty("t", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                        .maximum(java.math.BigDecimal.valueOf(59_999)));
                entry.addProperty("slot", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                        .maximum(java.math.BigDecimal.valueOf(5)).nullable(true));
                entry.addProperty("filling", new StringSchema()
                        ._enum(List.of("bean", "custard", "pizza", "chocolate")).nullable(true));
                entry.addProperty("breadId", new IntegerSchema().format("int64")
                        .minimum(java.math.BigDecimal.ONE).nullable(true));
                entry.addProperty("orderId", new StringSchema().pattern("^[1-9][0-9]{0,18}$").nullable(true));
                entry.addProperty("deliveryKey", new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$")
                        .nullable(true));
                entry.required(List.of("seq", "action", "t"));
                schema.addProperty("rulesVersion", new StringSchema()._enum(List.of("v4")));
                schema.addProperty("throughSeq", new IntegerSchema().minimum(java.math.BigDecimal.ONE)
                        .maximum(java.math.BigDecimal.valueOf(1_200)));
                schema.addProperty("prefixHash", new StringSchema().pattern("^[0-9a-f]{64}$"));
                schema.addProperty("log", new ArraySchema().items(entry).minItems(1).maxItems(1_200));
                schema.required(List.of("rulesVersion", "throughSeq", "prefixHash", "log"));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "200", new Schema<>().$ref("#/components/schemas/BungeoppangV4DeliveryResponse"));
            }
            operation.setRequestBody(new RequestBody().required(true).content(new Content()
                    .addMediaType("application/json", new io.swagger.v3.oas.models.media.MediaType().schema(schema))));
        }
        if (method.equals("status")) {
            addQueryParameter(operation, "rulesVersion", false,
                    new StringSchema()._enum(List.of("v2", "v4")),
                    "조회 계약 버전. 생략하거나 v2이면 기존 응답, v4이면 v4 로비 상태를 반환합니다.");
            responseSchema(operation, "200", oneOf("BungeoppangStatusResponse", "BungeoppangV4LobbyResponse"));
        }
        if (method.equals("load")) {
            addQueryParameter(operation, "includeSource", false, new BooleanSchema()._default(false),
                    "v4 세션에서 규칙·불 원본·발급 시각을 포함합니다. v2 응답에는 영향을 주지 않습니다.");
            addQueryParameter(operation, "includeProgress", false, new BooleanSchema()._default(false),
                    "종결된 v4 세션에서도 마지막 checkpoint·승인 로그·발급 주문 이력을 포함합니다.");
            addQueryParameter(operation, "deliveryKey", false,
                    new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64),
                    "v4 납품 영수증 결과를 조회합니다. 미처리·처리 중이면 UNKNOWN입니다.");
            responseSchema(operation, "200", oneOf("MinigameStatusResponse", "BungeoppangV4SessionResponse"));
        }
        if (operation.getParameters() != null) {
            operation.getParameters().stream().filter(p -> p.getName().equals("sessionId")).forEach(p -> {
                p.getSchema().setPattern("^[1-9][0-9]{0,18}$");
                p.setDescription("본인 세션의 양의 BIGINT ID (최대 9223372036854775807)");
            });
        }
        operation.setDescription((operation.getDescription() == null ? "" : operation.getDescription() + " ")
                + "local,db + ontop.minigames.enabled=true 또는 dev,db에서 사용합니다. dev는 기본 활성화하며 "
                + "공통 스키마에 V110/V111, v4 초기화 V124, 납품 영수증 V125, 최종 정산 V126을 추가합니다. prod/production에서는 비활성화합니다. "
                + "버전 생략은 기존 v2이고 v4는 명시적으로 선택합니다. v4는 납품 승인·checkpoint·다음 주문, "
                + "마지막 미승인 납품 검증, 영속 멱등 완료와 Wallet 일일 한도 지급을 제공합니다. "
                + "v2는 60초, 15점당 1냥, KST 하루 100냥 계약을 유지합니다. "
                + "탭 이동 중에도 시간은 흐르며 랭킹은 제외합니다. score·rewardAmount·userId를 본문에 넣지 않습니다. "
                + "상태 GET도 지갑 잠금과 만료 세션 INVALID 갱신을 수행할 수 있습니다. 읽기 전용 트랜잭션이 아닙니다.");
        return operation;
    }

    @Override
    public void customise(OpenAPI api) {
        for (Class<?> type : List.of(BungeoppangV4Responses.FillingCounts.class,
                BungeoppangV4Responses.Order.class, BungeoppangV4Responses.Timing.class,
                BungeoppangV4Responses.Rules.class, BungeoppangV4Responses.Slot.class,
                BungeoppangV4Responses.Stats.class, BungeoppangV4Responses.TrayBread.class,
                BungeoppangV4Responses.Checkpoint.class,
                BungeoppangV4Responses.StartResponse.class, BungeoppangV4Responses.LobbyResponse.class,
                BungeoppangV4Responses.SessionResponse.class, BungeoppangV4DeliveryDtos.Action.class,
                BungeoppangV4DeliveryDtos.Request.class, BungeoppangV4DeliveryDtos.Response.class,
                BungeoppangV4DeliveryDtos.Lookup.class, BungeoppangV4DeliveryDtos.Recovery.class,
                BungeoppangV4DeliveryDtos.ErrorResponse.class, BungeoppangV4CompleteDtos.Request.class,
                BungeoppangV4CompleteDtos.Response.class)) {
            ModelConverters.getInstance().readAll(type).forEach(api.getComponents()::addSchemas);
        }

        var schemas = api.getComponents().getSchemas();
        for (String name : List.of("BungeoppangV4FillingCounts", "BungeoppangV4Order",
                "BungeoppangV4Timing", "BungeoppangV4Rules", "BungeoppangV4CheckpointSlot",
                "BungeoppangV4CheckpointStats", "BungeoppangV4CheckpointBread", "BungeoppangV4Checkpoint",
                "BungeoppangV4StartResponse", "BungeoppangV4LobbyResponse",
                "BungeoppangV4DeliveryRequest", "BungeoppangV4DeliveryResponse",
                "BungeoppangV4DeliveryLookup", "BungeoppangV4Recovery", "BungeoppangV4ErrorResponse",
                "BungeoppangV4CompleteResponse")) {
            requireAll(schemas.get(name));
        }
        Schema<?> action = schemas.get("BungeoppangV4Action");
        if (action != null) { action.setRequired(List.of("seq", "action", "t")); }
        Schema<?> session = schemas.get("BungeoppangV4SessionResponse");
        if (session != null && session.getProperties() != null) {
            var required = new ArrayList<>(session.getProperties().keySet());
            required.removeAll(Set.of("rules", "heats", "issuedAt", "isFirstGame"));
            session.setRequired(required);
        }
        nullable(schemas, "BungeoppangV4CheckpointSlot", "filling", "lastAt");
        nullable(schemas, "BungeoppangV4Checkpoint", "lastAt", "currentOrder");
        nullable(schemas, "BungeoppangV4Action", "slot", "filling", "breadId", "orderId", "deliveryKey");
        nullable(schemas, "BungeoppangV4DeliveryLookup", "httpStatus", "response");
        nullable(schemas, "BungeoppangV4ErrorResponse", "details", "detail", "index", "recovery", "retryAfterMs");
        nullable(schemas, "BungeoppangV4LobbyResponse", "activeSessionId");
        nullable(schemas, "BungeoppangV4SessionResponse", "score", "endedAt", "endReason", "checkpoint",
                "result", "deliveryLookup");
    }

    private void requireAll(Schema<?> schema) {
        if (schema != null && schema.getProperties() != null) {
            schema.setRequired(new ArrayList<>(schema.getProperties().keySet()));
        }
    }

    private void nullable(java.util.Map<String, Schema> schemas, String schemaName, String... fields) {
        Schema<?> schema = schemas.get(schemaName);
        if (schema == null || schema.getProperties() == null) {
            return;
        }
        for (String field : fields) {
            Schema<?> property = (Schema<?>) schema.getProperties().get(field);
            if (property != null) {
                if (property.get$ref() == null) {
                    property.setNullable(true);
                } else {
                    ComposedSchema nullableReference = new ComposedSchema();
                    nullableReference.addAllOfItem(new Schema<>().$ref(property.get$ref()));
                    nullableReference.setNullable(true);
                    schema.addProperty(field, nullableReference);
                }
            }
        }
    }

    private void responseSchema(Operation operation, String status, Schema<?> schema) {
        var response = operation.getResponses() == null ? null : operation.getResponses().get(status);
        if (response == null) {
            return;
        }
        if (response.getContent() == null) {
            response.setContent(new Content());
        }
        var mediaType = response.getContent().get("application/json");
        if (mediaType == null) {
            mediaType = new io.swagger.v3.oas.models.media.MediaType();
            response.getContent().addMediaType("application/json", mediaType);
        }
        mediaType.setSchema(schema);
    }

    private Schema<?> oneOf(String... names) {
        ComposedSchema schema = new ComposedSchema();
        for (String name : names) {
            schema.addOneOfItem(new Schema<>().$ref("#/components/schemas/" + name));
        }
        return schema;
    }

    private ObjectSchema v4Action() {
        ObjectSchema entry = new ObjectSchema();
        entry.additionalProperties(false);
        entry.addProperty("seq", new IntegerSchema().minimum(java.math.BigDecimal.ONE));
        entry.addProperty("action", new StringSchema()._enum(List.of(
                "POUR", "FILL", "TURN", "DISCARD", "TRAY_DISCARD", "DELIVER")));
        entry.addProperty("t", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                .maximum(java.math.BigDecimal.valueOf(59_999)));
        entry.addProperty("slot", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                .maximum(java.math.BigDecimal.valueOf(5)).nullable(true));
        entry.addProperty("filling", new StringSchema()
                ._enum(List.of("bean", "custard", "pizza", "chocolate")).nullable(true));
        entry.addProperty("breadId", new IntegerSchema().format("int64")
                .minimum(java.math.BigDecimal.ONE).nullable(true));
        entry.addProperty("orderId", new StringSchema().pattern("^[1-9][0-9]{0,18}$").nullable(true));
        entry.addProperty("deliveryKey", new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").nullable(true));
        entry.required(List.of("seq", "action", "t"));
        return entry;
    }

    private void addQueryParameter(Operation operation, String name, boolean required, Schema<?> schema,
            String description) {
        if (operation.getParameters() != null) {
            var existing = operation.getParameters().stream()
                    .filter(parameter -> name.equals(parameter.getName())).findFirst();
            if (existing.isPresent()) {
                existing.get().setRequired(required);
                existing.get().setDescription(description);
                existing.get().setSchema(schema);
                return;
            }
        }
        operation.addParametersItem(new Parameter().in("query").name(name).required(required)
                .description(description).schema(schema));
    }
}
