package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthLogoutOriginFilter;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.service.AuthLogoutPersistenceService;
import com.ssafy.ontop.auth.service.AuthLogoutService;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.net.HttpCookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
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

class AuthLogoutControllerTests {

    private static final String PATH = "/api/v1/auth/logout";
    private static final String ORIGIN = "https://front.example.test";
    private static final String RAW = "rt_" + "a".repeat(43);
    private static final Instant NOW = Instant.parse("2026-10-21T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private AuthTokenProperties properties;
    private AuthLogoutPersistenceService persistence;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        // 로그아웃은 JWT 서명 키가 없어도 동작해야 한다.
        properties = new AuthTokenProperties("", "ontop", List.of(ORIGIN),
                new AuthTokenProperties.RefreshCookie(false, "Lax", "/api/v1/auth"));
        persistence = mock(AuthLogoutPersistenceService.class);
        mvc = mvc(persistence, false);
    }

    @Test
    void Bearer와_JSESSIONID와_본문없이_204와_삭제_쿠키를_반환한다() throws Exception {
        MvcResult result = logout().andExpect(status().isNoContent())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer")).andReturn();
        assertThat(result.getResponse().getContentAsByteArray()).isEmpty();
        assertThat(result.getResponse().getHeader("Content-Type")).isNull();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("ONTOP_REFRESH=;", "Max-Age=0",
                "Path=/api/v1/auth", "HttpOnly", "SameSite=Lax").doesNotContain(RAW, "Domain=");
        assertThat(result.getRequest().getSession(false)).isNull();
        verify(persistence).logout(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(RAW.getBytes(StandardCharsets.UTF_8))));
        logout().andExpect(status().isNoContent());
    }

    @Test
    void 쿠키가_없으면_DB가_없어도_204로_삭제한다() throws Exception {
        mvc = mvc(null, false);
        mvc.perform(post(PATH).header("Origin", ORIGIN)).andExpect(status().isNoContent())
                .andExpect(header().exists("Set-Cookie"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "forged", "rt_short", "ob_token", "a.b.c"})
    void 잘못된_형식은_원문을_노출하거나_DB에_조회하지_않고_204로_삭제한다(String raw) throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", raw)))
                .andExpect(status().isNoContent()).andExpect(header().exists("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @Test
    void 중복_쿠키는_임의_세션을_선택하지_않고_400이다() throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", RAW),
                new Cookie("ONTOP_REFRESH", RAW))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AUTH_INVALID_LOGOUT_REQUEST"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", " ", "x=y"})
    void 본문은_400이며_DB와_쿠키를_변경하지_않는다(String body) throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", RAW)).content(body))
                .andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "prod", "cross-site"})
    void 삭제_쿠키의_속성은_발급_쿠키와_같고_MaxAge만_0이다(String mode) throws Exception {
        boolean secure = !mode.equals("local");
        String sameSite = mode.equals("cross-site") ? "None" : "Lax";
        properties = new AuthTokenProperties("", "ontop", List.of(ORIGIN),
                new AuthTokenProperties.RefreshCookie(secure, sameSite, "/api/v1/auth"));
        mvc = mvc(persistence, secure);
        var environment = new MockEnvironment();
        environment.setActiveProfiles(secure ? "prod" : "local");
        String issuedHeader = new RefreshCookieService(properties, environment).issue(RAW);
        String clearHeader = logout().andExpect(status().isNoContent()).andReturn()
                .getResponse().getHeader("Set-Cookie");
        HttpCookie issued = HttpCookie.parse(issuedHeader).getFirst();
        HttpCookie cleared = HttpCookie.parse(clearHeader).getFirst();
        assertThat(cleared.getValue()).isEmpty();
        assertThat(cleared.getName()).isEqualTo(issued.getName());
        assertThat(cleared.getPath()).isEqualTo(issued.getPath()).isEqualTo("/api/v1/auth");
        assertThat(cleared.getDomain()).isEqualTo(issued.getDomain());
        assertThat(cleared.getDomain()).isNull();
        assertThat(cleared.getSecure()).isEqualTo(issued.getSecure()).isEqualTo(secure);
        assertThat(cleared.isHttpOnly()).isTrue().isEqualTo(issued.isHttpOnly());
        assertThat(cleared.getMaxAge()).isZero();
        assertThat(issuedHeader).contains("SameSite=" + sameSite);
        assertThat(clearHeader).contains("SameSite=" + sameSite);
    }

    @Test
    void 운영_쿠키_보안_설정이_잘못되면_DB_폐기전에_500이다() throws Exception {
        mvc = mvc(persistence, true);
        logout().andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_CONFIGURATION_ERROR"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"db", "commit"})
    void DB와_커밋_예외는_503이고_삭제_성공을_가장하지_않는다(String failure) throws Exception {
        RuntimeException exception = failure.equals("db") ? new DataAccessResourceFailureException("fixture-private")
                : new TransactionSystemException("fixture-private");
        doThrow(exception).when(persistence).logout(any());
        MvcResult result = logout().andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_LOGOUT_STORAGE_UNAVAILABLE"))
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();
        var body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(2);
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private", RAW);
    }

    @Test
    void DB가_없을때_정상형식_쿠키는_서버폐기_성공으로_처리하지_않는다() throws Exception {
        mvc = mvc(null, false);
        logout().andExpect(status().isServiceUnavailable()).andExpect(header().doesNotExist("Set-Cookie"));
    }

    @Test
    void 트랜잭션_프록시의_커밋_실패는_204나_삭제_쿠키로_전달되지_않는다() throws Exception {
        var tokens = mock(RefreshTokenRepository.class);
        var users = mock(UserRepository.class);
        User user = new User(LoginProvider.SSAFY, "fixture-private", "로그아웃검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        var reference = mock(RefreshTokenRepository.TokenReference.class);
        when(reference.getUserId()).thenReturn(42L);
        when(tokens.findReferenceByTokenHash(any())).thenReturn(Optional.of(reference));
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        RefreshToken token = new RefreshToken(user, UUID.randomUUID().toString(), "a".repeat(64),
                NOW.minusSeconds(1), NOW.plusSeconds(604800));
        when(tokens.findForUpdateByHash(any())).thenReturn(Optional.of(token));
        var target = new AuthLogoutPersistenceService(tokens, users, clock, mock(AuthenticationRevocations.class));
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        doThrow(new TransactionSystemException("fixture-private-commit")).when(manager).commit(any());
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        mvc = mvc((AuthLogoutPersistenceService) proxy.getProxy(), false);
        logout().andExpect(status().isServiceUnavailable()).andExpect(header().doesNotExist("Set-Cookie"));
        verify(tokens).revokeSession(any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://attacker.example.test", "null", "https://front.example.test.attacker.test",
            "https://front.example.test:444", "http://front.example.test"})
    void 허용되지_않은_Origin은_403이고_DB나_쿠키를_변경하지_않는다(String origin) throws Exception {
        mvc.perform(post(PATH).header("Origin", origin).cookie(new Cookie("ONTOP_REFRESH", RAW)))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"same-origin", "same-site", "cross-site", "none"})
    void Origin_누락은_Fetch_Metadata가_있어도_403이다(String metadata) throws Exception {
        mvc.perform(post(PATH).header("Sec-Fetch-Site", metadata).cookie(new Cookie("ONTOP_REFRESH", RAW)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    @Test
    void Origin_누락과_중복은_쿠키가_없어도_403이다() throws Exception {
        mvc.perform(post(PATH)).andExpect(status().isForbidden());
        mvc.perform(post(PATH).header("Origin", ORIGIN, ORIGIN)).andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    @Test
    void 허용된_프론트_Origin과_preflight만_credentials를_허용한다() throws Exception {
        mvc.perform(post(PATH).header("Origin", ORIGIN).header("Sec-Fetch-Site", "cross-site"))
                .andExpect(status().isNoContent()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options(PATH).header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type")).andExpect(status().isNoContent())
                .andExpect(header().doesNotExist("Set-Cookie"));
        mvc.perform(options(PATH).header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization")).andExpect(status().isForbidden());
        verifyNoInteractions(persistence);
    }

    private ResultActions logout() throws Exception {
        return mvc.perform(post(PATH).header("Origin", ORIGIN).cookie(new Cookie("ONTOP_REFRESH", RAW)));
    }

    private MockMvc mvc(AuthLogoutPersistenceService issuer, boolean production) {
        var beans = new StaticListableBeanFactory();
        if (issuer != null) {
            beans.addBean("issuer", issuer);
        }
        var environment = new MockEnvironment();
        environment.setActiveProfiles(production ? "prod" : "local");
        var origins = new AuthExchangeOriginPolicy(properties, environment);
        var service = new AuthLogoutService(beans.getBeanProvider(AuthLogoutPersistenceService.class),
                new RefreshCookieService(properties, environment), origins);
        return MockMvcBuilders.standaloneSetup(new AuthLogoutController(service))
                .setControllerAdvice(new AuthLogoutExceptionHandler())
                .addFilters(new AuthLogoutOriginFilter(origins, mapper)).build();
    }
}
