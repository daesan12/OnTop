package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthRefreshOriginFilter;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.AuthRefreshPersistenceService;
import com.ssafy.ontop.auth.service.AuthRefreshService;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.env.MockEnvironment;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthRefreshControllerTests {

    private static final String PATH = "/api/v1/auth/refresh";
    private static final String ORIGIN = "https://front.example.test";
    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private Clock clock;
    private AuthTokenProperties properties;
    private AccessJwtService jwt;
    private AuthRefreshPersistenceService persistence;
    private MockMvc mvc;
    private String raw;

    @BeforeEach
    void setUp() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        properties = new AuthTokenProperties(Base64.getEncoder().encodeToString(bytes), "ontop", List.of(ORIGIN),
                new AuthTokenProperties.RefreshCookie(false, "Lax", "/api/v1/auth"));
        raw = "rt_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        clock = Clock.fixed(START, java.time.ZoneOffset.UTC);
        jwt = new AccessJwtService(properties, clock);
        persistence = mock(AuthRefreshPersistenceService.class);
        when(persistence.rotate(any(), any())).thenAnswer(invocation ->
                new AuthRefreshPersistenceService.Rotation(jwt.issue(42, TestLoginSessions.ID), "rt_fixture_private", null));
        mvc = mvc(persistence, false);
    }

    @Test
    void 본문과_Bearer와_JSESSIONID_없이_새_JWT와_HttpOnly_쿠키를_받는다() throws Exception {
        MvcResult result = refresh().andExpect(status().isOk()).andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(1800))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer")).andReturn();
        var body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(3);
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(42);
        assertThat(body.has("refreshToken") || body.has("userId") || body.has("providerUserId")).isFalse();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("ONTOP_REFRESH=", "HttpOnly",
                "Path=/api/v1/auth", "SameSite=Lax", "Max-Age=604800");
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeaders("Set-Cookie")).noneMatch(value -> value.startsWith("JSESSIONID="));
        verify(persistence).rotate(any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "forged", "ob_fixture", "rt_short", "rt_"})
    void 잘못된_쿠키는_401이며_값을_노출하지_않는다(String value) throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", value)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_INVALID_REFRESH_TOKEN"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @Test
    void 쿠키_누락과_중복과_Access_JWT는_거절한다() throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN)).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", raw),
                new Cookie("ONTOP_REFRESH", raw))).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", jwt.issue(42, TestLoginSessions.ID))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", " ", "x=y"})
    void 본문이_있으면_400이며_토큰을_소비하지_않는다(String body) throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", raw)).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_REFRESH_REQUEST"));
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @EnumSource(value = AuthRefreshException.Error.class,
            names = {"INVALID_TOKEN", "ALREADY_ROTATED", "REUSE_DETECTED", "MEMBER_CHANGED"})
    void 거절은_401이며_동시_성공의_쿠키를_덮어쓰지_않는다(AuthRefreshException.Error error) throws Exception {
        when(persistence.rotate(any(), any())).thenReturn(AuthRefreshPersistenceService.Rotation.denied(error));
        refresh().andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(error.code()))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }

    @Test
    void DB_비활성과_저장소_실패는_503이며_내부_정보를_반사하지_않는다() throws Exception {
        when(persistence.rotate(any(), any())).thenThrow(new DataAccessResourceFailureException("fixture-private"));
        MvcResult result = refresh().andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private", raw, "accessToken");
        mvc = mvc(null, false);
        refresh().andExpect(status().isServiceUnavailable());
    }

    @Test
    void JWT_설정_실패와_운영_쿠키_보안_약화는_안전한_500이다() throws Exception {
        when(persistence.rotate(any(), any()))
                .thenThrow(new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION));
        refresh().andExpect(status().isInternalServerError()).andExpect(header().doesNotExist("Set-Cookie"));
        persistence = mock(AuthRefreshPersistenceService.class);
        mvc = mvc(persistence, true);
        refresh().andExpect(status().isInternalServerError());
        verifyNoInteractions(persistence);
    }

    @Test
    void 운영_HTTPS_쿠키는_Secure와_HttpOnly와_기존_Path를_유지한다() throws Exception {
        properties = new AuthTokenProperties(properties.jwtSecretBase64(), "ontop", List.of(ORIGIN),
                new AuthTokenProperties.RefreshCookie(true, "None", "/api/v1/auth"));
        mvc = mvc(persistence, true);
        MvcResult result = refresh().andExpect(status().isOk()).andReturn();
        assertThat(result.getResponse().getHeader("Set-Cookie"))
                .contains("Secure", "HttpOnly", "SameSite=None", "Path=/api/v1/auth");
    }

    @Test
    void 커밋_결과_불명은_성공_응답과_쿠키를_발급하지_않는다() throws Exception {
        var tokens = mock(RefreshTokenRepository.class);
        var users = mock(UserRepository.class);
        var issuer = mock(AuthExchangePersistenceService.class);
        User user = new User(LoginProvider.SSAFY, "fixture-private", "재발급검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        var reference = mock(RefreshTokenRepository.TokenReference.class);
        when(reference.getUserId()).thenReturn(42L);
        when(tokens.findReferenceByTokenHash(any())).thenReturn(Optional.of(reference));
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        RefreshToken previous = new RefreshToken(user, UUID.randomUUID().toString(), "a".repeat(64),
                START.minusSeconds(1), START.plusSeconds(604800));
        when(tokens.findForUpdateByHash(any())).thenReturn(Optional.of(previous));
        when(issuer.issueForSession(any(), any())).thenReturn(
                new AuthExchangePersistenceService.Credentials(jwt.issue(42, TestLoginSessions.ID), "rt_fixture_private"));
        var target = new AuthRefreshPersistenceService(tokens, users, issuer, clock, mock(AuthenticationRevocations.class));
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        doThrow(new TransactionSystemException("fixture-private-commit")).when(manager).commit(any());
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        mvc = mvc((AuthRefreshPersistenceService) proxy.getProxy(), false);

        MvcResult result = refresh().andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("accessToken", "fixture-private-commit");
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://attacker.example.test", "null", "https://front.example.test.attacker.test",
            "https://front.example.test:444", "http://front.example.test"})
    void 잘못된_Origin은_403이고_정상_토큰을_변경하지_않는다(String origin) throws Exception {
        mvc.perform(post(PATH).header("Origin", origin).cookie(new Cookie("ONTOP_REFRESH", raw)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
        refresh().andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"same-origin", "same-site", "cross-site", "none", "invalid"})
    void Origin이_없으면_Fetch_Metadata만으로_쿠키_인증을_허용하지_않는다(String fetch) throws Exception {
        mvc.perform(post(PATH).header("Sec-Fetch-Site", fetch).cookie(new Cookie("ONTOP_REFRESH", raw)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    @Test
    void Origin_누락과_중복은_403이며_허용된_다른사이트_프론트는_인증할_수_있다() throws Exception {
        mvc.perform(post(PATH).cookie(new Cookie("ONTOP_REFRESH", raw))).andExpect(status().isForbidden());
        mvc.perform(post(PATH).header("Origin", ORIGIN, ORIGIN).cookie(new Cookie("ONTOP_REFRESH", raw)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
        mvc.perform(post(PATH).header("Origin", ORIGIN).header("Sec-Fetch-Site", "cross-site")
                .cookie(new Cookie("ONTOP_REFRESH", raw))).andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void preflight는_허용된_Origin의_POST와_Content_Type만_허용한다() throws Exception {
        mvc.perform(options(PATH).header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type")).andExpect(status().isNoContent());
        mvc.perform(options(PATH).header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization")).andExpect(status().isForbidden());
        mvc.perform(options(PATH).header("Origin", ORIGIN).header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    private ResultActions refresh() throws Exception {
        return mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", raw)));
    }

    private MockMvc mvc(AuthRefreshPersistenceService issuer, boolean production) {
        var beans = new StaticListableBeanFactory();
        if (issuer != null) {
            beans.addBean("issuer", issuer);
        }
        var environment = new MockEnvironment();
        environment.setActiveProfiles(production ? "prod" : "local");
        var service = new AuthRefreshService(beans.getBeanProvider(AuthRefreshPersistenceService.class),
                new RefreshCookieService(properties, environment), clock,
                new AuthExchangeOriginPolicy(properties, environment));
        return MockMvcBuilders.standaloneSetup(new AuthRefreshController(service))
                .setControllerAdvice(new AuthRefreshExceptionHandler())
                .addFilters(new AuthRefreshOriginFilter(new AuthExchangeOriginPolicy(properties, environment), mapper))
                .build();
    }
}
