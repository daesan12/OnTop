package com.ssafy.ontop.auth.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ssafy.ontop.admin.analytics.AnalyticsSnapshot;
import com.ssafy.ontop.admin.analytics.AnalyticsSnapshotStore;
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
import org.springframework.web.bind.annotation.PostMapping;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.profiles.active=local", "ontop.oauth.ssafy.client-id=fixture-ssafy",
        "ontop.oauth.naver.client-id=fixture-naver", "ontop.admin.read-ids=42,43", "ontop.admin.grant-ids=43",
        "ontop.admin.contact-ids=43"})
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
    @MockitoBean
    private AnalyticsSnapshotStore analyticsSnapshots;
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

    @ParameterizedTest
    @ValueSource(strings={"/api/v1/ai/features","/api/v1/ai/companions/status","/api/v1/ai/joke-contest/me",
            "/api/v1/ai/joke-contest/submissions/private-id","/api/v1/ai/joke-contest/rankings",
            "/api/v1/ai/joke-contest/hall","/api/v1/ai/joke-contest/yesterday","/api/v1/ai/joke-contest/reveal/private-id"})
    void AI_조회도_인증_없이_접근할_수_없다(String path)throws Exception{
        mvc.perform(get(path)).andExpect(status().isUnauthorized());verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(strings={"/api/v1/ai/companions/invite","/api/v1/ai/companions/action",
            "/api/v1/ai/companions/talk","/api/v1/ai/joke-contest/submissions"})
    void AI_동작은_본문을_처리하기_전에_인증을_확인한다(String path)throws Exception{
        mvc.perform(post(path).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());verifyNoInteractions(members);
    }

    @Test
    void AI_비활성은_인증을_우회하지_않고_회원에게_기능_상태를_알린다()throws Exception{
        mvc.perform(auth(get("/api/v1/ai/features"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.companions").value(false)).andExpect(jsonPath("$.jokeContest").value(false))
                .andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(auth(get("/api/v1/ai/joke-contest/me"))).andExpect(status().isServiceUnavailable());
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

    @Test
    void 관리자_권한은_서버_회원_ID에서_결정하며_조회와_지급을_분리한다() throws Exception {
        mvc.perform(get("/api/v1/admin/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_AUTHENTICATION_REQUIRED"));
        mvc.perform(authAs(44, get("/api/v1/admin/me"))).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AUTH_ACCESS_DENIED"));

        mvc.perform(auth(get("/api/v1/admin/me"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.canRead").value(true))
                .andExpect(jsonPath("$.canGrant").value(false))
                .andExpect(jsonPath("$.canOperate").value(false))
                .andExpect(jsonPath("$.canViewContacts").value(false))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(auth(post("/api/v1/admin/wallet-grants/probe"))).andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/v1/admin/operations/status"))).andExpect(status().isForbidden());

        mvc.perform(authAs(43, get("/api/v1/admin/me"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.canRead").value(true))
                .andExpect(jsonPath("$.canGrant").value(true))
                .andExpect(jsonPath("$.canOperate").value(true))
                .andExpect(jsonPath("$.canViewContacts").value(true));
        mvc.perform(authAs(43, post("/api/v1/admin/wallet-grants/probe")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.allowed").value(true));
        mvc.perform(authAs(43, get("/api/v1/admin/operations/status"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("NORMAL"));
        mvc.perform(get("/api/v1/operations/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("NORMAL"));
        mvc.perform(authAs(44, get("/api/v1/channels"))).andExpect(status().isOk());
    }

    @Test
    void 응모권_추첨은_관리자_조회와_운영_권한을_구분한다() throws Exception {
        String adminPath = "/api/v1/admin/raffles/rounds/2026-11-02";
        mvc.perform(get(adminPath)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(adminPath))).andExpect(status().isForbidden());
        mvc.perform(auth(get(adminPath))).andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(adminPath + "/finalize"))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, post(adminPath + "/finalize")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"drawId\":1}")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(auth(get(adminPath + "/draws/current")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(adminPath + "/draws")))
                .andExpect(status().isForbidden());
        mvc.perform(authAs(43, post(adminPath + "/draws")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(adminPath + "/draws/reroll")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/raffles/rounds/2026-11-02/result"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 미니게임_행사_결과도_관리자_조회와_운영_권한을_분리한다() throws Exception {
        String adminPath = "/api/v1/admin/events/minigames/BUNGEOPPANG/rounds/2026-11-02";
        mvc.perform(get(adminPath)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(adminPath))).andExpect(status().isForbidden());
        mvc.perform(auth(get(adminPath))).andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(adminPath + "/finalize"))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, post(adminPath + "/finalize")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/v1/events/minigames/JUMPMAP/rounds/2026-11-02/result"))
                .andExpect(status().isUnauthorized());

        String weeklyPath = "/api/v1/admin/events/minigames/rounds/2026-11-09/games";
        mvc.perform(get(weeklyPath)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(weeklyPath))).andExpect(status().isForbidden());
        mvc.perform(auth(get(weeklyPath))).andExpect(status().isServiceUnavailable());
        mvc.perform(authAs(44, get("/api/v1/admin/events/minigames/supported-games")))
                .andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/v1/admin/events/minigames/supported-games")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(auth(get(weeklyPath + "/BUNGEOPPANG/ranking")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(auth(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                weeklyPath + "/BUNGEOPPANG").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{}"))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                weeklyPath + "/BUNGEOPPANG").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{}"))).andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(weeklyPath + "/BUNGEOPPANG/finalize")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{}")))
                .andExpect(status().isForbidden());
        mvc.perform(authAs(43, post(weeklyPath + "/BUNGEOPPANG/finalize")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/events/minigames/rounds/2026-11-09/games/BUNGEOPPANG/result"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 엽전_보유량_행사_결과도_관리자_조회와_운영_권한을_분리한다() throws Exception {
        String adminPath = "/api/v1/admin/events/assets/rounds/2026-11-09";
        mvc.perform(get(adminPath)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(adminPath))).andExpect(status().isForbidden());
        mvc.perform(auth(get(adminPath))).andExpect(status().isServiceUnavailable());
        mvc.perform(auth(post(adminPath + "/finalize"))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, post(adminPath + "/finalize")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/v1/events/assets/rounds/2026-11-09/result"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 스킨_구성품과_세트_관리는_운영_관리자만_통과한다() throws Exception {
        String root = "/api/v1/admin/operations/skins";
        var endpoints = List.of(List.of("GET", root + "/components"), List.of("POST", root + "/components"),
                List.of("GET", root + "/sets"), List.of("POST", root + "/sets"), List.of("PUT", root + "/sets/1"),
                List.of("POST", root + "/sets/1/publish"), List.of("POST", root + "/sets/1/disable"));
        for (var endpoint : endpoints) {
            var method = org.springframework.http.HttpMethod.valueOf(endpoint.get(0));
            String path = endpoint.get(1);
            mvc.perform(request(method, path)).andExpect(status().isUnauthorized());
            mvc.perform(authAs(44, request(method, path))).andExpect(status().isForbidden());
            mvc.perform(auth(request(method, path))).andExpect(status().isForbidden());
            mvc.perform(authAs(43, request(method, path)
                            .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{}")))
                    .andExpect(result -> assertThat(result.getResponse().getStatus())
                            .as(method + " " + path).isNotIn(401, 403));
        }
    }

    @Test
    void 당첨자_연락처_목록과_원문_조회는_서로_다른_관리자_권한을_요구한다() throws Exception {
        String list = "/api/v1/admin/events/winners";
        String reveal = "/api/v1/admin/events/winners/1/contact";
        mvc.perform(get(list)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(list))).andExpect(status().isForbidden());
        mvc.perform(auth(get(list))).andExpect(status().isServiceUnavailable());
        mvc.perform(auth(get(reveal))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, get(reveal))).andExpect(status().isServiceUnavailable());
        String delivery = "/api/v1/admin/events/winners/1/delivery";
        mvc.perform(put(delivery)).andExpect(status().isUnauthorized());
        mvc.perform(auth(put(delivery))).andExpect(status().isForbidden());
        mvc.perform(authAs(43, put(delivery).contentType("application/json")
                .content("{\"expectedUserId\":44}"))).andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/v1/events/winnings/me")).andExpect(status().isUnauthorized());
        mvc.perform(auth(get("/api/v1/events/winnings/me")))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void 관리자_집계는_조회_권한이_있는_회원에게만_반환한다() throws Exception {
        var summary = new AnalyticsSnapshot(1, "2026-10-27T00:00:00Z", "2026-10-27T01:00:00Z",
                List.of(new AnalyticsSnapshot.Daily("2026-10-27", 3, 1, 4, 2)), List.of(), List.of());
        when(analyticsSnapshots.read()).thenReturn(summary);

        mvc.perform(get("/api/v1/admin/analytics/summary")).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get("/api/v1/admin/analytics/summary"))).andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/v1/admin/analytics/summary"))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.daily[0].activeUsers").value(3))
                .andExpect(jsonPath("$.dataAsOf").value("2026-10-27T00:00:00Z"));

        when(analyticsSnapshots.read()).thenThrow(new AnalyticsSnapshotStore.SnapshotUnavailableException());
        mvc.perform(auth(get("/api/v1/admin/analytics/summary"))).andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("ANALYTICS_SNAPSHOT_UNAVAILABLE"));
    }

    @Test
    void 점프맵_적발_목록은_조회_권한이_있는_회원에게만_반환한다() throws Exception {
        String path = "/api/v1/admin/macro-analysis/jumpmap";

        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(path))).andExpect(status().isForbidden());
        mvc.perform(auth(get(path))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.limit").value(200))
                .andExpect(jsonPath("$.items").isArray());
        mvc.perform(auth(post(path))).andExpect(status().isForbidden());
    }

    @Test
    void 줄넘기_매크로_기록은_조회_권한이_있는_회원에게만_반환한다() throws Exception {
        String path = "/api/v1/admin/macro-analysis/jump-rope";

        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(authAs(44, get(path))).andExpect(status().isForbidden());
        mvc.perform(auth(get(path))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.limit").value(200))
                .andExpect(jsonPath("$.suspects").isArray())
                .andExpect(jsonPath("$.duplicateLogs").isArray());
        mvc.perform(auth(post(path))).andExpect(status().isForbidden());
    }

    @Test
    void 허용하지_않은_관리자_경로와_HTTP_메서드는_관리자도_접근할_수_없다() throws Exception {
        mvc.perform(auth(get("/api/v1/admin/unknown"))).andExpect(status().isForbidden());
        mvc.perform(auth(post("/api/v1/admin/feedback"))).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET /components", "POST /components", "GET /sets", "POST /sets",
            "PUT /sets/fixture", "POST /sets/fixture/publish", "POST /sets/fixture/disable"})
    void 스킨_아이템과_세트_API는_로그인과_관리자_권한이_필요하다(String route) throws Exception {
        String[] parts=route.split(" ",2);
        String path="/api/v1/admin/operations/skins"+parts[1];
        var method=org.springframework.http.HttpMethod.valueOf(parts[0]);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method,path)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(auth(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method,path)
                        .contentType("application/json").content("{}")))
                .andExpect(status().isForbidden());
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
                "GET /api/v1/skins/assets", "GET /api/v1/admin/operations/skins/settings",
                "GET /api/v1/admin/operations/skins", "POST /api/v1/admin/operations/skins",
                "GET /api/v1/admin/operations/skins/{id}", "PUT /api/v1/admin/operations/skins/{id}",
                "DELETE /api/v1/admin/operations/skins/{id}",
                "POST /api/v1/admin/operations/skins/{id}/uploads",
                "POST /api/v1/admin/operations/skins/{id}/uploads/{uploadId}/verify",
                "POST /api/v1/admin/operations/skins/{id}/publish", "POST /api/v1/admin/operations/skins/{id}/disable",
                "GET /api/v1/admin/operations/skins/components", "POST /api/v1/admin/operations/skins/components",
                "GET /api/v1/admin/operations/skins/sets", "POST /api/v1/admin/operations/skins/sets",
                "PUT /api/v1/admin/operations/skins/sets/{id}",
                "DELETE /api/v1/admin/operations/skins/sets/{id}",
                "POST /api/v1/admin/operations/skins/sets/{id}/publish",
                "POST /api/v1/admin/operations/skins/sets/{id}/disable",
                "GET /api/v1/notifications", "GET /api/v1/notifications/{notificationId}",
                "PATCH /api/v1/notifications/{notificationId}/read",
                "POST /api/v1/notifications/{notificationId}/claim", "POST /api/v1/admin/wallet-grants/rewards",
                "GET /api/v1/admin/wallet-grants/rewards", "GET /api/v1/admin/wallet-grants/rewards/recipients",
                "POST /api/v1/admin/operations/feedback/{receiptId}/replies",
                "PATCH /api/v1/admin/operations/feedback/{receiptId}/status",
                "GET /api/v1/ai/features", "GET /api/v1/ai/companions/status",
                "POST /api/v1/ai/companions/invite", "POST /api/v1/ai/companions/action", "POST /api/v1/ai/companions/talk",
                "GET /api/v1/ai/joke-contest/me", "GET /api/v1/ai/joke-contest/submissions/{id}",
                "GET /api/v1/ai/joke-contest/rankings", "GET /api/v1/ai/joke-contest/hall",
                "GET /api/v1/ai/joke-contest/yesterday", "GET /api/v1/ai/joke-contest/reveal/{id}",
                "POST /api/v1/ai/joke-contest/submissions",
                "GET /api/v1/entry-news", "GET /api/v1/entry-news/{id}/image",
                "GET /api/v1/admin/operations/entry-news", "GET /api/v1/admin/operations/entry-news/{id}/image",
                "POST /api/v1/admin/operations/entry-news/{id}/uploads",
                "POST /api/v1/admin/operations/entry-news/{id}", "PUT /api/v1/admin/operations/entry-news/{id}",
                "DELETE /api/v1/admin/operations/entry-news/{id}", "PUT /api/v1/admin/operations/entry-news/order",
                "GET /api/v1/announcements", "GET /api/v1/admin/operations/announcements",
                "POST /api/v1/admin/operations/announcements/{id}",
                "PUT /api/v1/admin/operations/announcements/{id}",
                "PUT /api/v1/admin/operations/announcements/order",
                "DELETE /api/v1/admin/operations/announcements/{id}",
                "GET /api/v1/auth/{provider}/callback", "POST /api/v1/auth/exchange", "POST /api/v1/auth/refresh",
                "POST /api/v1/auth/logout", "POST /api/v1/users/onboarding", "GET /api/v1/users/me",
                "GET /api/v1/users/nickname-availability",
                "PATCH /api/v1/users/me",
                "DELETE /api/v1/users/me",
                "GET /api/v1/admin/me", "GET /api/v1/admin/analytics/summary",
                "GET /api/v1/admin/macro-analysis/mole", "GET /api/v1/admin/macro-analysis/mole/{id}",
                "GET /api/v1/admin/macro-analysis/mole/detections", "GET /api/v1/admin/macro-analysis/mole/timing",
                "GET /api/v1/admin/macro-analysis/jumpmap", "GET /api/v1/admin/macro-analysis/jump-rope",
                "POST /api/v1/admin/wallet-grants/preview", "POST /api/v1/admin/wallet-grants",
                "GET /api/v1/operations/status", "GET /api/v1/admin/operations/status",
                "PUT /api/v1/admin/operations/status",
                "GET /api/v1/wallets/me", "GET /api/v1/wallets/me/transactions",
                "GET /api/v1/rankings", "GET /api/v1/rankings/park",
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
                "POST /api/v1/behavior-events",
                "GET /api/v1/channels",
                "GET /api/v1/world/fitness/rewards/status",
                "GET /api/v1/tables", "GET /dev/tables", "GET /dev/world-config",
                "GET /api/v1/shop/items", "POST /api/v1/shop/purchases",
                "GET /api/v1/gacha", "GET /api/v1/gacha/operations/{operationId}",
                "POST /api/v1/gacha/tickets", "POST /api/v1/gacha/draws", "POST /api/v1/gacha/boxes/open",
                "GET /api/v1/users/me/items", "PATCH /api/v1/users/me/equipment",
                "POST /api/v1/minigames/sessions", "GET /api/v1/minigames/sessions",
                "GET /api/v1/minigames/rps-roulette/status", "POST /api/v1/minigames/rps-roulette/rounds",
                "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/hands",
                "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/challenge",
                "POST /api/v1/minigames/rps-roulette/rounds/{roundId}/stop",
                "GET /api/v1/minigames/plus-minus/status", "POST /api/v1/minigames/plus-minus/rounds",
                "GET /api/v1/minigames/whack-a-mole/status", "POST /api/v1/minigames/whack-a-mole/rounds",
                "POST /api/v1/minigames/whack-a-mole/rounds/{roundId}/complete",
                "GET /api/v1/minigames/whack-a-mole/rankings",
                "POST /api/v1/minigames/speed-mole/rounds", "POST /api/v1/minigames/speed-mole/rounds/{roundId}/complete",
                "GET /api/v1/minigames/speed-mole/rankings",
                "POST /api/v1/minigames/{game:whack-a-mole|speed-mole}/rounds/{id}/observations",
                "POST /api/v1/minigames/jump-rope/rounds",
                "POST /api/v1/minigames/jump-rope/rounds/{roundId}/complete",
                "GET /api/v1/minigames/jump-rope/rankings",
                "GET /api/v1/minigames/sessions/{sessionId}",
                "POST /api/v1/minigames/sessions/{sessionId}/manual-pause",
                "POST /api/v1/minigames/sessions/{sessionId}/deliveries",
                "POST /api/v1/minigames/sessions/{sessionId}/complete",
                "POST /api/v1/minigames/sessions/{sessionId}/abandon",
                "GET /api/v1/minigames/jumpmap/status", "GET /api/v1/minigames/jumpmap/rankings", "POST /api/v1/minigames/jumpmap/tips");
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request) {
        return authAs(42, request);
    }

    private MockHttpServletRequestBuilder authAs(long userId, MockHttpServletRequestBuilder request) {
        return request.header("Authorization", "Bearer " + jwt.issue(userId, TestLoginSessions.ID));
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

        @PostMapping("/api/v1/admin/wallet-grants/probe")
        Map<String, Object> grantProbe() {
            return Map.of("allowed", true);
        }
    }
}
