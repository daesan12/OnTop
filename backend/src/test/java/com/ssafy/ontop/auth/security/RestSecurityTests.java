package com.ssafy.ontop.auth.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.profiles.active=local", "ontop.oauth.ssafy.client-id=fixture-ssafy",
        "ontop.oauth.naver.client-id=fixture-naver"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(RestSecurityTests.ProbeConfiguration.class)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class RestSecurityTests {
    private static final byte[] KEY = randomKey();
    private static final String ISSUER = "ontop-rest-test";
    @Autowired
    private MockMvc mvc;
    @Autowired
    private AccessJwtService jwt;
    @MockitoBean
    private ActiveMemberLookup members;
    @Autowired
    private RequestMappingHandlerMapping requestMappingHandlerMapping;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(KEY));
        registry.add("ontop.auth.jwt-issuer", () -> ISSUER);
    }

    @BeforeEach
    void activeFixture() {
        when(members.findActive(anyLong(), anyString())).thenAnswer(call -> Optional.of(
                new AuthenticatedUser(call.getArgument(0), LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void 실제_광장과_테이블_REST는_유효한_Access와_활성회원으로_접근한다() throws Exception {
        mvc.perform(auth(get("/api/v1/channels"))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
        mvc.perform(auth(get("/api/v1/tables"))).andExpect(status().isOk()).andExpect(jsonPath("$.tables").isArray());
        var result = mvc.perform(auth(get("/api/v1/security-test/principal"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(42)).andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.name").value("42")).andExpect(jsonPath("$.credentialsAbsent").value(true))
                .andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/channels", "/api/v1/tables", "/api/v1/future-resource", "/actuator/metrics",
            "/dev/not-registered"})
    void 명시적_공개목록_외에는_기본적으로_인증이_필요하다(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_AUTHENTICATION_REQUIRED"))
                .andExpect(jsonPath("$.message").isString()).andExpect(jsonPath("$.details").doesNotExist())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("WWW-Authenticate", "Bearer"));
        verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Basic credentials", "Bearer", "Bearer ", "Bearer fake", "Bearer a.b.c",
            "Bearer ob_forged", "Bearer rt_forged", "Bearer one,two", "Bearer  two spaces", "Digest x"})
    void 잘못된_Authorization은_안전한_401이며_회원조회를_하지_않는다(String value) throws Exception {
        mvc.perform(get("/api/v1/tables").header("Authorization", value)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_INVALID_ACCESS_TOKEN"));
        verifyNoInteractions(members);
    }

    @Test
    void 중복_Authorization은_정상_JWT가_있어도_거절한다() throws Exception {
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID), "Bearer other"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_INVALID_ACCESS_TOKEN"));
        verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "signature", "algorithm", "type", "purpose", "issuer", "audience",
            "critical", "future", "longLifetime", "subject"})
    void 기존_JWT의_서명과_모든_클레임_방어를_유지한다(String defect) throws Exception {
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + altered(defect)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_INVALID_ACCESS_TOKEN"));
        verifyNoInteractions(members);
    }

    @Test
    void 존재하지_않거나_탈퇴한_회원은_서명상_유효해도_거절한다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        mvc.perform(auth(get("/api/v1/tables"))).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
    }

    @Test
    void DB_장애는_내부_예외나_사용자_식별자_없이_503이다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenThrow(new DataAccessResourceFailureException("sensitive-fixture-detail"));
        String response = mvc.perform(auth(get("/api/v1/tables"))).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_LOOKUP_UNAVAILABLE"))
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("sensitive-fixture-detail", "42", "SELECT", "Exception");
    }

    @Test
    void 세션과_쿠키와_쿼리는_REST_인증을_대신하지_못하고_요청간_누출되지_않는다() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(
                UsernamePasswordAuthenticationToken.authenticated(new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID),
                        null, List.of(new SimpleGrantedAuthority("ROLE_MEMBER")))));
        mvc.perform(auth(get("/api/v1/tables").session(session))).andExpect(status().isOk())
                .andExpect(header().doesNotExist("Set-Cookie"));
        mvc.perform(get("/api/v1/tables").session(session).param("access_token", jwt.issue(42, TestLoginSessions.ID))
                        .cookie(new jakarta.servlet.http.Cookie("ONTOP_REFRESH", "rt_not-access")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/tables")).andExpect(status().isUnauthorized());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void 인증된_회원도_관리_경로는_403이고_오류는_JSON이다() throws Exception {
        mvc.perform(auth(get("/actuator/metrics"))).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AUTH_ACCESS_DENIED"))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health", "/dev/tables", "/dev/world-config"})
    void 공개_기존_GET는_임의_Authorization을_Access로_해석하지_않는다(String path) throws Exception {
        // 개인 HTML은 Git 제외 파일이다. 유무에 따른 200/404와 무관하게 회원 인증을 호출하면 안 된다.
        int expectedStatus = path.equals("/dev/tables") && !new ClassPathResource("dev/tables.html").exists()
                ? 404 : 200;
        mvc.perform(get(path).header("Authorization", "Basic malformed-public-header"))
                .andExpect(status().is(expectedStatus));
        verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ssafy", "naver"})
    void 인가요청은_공개이며_기존_OAuth_세션을_생성할_수_있다(String provider) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/" + provider + "/authorize")
                        .header("Authorization", "Bearer ob_not-an-access-jwt"))
                .andExpect(status().isFound()).andReturn();
        assertThat(result.getRequest().getSession(false)).isNotNull();
        verifyNoInteractions(members);
    }

    @Test
    void 공개_POST는_Security_CSRF가_아닌_기존_Origin과_자체인증으로_검증한다() throws Exception {
        for (String path : List.of("/api/v1/auth/exchange", "/api/v1/auth/refresh", "/api/v1/auth/logout",
                "/api/v1/users/onboarding")) {
            mvc.perform(post(path).header("Origin", "https://untrusted.invalid")
                            .header("Authorization", "Bearer ob_not-access"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_ORIGIN_NOT_ALLOWED"));
        }
        mvc.perform(post("/api/v1/auth/logout").header("Origin", "http://localhost:8080")
                        .header("Authorization", "not-bearer"))
                .andExpect(status().isNoContent());
        verifyNoInteractions(members);
    }

    @Test
    void 보호_REST_preflight는_허용_출처만_통과하며_토큰과_쿠키가_필요없다() throws Exception {
        mvc.perform(options("/api/v1/tables").header("Origin", "http://localhost:8080")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8080"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        mvc.perform(options("/api/v1/tables").header("Origin", "https://untrusted.invalid")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_ORIGIN_NOT_ALLOWED"));
        mvc.perform(options("/api/v1/tables").header("Origin", "http://localhost:8080")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "X-Unapproved"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_ORIGIN_NOT_ALLOWED"));
        verifyNoInteractions(members);
    }

    @Test
    void 보호_REST의_출처와_보안헤더를_유지한다() throws Exception {
        mvc.perform(auth(get("/api/v1/tables").header("Origin", "http://localhost:8080")))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8080"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
        mvc.perform(auth(get("/api/v1/tables").header("Origin", "null")))
                .andExpect(status().isForbidden());
    }

    @Test
    void 실제_운영_Controller_매핑_목록이_접근정책_문서와_일치한다() {
        var mappings = requestMappingHandlerMapping.getHandlerMethods().entrySet().stream()
                .filter(entry -> entry.getValue().getBeanType().getPackageName().startsWith("com.ssafy.ontop."))
                .filter(entry -> !entry.getValue().getBeanType().isAnnotationPresent(TestComponent.class))
                .flatMap(entry -> entry.getKey().getPatternValues().stream().flatMap(path ->
                        entry.getKey().getMethodsCondition().getMethods().stream().map(method -> method + " " + path)))
                .toList();
        assertThat(mappings).containsExactlyInAnyOrder("GET /api/v1/auth/{provider}/authorize",
                "GET /api/v1/auth/{provider}/callback", "POST /api/v1/auth/exchange", "POST /api/v1/auth/refresh",
                "POST /api/v1/auth/logout", "POST /api/v1/users/onboarding", "GET /api/v1/users/me",
                "GET /api/v1/users/nickname-availability",
                "PATCH /api/v1/users/me",
                "DELETE /api/v1/users/me",
                "GET /api/v1/wallets/me", "GET /api/v1/wallets/me/transactions",
                "GET /api/v1/rankings",
                "GET /api/v1/channels",
                "GET /api/v1/tables", "GET /dev/tables", "GET /dev/world-config",
                "GET /api/v1/shop/items", "POST /api/v1/shop/purchases",
                "GET /api/v1/users/me/items", "PATCH /api/v1/users/me/equipment",
                "POST /api/v1/minigames/sessions", "GET /api/v1/minigames/sessions",
                "GET /api/v1/minigames/sessions/{sessionId}",
                "POST /api/v1/minigames/sessions/{sessionId}/deliveries",
                "POST /api/v1/minigames/sessions/{sessionId}/complete",
                "POST /api/v1/minigames/sessions/{sessionId}/abandon");
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request) {
        return request.header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID));
    }

    private String altered(String defect) throws Exception {
        Instant now = Instant.now().minusSeconds(2);
        JWSAlgorithm algorithm = defect.equals("algorithm") ? JWSAlgorithm.HS512 : JWSAlgorithm.HS256;
        JWSHeader.Builder header = new JWSHeader.Builder(algorithm)
                .type(new JOSEObjectType(defect.equals("type") ? "JWT" : "at+jwt"));
        if (defect.equals("critical")) {
            header.criticalParams(Set.of("x-test")).customParam("x-test", true);
        }
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(defect.equals("issuer") ? "wrong" : ISSUER)
                .audience(defect.equals("audience") ? "wrong" : "ontop-api")
                .subject(defect.equals("subject") ? "not-internal-id" : "42")
                .issueTime(Date.from(defect.equals("future") ? now.plusSeconds(600) : now))
                .notBeforeTime(Date.from(now)).expirationTime(Date.from(defect.equals("expired") ? now.minusSeconds(1)
                        : now.plusSeconds(defect.equals("longLifetime") ? 1801 : 1800)))
                .jwtID(UUID.randomUUID().toString()).claim("token_use", defect.equals("purpose") ? "onboarding" : "access")
                .claim("sid", TestLoginSessions.ID)
                .build();
        SignedJWT token = new SignedJWT(header.build(), claims);
        byte[] key = defect.equals("signature") || defect.equals("algorithm") ? new byte[64] : KEY;
        token.sign(new MACSigner(key));
        return token.serialize();
    }

    private static byte[] randomKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return key;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeConfiguration {
        @Bean PrincipalProbe principalProbe() { return new PrincipalProbe(); }
    }

    @TestComponent
    @RestController
    static class PrincipalProbe {
        @GetMapping("/api/v1/security-test/principal")
        Map<String, Object> principal(@AuthenticationPrincipal AuthenticatedUser user, Authentication authentication) {
            return Map.of("userId", user.userId(), "name", authentication.getName(),
                    "authenticated", authentication.isAuthenticated(), "credentialsAbsent", authentication.getCredentials() == null);
        }
    }
}
