package com.ssafy.ontop.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import io.swagger.v3.core.util.Yaml;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

abstract class OpenApiHttpTestSupport {

    @LocalServerPort
    int port;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    Environment environment;
    @Autowired
    OnboardingTokenStore onboarding;
    @Autowired
    BuildProperties build;
    private final HttpClient client = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void tokenConfiguration(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 실제_HTTP에서_UI_JSON_YAML을_인증없이_제공한다() throws Exception {
        var ui = get("/swagger-ui/index.html");
        assertThat(ui.statusCode()).isEqualTo(200);
        assertThat(ui.body()).contains("swagger-ui");
        assertThat(get("/swagger-ui/swagger-ui.css").statusCode()).isEqualTo(200);
        assertThat(get("/swagger-ui/swagger-ui-bundle.js").statusCode()).isEqualTo(200);
        assertThat(get("/v3/api-docs").statusCode()).isEqualTo(200);
        assertThat(get("/v3/api-docs.yaml").statusCode()).isEqualTo(200);
        var config = mapper.readTree(get("/v3/api-docs/swagger-config").body());
        assertThat(config.path("url").asText()).isEqualTo("/v3/api-docs");
        assertThat(config.path("withCredentials").asBoolean()).isTrue();
        assertThat(config.path("persistAuthorization").asBoolean()).isFalse();
        assertThat(client.send(HttpRequest.newBuilder(uri("/v3/api-docs"))
                .header("Authorization", "Bearer invalid-documentation-header").GET().build(),
                HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
    }

    @Test
    void 보호_API와_온보딩_권한은_문서_체인으로_공개되지_않는다() throws Exception {
        assertThat(get("/api/v1/users/me").statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/auth/websocket-ticket").statusCode()).isEqualTo(401);
        String token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "synthetic-docs-identity"));
        var response = client.send(HttpRequest.newBuilder(uri("/api/v1/users/me"))
                .header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("AUTH_INVALID_ACCESS_TOKEN");
        assertThat(get("/actuator/health").statusCode()).isEqualTo(200);
    }

    @Test
    void 실제_완료된_매핑만_문서화하고_개발_화면과_WS는_제외한다() throws Exception {
        JsonNode api = json();
        Set<String> expected = new HashSet<>(Set.of(
                "GET /api/v1/auth/{provider}/authorize", "GET /api/v1/auth/{provider}/callback",
                "POST /api/v1/auth/exchange", "POST /api/v1/auth/refresh", "POST /api/v1/auth/logout",
                "POST /api/v1/auth/websocket-ticket", "GET /api/v1/users/me", "PATCH /api/v1/users/me",
                "DELETE /api/v1/users/me", "GET /api/v1/users/nickname-availability",
                "POST /api/v1/users/onboarding", "GET /api/v1/wallets/me",
                "GET /api/v1/wallets/me/transactions"));
        if (environment.acceptsProfiles(Profiles.of("local"))) {
            expected.addAll(Set.of("GET /api/v1/channels", "GET /api/v1/tables", "GET /api/v1/shop/items",
                    "POST /api/v1/shop/purchases", "GET /api/v1/users/me/items", "PATCH /api/v1/users/me/equipment"));
        }
        Set<String> actual = new HashSet<>();
        api.path("paths").fields().forEachRemaining(path -> path.getValue().fieldNames().forEachRemaining(method ->
                actual.add(method.toUpperCase() + " " + path.getKey())));
        assertThat(actual).isEqualTo(expected);
        assertThat(api.path("info").path("title").asText()).isEqualTo("OnTop API");
        assertThat(api.path("info").path("description").asText()).isEqualTo("OnTop REST API Documentation");
        assertThat(api.path("info").path("version").asText()).isEqualTo(build.getVersion());
        assertThat(api.path("servers").get(0).path("url").asText()).isEqualTo("/");
    }

    @Test
    void 본인지갑은_Access전용이며_세잔액과_409및503을_문서화한다() throws Exception {
        JsonNode api = json();
        JsonNode operation = api.at("/paths/~1api~1v1~1wallets~1me/get");
        assertThat(operation.path("tags").toString()).isEqualTo("[\"WALLET\"]");
        assertThat(operation.at("/security/0").has("AccessJwt")).isTrue();
        assertThat(operation.has("requestBody")).isFalse();
        assertThat(operation.path("parameters").size()).isZero();
        assertThat(operation.at("/responses/409/description").asText()).contains("WALLET_NOT_READY");
        assertThat(operation.at("/responses/503/description").asText()).contains("WALLET_UNAVAILABLE");
        JsonNode fields = api.at("/components/schemas/WalletBalanceResponse/properties");
        Set<String> names = new HashSet<>();
        fields.fieldNames().forEachRemaining(names::add);
        assertThat(names).containsExactlyInAnyOrder("balance", "reservedBalance", "availableBalance");
        fields.forEach(field -> assertThat(field.path("format").asText()).isEqualTo("int64"));
        assertThat(fields.at("/availableBalance/description").asText()).contains("balance - reservedBalance");
    }

    @Test
    void 원장_커서와_size및_nullable_참조필드와_오류를_문서화한다() throws Exception {
        JsonNode api = json();
        JsonNode operation = api.at("/paths/~1api~1v1~1wallets~1me~1transactions/get");
        assertThat(operation.at("/security/0").has("AccessJwt")).isTrue();
        assertThat(operation.path("tags").toString()).isEqualTo("[\"WALLET\"]");
        assertThat(operation.has("requestBody")).isFalse();
        assertThat(operation.path("parameters").size()).isEqualTo(2);
        for (JsonNode parameter : operation.path("parameters")) {
            assertThat(parameter.path("in").asText()).isEqualTo("query");
            assertThat(parameter.path("required").asBoolean()).isFalse();
            assertThat(parameter.at("/schema/type").asText()).isEqualTo("integer");
            assertThat(parameter.at("/schema/minimum").asInt()).isEqualTo(1);
            if (parameter.path("name").asText().equals("size")) {
                assertThat(parameter.at("/schema/default").asInt()).isEqualTo(20);
                assertThat(parameter.at("/schema/maximum").asInt()).isEqualTo(100);
            } else {
                assertThat(parameter.path("name").asText()).isEqualTo("cursor");
                assertThat(parameter.at("/schema/format").asText()).isEqualTo("int64");
            }
        }
        Set<String> responses = new HashSet<>();
        operation.path("responses").fieldNames().forEachRemaining(responses::add);
        assertThat(responses).contains("200", "400", "401", "403", "409", "503");
        JsonNode page = api.at("/components/schemas/WalletTransactionPageResponse/properties");
        assertThat(page.path("nextCursor").path("nullable").asBoolean()).isTrue();
        assertThat(page.path("transactions").path("type").asText()).isEqualTo("array");
        JsonNode fields = api.at("/components/schemas/WalletTransactionResponse/properties");
        Set<String> names = new HashSet<>();
        fields.fieldNames().forEachRemaining(names::add);
        assertThat(names).containsExactlyInAnyOrder("transactionId", "transactionType", "balanceDelta",
                "reservedDelta", "itemId", "gameSessionId", "minigameSessionId", "createdAt");
        for (String field : Set.of("itemId", "gameSessionId", "minigameSessionId")) {
            assertThat(fields.path(field).path("nullable").asBoolean()).isTrue();
            assertThat(fields.path(field).path("format").asText()).isEqualTo("int64");
        }
        assertThat(fields.at("/createdAt/format").asText()).isEqualTo("date-time");
    }

    @Test
    void 닉네임_성별_요청_및_실제_응답_필드를_정확히_기술한다() throws Exception {
        JsonNode api = json();
        JsonNode schemas = api.at("/components/schemas");
        JsonNode nickname = schemas.at("/UserNicknameUpdateRequest/properties/nickname");
        assertThat(nickname.path("minLength").asInt()).isEqualTo(2);
        assertThat(nickname.path("maxLength").asInt()).isEqualTo(8);
        assertThat(nickname.path("pattern").asText()).isEqualTo("[가-힣A-Za-z0-9]{2,8}");
        assertThat(schemas.at("/UserNicknameUpdateRequest/additionalProperties").asBoolean(true)).isFalse();
        assertThat(schemas.at("/UserOnboardingRequest/properties/characterGender/enum").toString())
                .isEqualTo("[\"MALE\",\"FEMALE\"]");
        Set<String> profile = new HashSet<>();
        schemas.at("/UserProfileResponse/properties").fieldNames().forEachRemaining(profile::add);
        assertThat(profile).containsExactlyInAnyOrder("userId", "nickname", "characterGender");
        assertThat(api.at("/paths/~1api~1v1~1users~1me/patch/requestBody/content/application~1json/schema/$ref")
                .asText()).isEqualTo("#/components/schemas/UserNicknameUpdateRequest");
        assertThat(api.at("/paths/~1api~1v1~1auth~1exchange/post/requestBody/content/application~1json/schema"
                + "/properties/exchangeCode/pattern").asText()).isEqualTo("[A-Za-z0-9_-]{43}");
        assertThat(schemas.at("/AuthExchangeResponse/oneOf").size()).isEqualTo(2);
        assertThat(api.at("/paths/~1api~1v1~1users~1onboarding/post/responses").has("201")).isTrue();
        assertThat(api.at("/paths/~1api~1v1~1users~1me/delete/responses").has("204")).isTrue();
        assertThat(api.at("/paths/~1api~1v1~1users~1me/delete/responses/204").has("content")).isFalse();
    }

    @Test
    void 인증_수단_오류_스키마와_Origin_계약을_구분한다() throws Exception {
        JsonNode api = json();
        JsonNode security = api.at("/components/securitySchemes");
        assertThat(security.path("AccessJwt").path("scheme").asText()).isEqualTo("bearer");
        assertThat(security.path("OnboardingBearer").path("bearerFormat").asText()).isEqualTo("opaque");
        assertThat(security.path("RefreshCookie").path("in").asText()).isEqualTo("cookie");
        assertThat(security.path("RefreshCookie").path("name").asText()).isEqualTo("ONTOP_REFRESH");
        assertThat(api.at("/paths/~1api~1v1~1users~1nickname-availability/get/security").size()).isEqualTo(2);
        assertThat(api.at("/paths/~1api~1v1~1users~1onboarding/post/security/0").has("OnboardingBearer")).isTrue();
        assertThat(api.at("/paths/~1api~1v1~1users~1me/get/security/0").has("AccessJwt")).isTrue();
        assertThat(api.at("/components/schemas/AuthErrorResponse/properties").size()).isEqualTo(2);
        assertThat(api.at("/paths/~1api~1v1~1users~1me/patch/responses/409/content/application~1json/schema/$ref")
                .asText()).isEqualTo("#/components/schemas/AuthErrorResponse");
        var origin = api.at("/paths/~1api~1v1~1auth~1refresh/post/parameters").findValues("name");
        assertThat(origin).anyMatch(value -> value.asText().equals("Origin"));
        assertThat(api.at("/paths/~1api~1v1~1auth~1refresh/post").has("requestBody")).isFalse();
        assertThat(api.at("/paths/~1api~1v1~1auth~1websocket-ticket/post/responses").has("429")).isTrue();
    }

    @Test
    void YAML_JSON_일치와_참조_유효성_및_민감정보_미포함을_확인한다() throws Exception {
        JsonNode api = json();
        JsonNode yaml = Yaml.mapper().readTree(get("/v3/api-docs.yaml").body());
        assertThat(yaml).isEqualTo(api);
        ParseOptions options = new ParseOptions();
        options.setResolve(false);
        var parsed = new OpenAPIV3Parser().readContents(yaml.toString(), null, options);
        assertThat(parsed.getOpenAPI()).isNotNull();
        assertThat(parsed.getMessages()).isEmpty();
        assertThat(api.path("openapi").asText()).startsWith("3.0.");
        references(api, api);
        String document = api.toString();
        assertThat(document).doesNotContain("providerUserId", "provider_user_id", "jwt-secret-base64",
                "DB_PASSWORD", "synthetic-docs-identity", "eyJhbGci");
        assertThat(api.findValues("properties")).noneMatch(properties -> properties.has("client_secret")
                || properties.has("clientSecret") || properties.has("password") || properties.has("refreshToken"));
        api.path("paths").elements().forEachRemaining(path -> path.elements().forEachRemaining(operation -> {
            assertThat(operation.path("summary").asText()).isNotBlank();
            assertThat(operation.path("responses").size()).isGreaterThan(0);
            assertThat(operation.has("requestId")).isFalse();
        }));
    }

    void references(JsonNode current, JsonNode root) {
        if (current.isObject() && current.has("$ref")) {
            String ref = current.path("$ref").asText();
            assertThat(ref).startsWith("#/");
            assertThat(root.at(ref.substring(1)).isMissingNode()).isFalse();
        }
        current.elements().forEachRemaining(child -> references(child, root));
    }

    JsonNode json() throws Exception {
        var response = get("/v3/api-docs");
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body());
    }

    HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
