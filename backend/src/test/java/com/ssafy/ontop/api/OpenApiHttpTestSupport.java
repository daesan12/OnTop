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
import java.util.List;
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
                "POST /api/v1/users/onboarding", "GET /api/v1/admin/me", "GET /api/v1/admin/analytics/summary",
                "POST /api/v1/admin/wallet-grants/preview", "POST /api/v1/admin/wallet-grants",
                "GET /api/v1/operations/status", "GET /api/v1/admin/operations/status",
                "PUT /api/v1/admin/operations/status",
                "GET /api/v1/notifications", "GET /api/v1/notifications/{notificationId}",
                "PATCH /api/v1/notifications/{notificationId}/read",
                "POST /api/v1/notifications/{notificationId}/claim", "POST /api/v1/admin/wallet-grants/rewards",
                "GET /api/v1/admin/wallet-grants/rewards", "GET /api/v1/admin/wallet-grants/rewards/recipients",
                "POST /api/v1/admin/operations/feedback/{receiptId}/replies",
                "PATCH /api/v1/admin/operations/feedback/{receiptId}/status",
                "GET /api/v1/announcements", "GET /api/v1/admin/operations/announcements",
                "POST /api/v1/admin/operations/announcements/{id}", "PUT /api/v1/admin/operations/announcements/{id}",
                "DELETE /api/v1/admin/operations/announcements/{id}", "PUT /api/v1/admin/operations/announcements/order",
                "GET /api/v1/wallets/me",
                "GET /api/v1/wallets/me/transactions", "GET /api/v1/rankings",
                "GET /api/v1/rankings/park",
                "GET /api/v1/raffles/current", "POST /api/v1/raffles/current/tickets",
                "GET /api/v1/raffles/rounds/{weekStart}/result",
                "GET /api/v1/admin/raffles/rounds/{weekStart}",
                "GET /api/v1/admin/raffles/rounds/{weekStart}/draws/current",
                "POST /api/v1/admin/raffles/rounds/{weekStart}/draws",
                "POST /api/v1/admin/raffles/rounds/{weekStart}/draws/reroll",
                "POST /api/v1/admin/raffles/rounds/{weekStart}/finalize",
                "GET /api/v1/events/minigames/{type}/rounds/{weekStart}/result",
                "GET /api/v1/admin/events/minigames/{type}/rounds/{weekStart}",
                "POST /api/v1/admin/events/minigames/{type}/rounds/{weekStart}/finalize",
                "GET /api/v1/admin/events/minigames/rounds/{weekStart}/games",
                "GET /api/v1/admin/events/minigames/supported-games",
                "PUT /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}",
                "GET /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/ranking",
                "POST /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/finalize",
                "GET /api/v1/events/minigames/rounds/{weekStart}/games/{gameCode}/result",
                "GET /api/v1/events/assets/rounds/{weekStart}/result",
                "GET /api/v1/admin/events/assets/rounds/{weekStart}",
                "POST /api/v1/admin/events/assets/rounds/{weekStart}/finalize",
                "GET /api/v1/events/winnings/me",
                "PUT /api/v1/events/winnings/weeks/{weekStart}/contact",
                "GET /api/v1/admin/events/winners",
                "GET /api/v1/admin/events/winners/{winnerId}/contact",
                "PUT /api/v1/admin/events/winners/{winnerId}/delivery",
                "GET /api/v1/minigames/bungeoppang/rankings",
                "GET /api/v1/users/me/games", "GET /api/v1/users/me/game-stats",
                "POST /api/v1/behavior-events"));
        if (environment.acceptsProfiles(Profiles.of("(local | dev) & !prod & !production"))) {
            expected.addAll(Set.of("GET /api/v1/channels", "GET /api/v1/tables"));
            assertThat(api.at("/components/schemas/TableSummaryResponse/properties/gameId/nullable").asBoolean())
                    .isTrue();
        }
        if (environment.acceptsProfiles(Profiles.of("(local | dev) & !prod & !production"))) {
            expected.addAll(Set.of("GET /api/v1/shop/items",
                    "POST /api/v1/shop/purchases", "GET /api/v1/users/me/items", "PATCH /api/v1/users/me/equipment"));
        }
        if (environment.acceptsProfiles(Profiles.of("(local | dev) & !prod & !production"))) {
            expected.addAll(Set.of("POST /api/v1/minigames/sessions", "GET /api/v1/minigames/sessions",
                    "POST /api/v1/minigames/skewer/admissions", "GET /api/v1/world/fitness/rewards/status",
                    "GET /api/v1/minigames/rps-roulette/status", "POST /api/v1/minigames/rps-roulette/rounds",
                    "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/hands",
                    "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/challenge",
                    "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/stop",
                    "GET /api/v1/minigames/plus-minus/status", "POST /api/v1/minigames/plus-minus/rounds",
                    "GET /api/v1/minigames/whack-a-mole/status", "POST /api/v1/minigames/whack-a-mole/rounds",
                    "POST /api/v1/minigames/whack-a-mole/rounds/{roundId}/complete",
                    "POST /api/v1/minigames/speed-mole/rounds", "POST /api/v1/minigames/speed-mole/rounds/{roundId}/complete",
                    "GET /api/v1/minigames/speed-mole/rankings",
                    "GET /api/v1/minigames/sessions/{sessionId}",
                    "POST /api/v1/minigames/sessions/{sessionId}/manual-pause",
                    "POST /api/v1/minigames/sessions/{sessionId}/deliveries",
                    "POST /api/v1/minigames/sessions/{sessionId}/complete",
                    "POST /api/v1/minigames/sessions/{sessionId}/abandon",
                    "GET /api/v1/minigames/jumpmap/status", "GET /api/v1/minigames/jumpmap/rankings", "POST /api/v1/minigames/jumpmap/tips"));
            if (environment.getProperty("ontop.notes.enabled", Boolean.class, false)) {
                expected.addAll(Set.of("GET /api/v1/notes", "POST /api/v1/notes"));
            }
            if (environment.getProperty("ontop.feedback.enabled", Boolean.class, false)) {
                expected.addAll(Set.of("POST /api/v1/feedback", "GET /api/v1/admin/feedback"));
            }
        }
        Set<String> actual = new HashSet<>();
        if (environment.acceptsProfiles(Profiles.of(com.ssafy.ontop.config.RuntimeProfiles.PRODUCT_FEATURE))) {
            expected.addAll(Set.of("GET /api/v1/skins/assets", "GET /api/v1/admin/operations/skins/settings",
                    "GET /api/v1/admin/operations/skins", "POST /api/v1/admin/operations/skins",
                    "GET /api/v1/admin/operations/skins/{id}", "PUT /api/v1/admin/operations/skins/{id}",
                    "POST /api/v1/admin/operations/skins/{id}/uploads",
                    "POST /api/v1/admin/operations/skins/{id}/uploads/{uploadId}/verify",
                    "POST /api/v1/admin/operations/skins/{id}/publish", "POST /api/v1/admin/operations/skins/{id}/disable"));
            expected.addAll(Set.of("GET /api/v1/admin/operations/skins/components", "POST /api/v1/admin/operations/skins/components",
                    "GET /api/v1/admin/operations/skins/sets", "POST /api/v1/admin/operations/skins/sets",
                    "PUT /api/v1/admin/operations/skins/sets/{id}", "POST /api/v1/admin/operations/skins/sets/{id}/publish",
                    "POST /api/v1/admin/operations/skins/sets/{id}/disable"));
            expected.addAll(Set.of("GET /api/v1/gacha", "GET /api/v1/gacha/operations/{operationId}",
                    "POST /api/v1/gacha/tickets", "POST /api/v1/gacha/draws", "POST /api/v1/gacha/boxes/open"));
        }
        api.path("paths").fields().forEachRemaining(path -> path.getValue().fieldNames().forEachRemaining(method ->
                actual.add(method.toUpperCase() + " " + path.getKey())));
        assertThat(actual).isEqualTo(expected);
        assertThat(api.at("/components/schemas/RankingMyRank/nullable").asBoolean()).isTrue();
        assertThat(api.at("/components/schemas/RankingResponse/properties/myRank/$ref").asText())
                .isEqualTo("#/components/schemas/RankingMyRank");
        assertThat(api.path("info").path("title").asText()).isEqualTo("OnTop API");
        assertThat(api.path("info").path("description").asText()).isEqualTo("OnTop REST API Documentation");
        assertThat(api.path("info").path("version").asText()).isEqualTo(build.getVersion());
        assertThat(api.path("servers").get(0).path("url").asText()).isEqualTo("/");
    }

    @Test
    void 관리자_일괄_지급은_Access전용이며_미리보기와_멱등_실행을_문서화한다() throws Exception {
        JsonNode api = json();
        JsonNode preview = api.at("/paths/~1api~1v1~1admin~1wallet-grants~1preview/post");
        JsonNode execute = api.at("/paths/~1api~1v1~1admin~1wallet-grants/post");

        assertThat(preview.at("/security/0").has("AccessJwt")).isTrue();
        assertThat(execute.at("/security/0").has("AccessJwt")).isTrue();
        assertThat(preview.path("tags").toString()).isEqualTo("[\"ADMIN\"]");
        assertThat(execute.path("tags").toString()).isEqualTo("[\"ADMIN\"]");
        assertThat(preview.at("/responses/200/content/application~1json/schema/$ref").asText())
                .isEqualTo("#/components/schemas/AdminWalletGrantPreviewResponse");
        assertThat(execute.at("/responses/200/content/application~1json/schema/$ref").asText())
                .isEqualTo("#/components/schemas/AdminWalletGrantExecuteResponse");
        assertThat(execute.path("responses").has("409")).isTrue();
        assertThat(execute.path("responses").has("503")).isTrue();
        JsonNode request = api.at("/components/schemas/AdminWalletGrantExecuteRequest/properties");
        assertThat(request.has("requestId")).isTrue();
        assertThat(request.has("expectedRecipientCount")).isTrue();
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
        assertThat(nickname.path("pattern").asText()).isEqualTo("^(?![Gg][Mm])[가-힣A-Za-z0-9]{2,8}$");
        assertThat(schemas.at("/UserNicknameUpdateRequest/additionalProperties").asBoolean(true)).isFalse();
        assertThat(schemas.at("/UserOnboardingRequest/properties/characterGender/enum").toString())
                .isEqualTo("[\"MALE\",\"FEMALE\"]");
        Set<String> profile = new HashSet<>();
        schemas.at("/UserProfileResponse/properties").fieldNames().forEachRemaining(profile::add);
        assertThat(profile).containsExactlyInAnyOrder("userId", "nickname", "characterGender");
        assertThat(api.at("/paths/~1api~1v1~1users~1me/patch/requestBody/content/application~1json/schema/$ref")
                .asText()).isEqualTo("#/components/schemas/UserNicknameUpdateRequest");
        assertThat(api.at("/paths/~1api~1v1~1auth~1exchange/post/requestBody/content/application~1json/schema"
                + "/properties/exchangeCode/pattern").asText()).isEqualTo("^[A-Za-z0-9_-]{43}$");
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

    @Test
    void 도메인_오류와_누락된_성공응답을_실제_DTO로_구분한다() throws Exception {
        var api = json();
        for (String controllerPath : Set.of("/api/v1/notes", "/api/v1/admin/feedback")) {
            if (!api.path("paths").has(controllerPath)) { continue; }
            var success = api.path("paths").path(controllerPath).path("get").path("responses").path("200");
            assertThat(success.at("/content/application~1json/schema/$ref").asText()).endsWith(
                    controllerPath.endsWith("notes") ? "/NoteListResponse" : "/FeedbackListResponse");
        }
        if (api.path("paths").has("/api/v1/feedback")) {
            for (String code : Set.of("400", "409", "429")) {
                assertThat(api.path("paths").path("/api/v1/feedback").path("post")
                        .path("responses").path(code).at("/content/application~1json/schema/$ref").asText())
                        .isEqualTo("#/components/schemas/FeedbackErrorResponse");
            }
            assertThat(api.at("/components/schemas/FeedbackErrorResponse/properties").size()).isEqualTo(3);
        }
        assertThat(api.at("/components/schemas").has("ErrorResponse")).isFalse();
        assertThat(api.at("/components/schemas/ShopErrorResponse/properties").size()).isEqualTo(3);
        assertThat(api.at("/components/schemas/MinigameErrorResponse/properties").size()).isEqualTo(5);
        api.path("paths").forEach(path -> path.forEach(operation -> {
            Set<String> statuses = new HashSet<>();
            operation.path("responses").fieldNames().forEachRemaining(statuses::add);
            assertThat(statuses).anyMatch(status -> status.startsWith("2") || status.equals("302"));
        }));
    }

    @Test
    void nullable도_필드가_존재하며_응답_required와_null허용을_분리한다() throws Exception {
        var schemas = json().at("/components/schemas");
        for (String field : Set.of("TableSummaryResponse.gameCode", "TableSummaryResponse.targetScore",
                "ItemResponse.equipSlot", "MinigameStatusResponse.score", "MinigameStatusResponse.endedAt",
                "FeedbackListResponse.nextCursor", "NotesErrorResponse.nextAllowedAt",
                "FeedbackErrorResponse.nextAllowedAt", "MinigameErrorResponse.index")) {
            var parts = field.split("\\.");
            if (!schemas.has(parts[0])) { continue; }
            var schema = schemas.path(parts[0]);
            assertThat(schema.path("properties").path(parts[1]).path("nullable").asBoolean()).isTrue();
            assertThat(schema.path("required")).anyMatch(value -> value.asText().equals(parts[1]));
        }
        for (String name : Set.of("ItemResponse", "MinigameStatusResponse", "TableSummaryResponse",
                "NoteListResponse", "FeedbackListResponse", "RankingResponse", "Ticket")) {
            var schema = schemas.path(name);
            if (!schema.isMissingNode()) {
                assertThat(schema.path("required").size()).isEqualTo(schema.path("properties").size());
            }
        }
    }

    @Test
    void 미니게임_행사_type은_문자열_열거형이고_세션_ID는_숫자_패턴이다() throws Exception {
        var paths = json().path("paths");
        for (String path : List.of(
                "/api/v1/events/minigames/{type}/rounds/{weekStart}/result",
                "/api/v1/admin/events/minigames/{type}/rounds/{weekStart}",
                "/api/v1/admin/events/minigames/{type}/rounds/{weekStart}/finalize")) {
            var operation = paths.path(path).path(path.endsWith("/finalize") ? "post" : "get");
            assertThat(operation.isMissingNode()).isFalse();
            var schema = pathParameter(operation, "type").path("schema");
            assertThat(schema.path("type").asText()).isEqualTo("string");
            assertThat(schema.path("enum").toString()).isEqualTo("[\"bungeoppang\",\"jumpmap\"]");
            assertThat(schema.has("pattern")).isFalse();
        }
        var complete = paths.path("/api/v1/minigames/sessions/{sessionId}/complete").path("post");
        assertThat(pathParameter(complete, "sessionId").path("schema").path("pattern").asText())
                .isEqualTo("^[1-9][0-9]{0,18}$");
    }

    @Test
    void 엽전_행사_당첨자_문서는_미니게임_상품_스키마와_구분한다() throws Exception {
        var schemas = json().at("/components/schemas");
        assertThat(schemas.at("/AssetAwardResponse/properties/winners/items/$ref").asText())
                .isEqualTo("#/components/schemas/AssetWinner");
        assertThat(schemas.at("/AssetMemberAwardResponse/properties/prize/$ref").asText())
                .isEqualTo("#/components/schemas/AssetPrize");
        assertThat(schemas.at("/AssetWinner/properties/place/type").asText()).isEqualTo("integer");
        assertThat(schemas.at("/AssetPrize/properties/coinBalance/type").asText())
                .isEqualTo("integer");
    }

    private JsonNode pathParameter(JsonNode operation, String name) {
        for (JsonNode parameter : operation.path("parameters")) {
            if (parameter.path("name").asText().equals(name)) {
                return parameter;
            }
        }
        throw new AssertionError("OpenAPI path parameter is missing: " + name);
    }

    @Test
    void 엄격한_요청과_UTF16_정규화_및_전체일치_패턴을_문서화한다() throws Exception {
        var api = json();
        for (String domain : Set.of("feedback", "notes")) {
            var operation = api.path("paths").path("/api/v1/" + domain).path("post");
            if (operation.isMissingNode()) { continue; }
            var body = operation.at("/requestBody/content/application~1json/schema");
            assertThat(body.path("additionalProperties").asBoolean(true)).isFalse();
            assertThat(body.path("required").size()).isEqualTo(3);
            assertThat(body.at("/properties/text/x-utf16-max-length").asInt()).isEqualTo(domain.equals("notes") ? 300 : 600);
            assertThat(body.at("/properties/text/x-normalized-utf16-min-length").asInt()).isEqualTo(domain.equals("notes") ? 1 : 5);
            assertThat(body.at("/properties/text").has("minLength")).isFalse();
            assertThat(body.at("/properties/operationId/pattern").asText()).startsWith("^").endsWith("$");
        }
        var nickname = api.at("/components/schemas/UserNicknameUpdateRequest/properties/nickname/pattern").asText();
        assertThat(java.util.regex.Pattern.compile(nickname).matcher("미지!").find()).isFalse();
        for (String path : Set.of("/api/v1/shop/purchases", "/api/v1/minigames/sessions",
                "/api/v1/minigames/skewer/admissions", "/api/v1/minigames/rps-roulette/rounds",
                "/api/v1/minigames/plus-minus/rounds", "/api/v1/minigames/whack-a-mole/rounds")) {
            api.path("paths").path(path).path("post").path("parameters").forEach(parameter -> {
                if (parameter.path("name").asText().equals("Idempotency-Key")) {
                    assertThat(parameter.at("/schema/pattern").asText()).isEqualTo("^[A-Za-z0-9_-]{1,64}$");
                }
            });
        }
        assertThat(api.at("/paths/~1api~1v1~1minigames~1sessions~1{sessionId}~1complete/post/requestBody"
                + "/content/application~1json/schema/properties/seenTips/items").has("type")).isFalse();
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
    @Test
    void 공지_응답과_카드순서_계약을_구분해_문서화한다() throws Exception {
        var api = json();
        for (String field : Set.of("PublicAnnouncement/endsAt", "AnnouncementResponse/startsAt", "AnnouncementResponse/endsAt", "AnnouncementRequest/startsAt", "AnnouncementRequest/endsAt")) {
            var parts = field.split("/");
            assertThat(api.at("/components/schemas/" + parts[0] + "/properties/" + parts[1] + "/nullable").asBoolean()).isTrue();
        }
        assertThat(api.at("/paths/~1api~1v1~1announcements/get/responses/200/content/application~1json/schema/$ref").asText())
                .isEqualTo("#/components/schemas/PublicAnnouncementsResponse");
        assertThat(api.at("/paths/~1api~1v1~1admin~1operations~1announcements~1{id}/put/parameters/0/schema/format").asText()).isEqualTo("uuid");
        assertThat(api.at("/paths/~1api~1v1~1admin~1operations~1announcements~1order/put/security/0").has("AccessJwt")).isTrue();
        assertThat(api.at("/paths/~1api~1v1~1admin~1operations~1announcements~1order/put/responses").has("204")).isTrue();
        assertThat(api.at("/components/schemas/AnnouncementOrderRequest/properties/items/items/$ref").asText())
                .isEqualTo("#/components/schemas/AnnouncementOrderItem");
        assertThat(api.at("/components/schemas/PublicAnnouncementsResponse/properties/announcements/items/$ref").asText())
                .isEqualTo("#/components/schemas/PublicAnnouncement");
    }
}
