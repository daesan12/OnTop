package com.ssafy.ontop.api;

import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.parameters.RequestBody;
import java.math.BigDecimal;
import java.util.List;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;

/**
 * JsonNode로 엄격하게 파싱하는 기존 요청의 문서 스키마와 Servlet 숨김 파라미터를 보완한다.
 * 실행 시 요청 검증/인가에는 관여하지 않는다.
 */
@Component
@Profile("(local | dev) & !prod & !production")
public class OpenApiSchemaCustomizer implements OperationCustomizer {

    @Override
    public Operation customize(Operation operation, HandlerMethod handler) {
        String controller = handler.getBeanType().getSimpleName();
        operation.getResponses().forEach((code, response) -> {
            response.addHeaderObject("Cache-Control", new Header().schema(new StringSchema())
                    .description("no-store"));
            if (code.equals("302")) {
                response.addHeaderObject("Location", new Header().schema(new StringSchema().format("uri"))
                        .description("인가 시작은 공급자 URL, callback은 설정된 프론트 URI의 exchange_code fragment"));
            }
            boolean refreshIssued = code.equals("200") && (controller.equals("AuthRefreshController")
                    || controller.equals("AuthExchangeController"));
            if (refreshIssued || code.equals("201") && controller.equals("UserOnboardingController")
                    || code.equals("204") && controller.equals("AuthLogoutController")) {
                response.addHeaderObject("Set-Cookie", new Header().schema(new StringSchema())
                        .description("ONTOP_REFRESH; HttpOnly; Path=/api/v1/auth 기본값; Secure/SameSite 환경설정. "
                                + "Logout은 Max-Age=0 삭제, Exchange의 신규 회원 분기는 발급하지 않음. "
                                + "Exchange는 OAuth 세션 쿠키 ID도 회전합니다."));
            }
        });
        if (controller.equals("AuthController") || controller.equals("AuthCallbackController")) {
            operation.getParameters().stream().filter(p -> "provider".equals(p.getName())).forEach(p ->
                    p.setSchema(new StringSchema()._enum(List.of("ssafy", "naver"))));
        }
        if (controller.equals("AuthCallbackController")) {
            query(operation, "state", true, new StringSchema(), "동일 OAuth 세션/provider의 서버 발급 state");
            query(operation, "code", false, new StringSchema().maxLength(4096), "성공 시 공급자 인가 코드");
            query(operation, "error", false, new StringSchema(), "공급자 거절 시 code 대신 전달");
        }
        if (controller.equals("AuthExchangeController")) {
            body(operation, new ObjectSchema().addProperty("exchangeCode",
                    new StringSchema().pattern("[A-Za-z0-9_-]{43}").minLength(43).maxLength(43))
                    .required(List.of("exchangeCode")).additionalProperties(false));
        }
        if (controller.equals("NicknameAvailabilityController")) {
            operation.getParameters().stream().filter(p -> "nickname".equals(p.getName())).forEach(p -> {
                p.setRequired(true);
                p.setSchema(new StringSchema().minLength(2).maxLength(8).pattern("[가-힣A-Za-z0-9]{2,8}")
                        .example("온탑고수"));
            });
        }
        if (List.of("AuthExchangeController", "AuthRefreshController", "AuthLogoutController",
                "UserOnboardingController", "WebSocketTicketController").contains(controller)) {
            boolean required = controller.equals("AuthRefreshController") || controller.equals("AuthLogoutController");
            operation.addParametersItem(new Parameter().in("header").name("Origin").required(required)
                    .schema(new StringSchema()).description("브라우저가 자동 전송합니다. AUTH_ALLOWED_ORIGINS의 명시적 Origin. "
                            + "Swagger UI와 같은 서버 Origin도 허용 목록에 추가하세요. Refresh/Logout은 필수; "
                            + "다른 API는 비브라우저 Origin 누락을 기존 Fetch Metadata 정책으로 판정합니다."));
        }
        if (controller.equals("AuthLogoutController")) {
            operation.addSecurityItem(new io.swagger.v3.oas.models.security.SecurityRequirement());
        }
        if (controller.equals("ChannelQueryController") || controller.equals("TableQueryController")) {
            // 기존 local 조회 오류는 {code,message,details:null}이다.
            operation.getResponses().forEach((code, response) -> {
                if (Integer.parseInt(code) >= 400) {
                    response.setContent(json(new ComposedSchema()
                            .addAnyOfItem(new Schema<>().$ref("#/components/schemas/AuthErrorResponse"))
                            .addAnyOfItem(new ObjectSchema().addProperty("code", new StringSchema())
                            .addProperty("message", new StringSchema())
                            .addProperty("details", new Schema<>().nullable(true)))));
                }
            });
        }
        if (controller.equals("ShopController")) {
            for (String code : List.of("401", "403", "500")) {
                operation.getResponses().get(code).setContent(json(new Schema<>()
                        .$ref("#/components/schemas/AuthErrorResponse")));
            }
            operation.getResponses().get("503").setContent(json(new ComposedSchema()
                    .addAnyOfItem(new Schema<>().$ref("#/components/schemas/AuthErrorResponse"))
                    .addAnyOfItem(new Schema<>().$ref("#/components/schemas/ErrorResponse"))));
            operation.setDescription(operation.getDescription() + " local/dev 프로필에서 등록됩니다(운영 혼합 제외). "
                    + "실제 서비스는 db 및 ontop.shop.enabled=true(dev: SHOP_ENABLED=true), "
                    + "별도 상점 스키마와 회원 지갑이 필요합니다. 기존 V100 적용 이력·순서를 확인한 뒤 "
                    + "Flyway locations에 db/shop을 명시적으로 추가합니다. 기본 비활성·실제 배포는 별도입니다.");
            if (handler.getMethod().getName().equals("purchase")) {
                body(operation, new ObjectSchema().addProperty("itemId", positiveLong())
                        .addProperty("quantity", new IntegerSchema().minimum(BigDecimal.ONE)
                                .maximum(BigDecimal.valueOf(Integer.MAX_VALUE)))
                        .required(List.of("itemId", "quantity")).additionalProperties(false));
                operation.addParametersItem(new Parameter().in("header").name("Idempotency-Key").required(true)
                        .schema(new StringSchema().pattern("[A-Za-z0-9_-]{1,64}").minLength(1).maxLength(64))
                        .description("같은 회원·키·구매 내용은 기존 영수증 반환, 같은 키의 다른 내용은 409"));
            } else if (handler.getMethod().getName().equals("equip")) {
                body(operation, new ObjectSchema().addProperty("userItemId", positiveLong())
                        .required(List.of("userItemId")).additionalProperties(false));
            }
        }
        return operation;
    }

    private Schema<?> positiveLong() {
        return new IntegerSchema().format("int64").minimum(BigDecimal.ONE);
    }

    private void query(Operation operation, String name, boolean required, Schema<?> schema, String description) {
        operation.addParametersItem(new Parameter().in("query").name(name).required(required)
                .schema(schema).description(description));
    }

    private void body(Operation operation, Schema<?> schema) {
        operation.setRequestBody(new RequestBody().required(true).content(json(schema)));
    }

    private Content json(Schema<?> schema) {
        return new Content().addMediaType("application/json",
                new io.swagger.v3.oas.models.media.MediaType().schema(schema));
    }
}
