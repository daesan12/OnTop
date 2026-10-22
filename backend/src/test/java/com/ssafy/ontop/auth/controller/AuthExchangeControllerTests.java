package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthExchangeOriginFilter;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.AuthExchangeService;
import com.ssafy.ontop.auth.service.OAuthExchangeStore;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthExchangeControllerTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private Clock clock;
    private AccessJwtService jwt;
    private OAuthExchangeStore codes;
    private OnboardingTokenStore onboarding;
    private AuthExchangePersistenceService persistence;
    private AuthTokenProperties properties;
    private MockMvc mvc;
    private MockHttpSession session;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        properties = new AuthTokenProperties(Base64.getEncoder().encodeToString(key), "ontop",
                List.of("http://localhost:8080", "https://front.example.test"),
                new AuthTokenProperties.RefreshCookie(false, "Lax", "/api/v1/auth"));
        jwt = new AccessJwtService(properties, clock);
        codes = new OAuthExchangeStore(clock);
        onboarding = new OnboardingTokenStore(clock);
        persistence = mock(AuthExchangePersistenceService.class);
        when(persistence.issueExisting(any())).thenAnswer(invocation -> {
            LoginOutcome outcome = invocation.getArgument(0);
            return new AuthExchangePersistenceService.Credentials(jwt.issue(outcome.userId(), TestLoginSessions.ID), "rt_fixture_private");
        });
        session = new MockHttpSession();
        mvc = mvc(persistence);
    }

    @ParameterizedTest
    @EnumSource(value = LoginOutcome.Status.class, names = {"EXISTING_MEMBER", "RESTORED_MEMBER"})
    void 기존회원과_복구회원은_같은_ID의_Access와_Refresh_쿠키를_받는다(LoginOutcome.Status member) throws Exception {
        String before = session.getId();
        String code = issue(new LoginOutcome(OAuthProvider.SSAFY, member, 42L, null));

        MvcResult result = exchange(code, session).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.expiresIn").value(1800))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(4);
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(42);
        assertThat(body.has("refreshToken") || body.has("userId") || body.has("providerUserId")).isFalse();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("ONTOP_REFRESH=", "HttpOnly",
                "SameSite=Lax", "Path=/api/v1/auth", "Max-Age=604800");
        assertThat(session.getId()).isNotEqualTo(before);
        exchange(code, session).andExpect(status().isUnauthorized());
    }

    @Test
    void 신규회원은_온보딩만_받고_일반_인증은_발급하지_않는다() throws Exception {
        String code = issue(new LoginOutcome(OAuthProvider.NAVER, LoginOutcome.Status.NEW_MEMBER, null, "fixture-id"));

        MvcResult result = exchange(code, session).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ONBOARDING_REQUIRED"))
                .andExpect(jsonPath("$.expiresIn").value(600))
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(3);
        String token = body.path("onboardingToken").asText();
        assertThat(onboarding.verify(token).providerUserId()).isEqualTo("fixture-id");
        verify(persistence, times(0)).issueExisting(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "[]", "{", "{\"exchangeCode\":null}",
            "{\"exchangeCode\":123}", "{\"exchangeCode\":\"\"}", "{\"exchangeCode\":\"forged\"}"})
    void 잘못된_JSON_요청은_안전한_400이다(String body) throws Exception {
        mvc.perform(post("/api/v1/auth/exchange").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_EXCHANGE_REQUEST"))
                .andExpect(header().string("Cache-Control", "no-store"));
        verifyNoInteractions(persistence);
    }

    @Test
    void 위조_만료_다른세션_누락세션은_401이며_다른세션은_원래_코드를_소비하지_못한다() throws Exception {
        String code = issue(existing());
        exchange("A".repeat(43), session).andExpect(status().isUnauthorized());
        exchange(code, new MockHttpSession()).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/exchange").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("exchangeCode", code))))
                .andExpect(status().isUnauthorized());
        exchange(code, session).andExpect(status().isOk());
        String expired = issue(existing());
        when(clock.instant()).thenReturn(START.plusSeconds(60));
        exchange(expired, session).andExpect(status().isUnauthorized());
    }

    @Test
    void 저장_실패는_503이며_코드_복원이나_인증_응답과_Refresh_쿠키가_없다() throws Exception {
        doThrow(new DataAccessResourceFailureException("private-store-detail")).when(persistence).issueExisting(any());
        String code = issue(existing());

        MvcResult result = exchange(code, session).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_EXCHANGE_STORAGE_UNAVAILABLE"))
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("private-store-detail", "accessToken",
                "refreshToken", code);
        exchange(code, session).andExpect(status().isUnauthorized());
        verify(persistence).issueExisting(any());
    }

    @Test
    void 서명_실패도_코드를_복원하지_않는다() throws Exception {
        doThrow(new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION))
                .when(persistence).issueExisting(any());
        String code = issue(existing());
        exchange(code, session).andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist("Set-Cookie"));
        exchange(code, session).andExpect(status().isUnauthorized());
    }

    @Test
    void DB_프로필이_없어도_코드는_다시_사용할_수_없다() throws Exception {
        mvc = mvc(null);
        String code = issue(existing());
        exchange(code, session).andExpect(status().isServiceUnavailable());
        exchange(code, session).andExpect(status().isUnauthorized());
    }

    @Test
    void flush_성공_후_커밋이_실패해도_인증을_응답하지_않는다() throws Exception {
        UserRepository users = mock(UserRepository.class);
        User user = new User(LoginProvider.SSAFY, "fixture-id", "검증사용자", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        RefreshTokenRepository refresh = mock(RefreshTokenRepository.class);
        AuthExchangePersistenceService target = new AuthExchangePersistenceService(users, refresh, jwt, clock);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        doThrow(new TransactionSystemException("private-commit-detail")).when(manager).commit(any());
        ProxyFactory factory = new ProxyFactory(target);
        factory.setProxyTargetClass(true);
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        factory.addAdvice(interceptor);
        mvc = mvc((AuthExchangePersistenceService) factory.getProxy());
        String code = issue(existing());

        MvcResult result = exchange(code, session).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        verify(refresh).saveAndFlush(any());
        assertThat(result.getResponse().getContentAsString()).doesNotContain("accessToken", "private-commit-detail");
        exchange(code, session).andExpect(status().isUnauthorized());
    }

    @Test
    void 동시에_교환해도_인증_발급은_한_번이다() throws Exception {
        String code = issue(existing());
        List<Callable<Integer>> calls = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            calls.add(() -> exchange(code, session).andReturn().getResponse().getStatus());
        }
        List<Integer> statuses = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(8)) {
            for (var future : executor.invokeAll(calls)) {
                statuses.add(future.get());
            }
        }
        assertThat(statuses).filteredOn(value -> value == 200).hasSize(1);
        assertThat(statuses).filteredOn(value -> value == 401).hasSize(7);
        verify(persistence).issueExisting(any());
    }

    @Test
    void 출처_거절은_코드를_소비하지_않고_허용된_출처는_명시적으로만_CORS를_받는다() throws Exception {
        String code = issue(existing());
        String body = mapper.writeValueAsString(Map.of("exchangeCode", code));
        mvc.perform(post("/api/v1/auth/exchange").session(session).contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "https://attacker.example.test").content(body))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_ORIGIN_NOT_ALLOWED"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(post("/api/v1/auth/exchange").session(session).contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "https://front.example.test").content(body))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://front.example.test"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void null_출처와_출처없는_cross_site와_단순_form_요청을_거절한다() throws Exception {
        String code = issue(existing());
        String body = mapper.writeValueAsString(Map.of("exchangeCode", code));
        mvc.perform(post("/api/v1/auth/exchange").session(session).header("Origin", "null")
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/exchange").session(session).header("Sec-Fetch-Site", "cross-site")
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/exchange").session(session).contentType(MediaType.TEXT_PLAIN).content(body))
                .andExpect(status().isBadRequest());
        exchange(code, session).andExpect(status().isOk());
    }

    @Test
    void preflight는_정확한_출처와_POST와_ContentType만_허용한다() throws Exception {
        mvc.perform(options("/api/v1/auth/exchange").header("Origin", "https://front.example.test")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isNoContent()).andExpect(header().string("Access-Control-Allow-Methods", "POST"));
        mvc.perform(options("/api/v1/auth/exchange").header("Origin", "https://front.example.test")
                        .header("Access-Control-Request-Method", "DELETE"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    private LoginOutcome existing() {
        return new LoginOutcome(OAuthProvider.SSAFY, LoginOutcome.Status.EXISTING_MEMBER, 42L, null);
    }

    private String issue(LoginOutcome outcome) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(session);
        return codes.issue(request, outcome);
    }

    private ResultActions exchange(String code, MockHttpSession cookieSession) throws Exception {
        return mvc.perform(post("/api/v1/auth/exchange").session(cookieSession).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("exchangeCode", code))));
    }

    private MockMvc mvc(AuthExchangePersistenceService issuer) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        if (issuer != null) {
            beans.addBean("issuer", issuer);
        }
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        AuthExchangeService service = new AuthExchangeService(codes,
                beans.getBeanProvider(AuthExchangePersistenceService.class), onboarding,
                new RefreshCookieService(properties, environment));
        return MockMvcBuilders.standaloneSetup(new AuthExchangeController(service))
                .setControllerAdvice(new AuthExceptionHandler())
                .addFilters(new AuthExchangeOriginFilter(new AuthExchangeOriginPolicy(properties, environment), mapper))
                .build();
    }
}
