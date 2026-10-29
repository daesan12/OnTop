package com.ssafy.ontop.minigame.config;

import com.ssafy.ontop.minigame.controller.MinigameController;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
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
    private static final String V5_FLAG = "v5는 서버 설정 ontop.minigames.bungeoppang-v5-enabled=true일 때만 받고, "
            + "기본값(false)에서는 409 RULES_VERSION_MISMATCH입니다.";
    /** The schema bound covers every v5 round still accepted; each round enforces its own stored length. */
    private static final String V5_ACTION_TIME = "플레이 시작 후 경과 ms. 판마다 저장된 rules.durationMs 미만이어야 합니다. "
            + "신규 판(v5-20261029.1)은 119999까지, 기존 판(v5-20261027.1)은 179999까지 받습니다.";

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
                schema.addProperty("rulesVersion", new StringSchema()._enum(List.of("v2", "v4", "v5"))
                        .description("선택값. 생략하거나 v2이면 기존 v2, v4이면 붕어빵 v4를 시작합니다. "
                                + V5_FLAG));
                schema.required(List.of("minigameType"));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "201", oneOf("MinigameStartResponse", "BungeoppangV4StartResponse",
                        "BungeoppangV5StartResponse"));
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

                schema = new ComposedSchema().addOneOfItem(v2)
                        .addOneOfItem(completeRequest("v4", 1_200, 59_999))
                        .addOneOfItem(completeRequest("v5", 3_600, 179_999));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(false)
                        .description("v4 완료에는 필수이며 v5 완료에도 필수입니다. v2 완료에는 사용하지 않습니다.")
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "200", oneOf("MinigameCompleteResponse",
                        "BungeoppangV4CompleteResponse"));
            }
            if (method.equals("deliver")) {
                // v4 body up to 256 KiB, v5 body up to 1 MiB; the version picks the parser and the limits.
                schema = new ComposedSchema().addOneOfItem(deliveryRequest("v4", 1_200, 59_999))
                        .addOneOfItem(deliveryRequest("v5", 3_600, 179_999));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64)));
                responseSchema(operation, "200", oneOf("BungeoppangV4DeliveryResponse",
                        "BungeoppangV5DeliveryResponse"));
            }
            operation.setRequestBody(new RequestBody().required(true).content(new Content()
                    .addMediaType("application/json", new io.swagger.v3.oas.models.media.MediaType().schema(schema))));
        }
        if (method.equals("status")) {
            addQueryParameter(operation, "rulesVersion", false,
                    new StringSchema()._enum(List.of("v2", "v4", "v5")),
                    "조회 계약 버전. 생략하거나 v2이면 기존 응답, v4·v5이면 같은 형식의 로비 상태를 반환합니다. "
                            + V5_FLAG);
            responseSchema(operation, "200", oneOf("BungeoppangStatusResponse", "BungeoppangV4LobbyResponse"));
        }
        if (method.equals("load")) {
            addQueryParameter(operation, "includeSource", false, new BooleanSchema()._default(false),
                    "v4·v5 세션에서 규칙·불 원본·발급 시각을 포함합니다. v2 응답에는 영향을 주지 않습니다.");
            addQueryParameter(operation, "includeProgress", false, new BooleanSchema()._default(false),
                    "종결된 v4·v5 세션에서도 마지막 checkpoint·승인 로그·발급 주문 이력을 포함합니다.");
            addQueryParameter(operation, "deliveryKey", false,
                    new StringSchema().pattern("^[A-Za-z0-9_-]{1,64}$").minLength(1).maxLength(64),
                    "v4·v5 납품 영수증 결과를 조회합니다. 미처리·처리 중이면 UNKNOWN입니다.");
            responseSchema(operation, "200", oneOf("MinigameStatusResponse", "BungeoppangV4SessionResponse",
                    "BungeoppangV5SessionResponse"));
        }
        if (operation.getParameters() != null) {
            operation.getParameters().stream().filter(p -> p.getName().equals("sessionId")).forEach(p -> {
                p.getSchema().setPattern("^[1-9][0-9]{0,18}$");
                p.setDescription("본인 세션의 양의 BIGINT ID (최대 9223372036854775807)");
            });
        }
        operation.setDescription((operation.getDescription() == null ? "" : operation.getDescription() + " ")
                + "local,db 또는 dev,db에서 사용하며, 운영 prod,db에서도 기능 플래그로 활성화할 수 있습니다. dev는 기본 활성화하며 "
                + "공통 스키마에 V110/V111, v4 초기화 V124, 납품 영수증 V125, 최종 정산 V126을 추가합니다. 운영은 DB 이력과 마이그레이션 위치 검토가 먼저 필요합니다. "
                + "버전 생략은 기존 v2이고 v4는 명시적으로 선택합니다. v4는 납품 승인·checkpoint·다음 주문, "
                + "마지막 미승인 납품 검증, 영속 멱등 완료와 Wallet 일일 한도 지급을 제공합니다. "
                + "v2는 60초, 15점당 1냥, KST 하루 100냥 계약을 유지합니다. "
                + "탭 이동 중에도 시간은 흐르며 랭킹은 제외합니다. score·rewardAmount·userId를 본문에 넣지 않습니다. "
                + "상태 GET도 지갑 잠금과 만료 세션 INVALID 갱신을 수행할 수 있습니다. 읽기 전용 트랜잭션이 아닙니다. "
                + "v5(신규 판 120초·90초부터 가속, 기존 v5-20261027.1 판은 저장된 180초·150초 규칙 유지, "
                + "활성 손님 3명, 선택 납품·충원, V128)도 제공하며 " + V5_FLAG);
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
                BungeoppangV4CompleteDtos.Response.class, BungeoppangV5Responses.Rules.class,
                BungeoppangV5Responses.Order.class, BungeoppangV5Responses.Checkpoint.class,
                BungeoppangV5Responses.StartResponse.class, BungeoppangV5Responses.DeliveryResponse.class,
                BungeoppangV5Responses.SessionResponse.class)) {
            ModelConverters.getInstance().readAll(type).forEach(api.getComponents()::addSchemas);
        }

        var schemas = api.getComponents().getSchemas();
        for (String name : List.of("BungeoppangV4FillingCounts", "BungeoppangV4Order",
                "BungeoppangV4Timing", "BungeoppangV4Rules", "BungeoppangV4CheckpointSlot",
                "BungeoppangV4CheckpointStats", "BungeoppangV4CheckpointBread", "BungeoppangV4Checkpoint",
                "BungeoppangV4StartResponse", "BungeoppangV4LobbyResponse",
                "BungeoppangV4DeliveryRequest", "BungeoppangV4DeliveryResponse",
                "BungeoppangV4DeliveryLookup", "BungeoppangV4Recovery", "BungeoppangV4ErrorResponse",
                "BungeoppangV4CompleteResponse", "BungeoppangV5Rules", "BungeoppangV5Order", "BungeoppangV5Checkpoint",
                "BungeoppangV5StartResponse", "BungeoppangV5DeliveryResponse")) {
            requireAll(schemas.get(name));
        }
        Schema<?> action = schemas.get("BungeoppangV4Action");
        if (action != null) { action.setRequired(List.of("seq", "action", "t")); }
        for (String name : List.of("BungeoppangV4SessionResponse", "BungeoppangV5SessionResponse")) {
            Schema<?> session = schemas.get(name);
            if (session != null && session.getProperties() != null) {
                var required = new ArrayList<>(session.getProperties().keySet());
                required.removeAll(Set.of("rules", "heats", "issuedAt", "isFirstGame"));
                session.setRequired(required);
            }
        }
        nullable(schemas, "BungeoppangV5Checkpoint", "lastAt");
        nullable(schemas, "BungeoppangV5SessionResponse", "score", "endedAt", "endReason", "checkpoint",
                "result", "deliveryLookup");
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

    /** v4 and v5 share the request shape; only the version, log length and last action time differ. */
    private ObjectSchema deliveryRequest(String version, int maxLog, int maxT) {
        ObjectSchema schema = new ObjectSchema();
        schema.additionalProperties(false);
        schema.addProperty("rulesVersion", new StringSchema()._enum(List.of(version)));
        schema.addProperty("throughSeq", new IntegerSchema().minimum(java.math.BigDecimal.ONE)
                .maximum(java.math.BigDecimal.valueOf(maxLog)));
        schema.addProperty("prefixHash", new StringSchema().pattern("^[0-9a-f]{64}$"));
        schema.addProperty("log", new ArraySchema().items(action(version, maxT)).minItems(1).maxItems(maxLog));
        schema.required(List.of("rulesVersion", "throughSeq", "prefixHash", "log"));
        return schema;
    }

    private ObjectSchema completeRequest(String version, int maxLog, int maxT) {
        ObjectSchema schema = new ObjectSchema();
        schema.additionalProperties(false);
        schema.addProperty("rulesVersion", new StringSchema()._enum(List.of(version)));
        schema.addProperty("throughSeq", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                .maximum(java.math.BigDecimal.valueOf(maxLog)));
        schema.addProperty("prefixHash", new StringSchema().pattern("^[0-9a-f]{64}$"));
        schema.addProperty("log", new ArraySchema().items(action(version, maxT)).maxItems(maxLog));
        schema.addProperty("seenTips", new ArraySchema().items(new StringSchema()).maxItems(5));
        schema.addProperty("clientScore", new IntegerSchema().format("int64")
                .minimum(java.math.BigDecimal.ZERO));
        schema.required(List.of("rulesVersion", "throughSeq", "prefixHash", "log"));
        return schema;
    }

    private ObjectSchema action(String version, int maxT) {
        ObjectSchema entry = new ObjectSchema();
        entry.additionalProperties(false);
        entry.addProperty("seq", new IntegerSchema().minimum(java.math.BigDecimal.ONE));
        entry.addProperty("action", new StringSchema()._enum(List.of(
                "POUR", "FILL", "TURN", "DISCARD", "TRAY_DISCARD", "DELIVER")));
        entry.addProperty("t", new IntegerSchema().minimum(java.math.BigDecimal.ZERO)
                .maximum(java.math.BigDecimal.valueOf(maxT))
                .description("v5".equals(version) ? V5_ACTION_TIME : null));
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
