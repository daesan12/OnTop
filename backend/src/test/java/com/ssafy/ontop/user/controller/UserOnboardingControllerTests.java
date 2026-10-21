package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import com.ssafy.ontop.user.config.UserOnboardingOriginFilter;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.service.UserOnboardingPersistenceService;
import com.ssafy.ontop.user.service.UserOnboardingService;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
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

class UserOnboardingControllerTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private Clock clock;
    private OnboardingTokenStore tokens;
    private UserOnboardingPersistenceService persistence;
    private AccessJwtService jwt;
    private MockHttpSession session;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        jwt = new AccessJwtService(new AuthTokenProperties(Base64.getEncoder().encodeToString(key), "ontop",
                List.of(), new AuthTokenProperties.RefreshCookie(false, "Lax", "/api/v1/auth")), clock);
        tokens = new OnboardingTokenStore(clock);
        persistence = mock(UserOnboardingPersistenceService.class);
        when(persistence.create(any(), any(), any())).thenAnswer(this::created);
        session = new MockHttpSession();
        mvc = mvc(persistence, false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"미지", "가나다라마바사아", "Ab", "ABcd1234", "가A1"})
    void 두글자부터_여덟글자와_허용문자는_201과_일반인증을_받는다(String nickname) throws Exception {
        String token = issue();

        MvcResult result = onboard(token, null, nickname, "FEMALE").andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(42)).andExpect(jsonPath("$.nickname").value(nickname))
                .andExpect(jsonPath("$.characterGender").value("FEMALE"))
                .andExpect(jsonPath("$.tokenType").value("Bearer")).andExpect(jsonPath("$.expiresIn").value(1800))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(6);
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(42);
        assertThat(body.has("refreshToken") || body.has("providerUserId") || body.has("onboardingToken")).isFalse();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("ONTOP_REFRESH=", "HttpOnly",
                "Path=/api/v1/auth", "SameSite=Lax", "Max-Age=604800");
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeaders("Set-Cookie"))
                .noneMatch(value -> value.startsWith("JSESSIONID="));
        onboard(token, null, nickname, "FEMALE").andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"가", "A", "123456789", "가나다라마바사아자", "", "공 백", "앞 ", " 뒤", "초성ㄱ", "ㅁㅈ",
            "특수!", "a_b", "a-b", "이모😀", "a\nb", "éé", "가"})
    void 잘못된_닉네임은_거절하고_토큰을_소비하지_않는다(String nickname) throws Exception {
        String token = issue();

        onboard(token, session, nickname, "MALE").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("USER_INVALID_NICKNAME"));

        assertTokenValid(token);
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"OTHER", "male", "female", "", "MALE "})
    void 성별은_정확한_enum_문자열만_허용한다(String gender) throws Exception {
        String token = issue();
        onboard(token, session, "미지", gender).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("USER_INVALID_CHARACTER_GENDER"));
        assertTokenValid(token);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "[]", "{", "{}", "{\"nickname\":\"미지\"}",
            "{\"characterGender\":\"FEMALE\"}", "{\"nickname\":null,\"characterGender\":\"MALE\"}",
            "{\"nickname\":1234,\"characterGender\":\"MALE\"}", "{\"nickname\":\"미지\",\"characterGender\":0}",
            "{\"nickname\":\"미지\",\"characterGender\":\"MALE\",\"providerUserId\":\"forged\"}",
            "{\"nickname\":\"미지\",\"characterGender\":\"MALE\",\"userId\":1}"})
    void 누락값과_다른_자료형과_식별자_주입을_거절한다(String body) throws Exception {
        String token = issue();
        mvc.perform(post("/api/v1/users/onboarding").session(session).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Set-Cookie"));
        assertTokenValid(token);
        verifyNoInteractions(persistence);
    }

    @Test
    void 토큰_누락과_위조와_Access_JWT와_중복헤더는_거절한다() throws Exception {
        String body = mapper.writeValueAsString(Map.of("nickname", "미지", "characterGender", "FEMALE"));
        mvc.perform(post("/api/v1/users/onboarding").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isUnauthorized());
        for (String invalid : List.of("ob_" + "A".repeat(43), "invalid", jwt.issue(42))) {
            onboard(invalid, null, "미지", "FEMALE").andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_INVALID_ONBOARDING_TOKEN"));
        }
        String token = issue();
        mvc.perform(post("/api/v1/users/onboarding").session(session)
                        .header("Authorization", "Bearer " + token, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        assertTokenValid(token);
        verifyNoInteractions(persistence);
    }

    @Test
    void 다른세션에서도_유효한_Bearer로_가입하고_세션을_회전하지_않는다() throws Exception {
        String token = issue();
        MockHttpSession unrelated = new MockHttpSession();
        String before = unrelated.getId();
        onboard(token, unrelated, "미지", "FEMALE").andExpect(status().isCreated());
        assertThat(unrelated.getId()).isEqualTo(before);
        onboard(token, session, "미지", "FEMALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 세션없이도_만료된_Bearer는_거절한다() throws Exception {
        String token = issue();
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        onboard(token, null, "미지", "FEMALE").andExpect(status().isUnauthorized());
        verifyNoInteractions(persistence);
    }

    @Test
    void 닉네임_중복_롤백_후_같은_Bearer와_다른_닉네임으로_세션없이_재시도한다() throws Exception {
        doAnswer(invocation -> {
            rolledBack(invocation);
            throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
        }).doAnswer(this::created).when(persistence).create(any(), any(), any());
        String token = issue();

        onboard(token, null, "미지", "MALE").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        onboard(token, null, "다른미지", "MALE").andExpect(status().isCreated());
        onboard(token, null, "또미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 반복되는_닉네임_중복도_최초_600초_만료를_연장하지_않는다() throws Exception {
        doAnswer(invocation -> {
            rolledBack(invocation);
            throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
        }).when(persistence).create(any(), any(), any());
        String token = issue();
        for (long seconds : new long[] {0, 300, 599}) {
            when(clock.instant()).thenReturn(START.plusSeconds(seconds));
            onboard(token, null, "미지", "MALE").andExpect(status().isConflict());
        }
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        onboard(token, null, "새미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 이미_가입한_소셜계정은_409_후_새_OAuth_로그인이_필요하다() throws Exception {
        doAnswer(invocation -> {
            rolledBack(invocation);
            throw new UserOnboardingException(UserOnboardingException.Error.ALREADY_REGISTERED);
        }).when(persistence).create(any(), any(), any());
        String token = issue();
        onboard(token, null, "미지", "MALE").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_ALREADY_REGISTERED"));
        onboard(token, null, "새미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void UNIQUE_경합은_롤백_후_새_조회로_분류하며_SQL_원문을_노출하지_않는다() throws Exception {
        doAnswer(invocation -> {
            rolledBack(invocation);
            throw new DataIntegrityViolationException("fixture-private-social-id");
        }).doAnswer(this::created).when(persistence).create(any(), any(), any());
        when(persistence.conflict(any(), anyString())).thenReturn(UserOnboardingException.Error.NICKNAME_TAKEN);
        String token = issue();

        MvcResult result = onboard(token, session, "미지", "MALE").andExpect(status().isConflict()).andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private-social-id", token);
        verify(persistence).conflict(any(), anyString());
        onboard(token, null, "새미지", "MALE").andExpect(status().isCreated());
    }

    @Test
    void 닉네임_예외라도_롤백_확인이_없으면_재시도를_허용하지_않는다() throws Exception {
        doThrow(new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN))
                .when(persistence).create(any(), any(), any());
        String token = issue();
        onboard(token, null, "미지", "MALE").andExpect(status().isServiceUnavailable());
        onboard(token, null, "새미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 롤백은_확인되어도_중복_원인_조회_실패는_토큰을_재활성화하지_않는다() throws Exception {
        doAnswer(invocation -> {
            rolledBack(invocation);
            throw new DataIntegrityViolationException("fixture-private");
        }).when(persistence).create(any(), any(), any());
        when(persistence.conflict(any(), anyString()))
                .thenThrow(new DataAccessResourceFailureException("fixture-private"));
        String token = issue();
        onboard(token, null, "미지", "MALE").andExpect(status().isServiceUnavailable());
        onboard(token, null, "새미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 저장_실패와_DB_비활성은_503이며_코드와_토큰을_복원하지_않는다() throws Exception {
        doThrow(new DataAccessResourceFailureException("fixture-private-store"))
                .when(persistence).create(any(), any(), any());
        String token = issue();

        MvcResult result = onboard(token, session, "미지", "MALE").andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private-store", "accessToken");
        onboard(token, session, "미지", "MALE").andExpect(status().isUnauthorized());
        mvc = mvc(null, false);
        String noDb = issue();
        onboard(noDb, session, "미지", "MALE").andExpect(status().isServiceUnavailable());
        onboard(noDb, session, "미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 안전하지_않은_쿠키_설정은_가입_전_실패하고_소비한_토큰을_복원하지_않는다() throws Exception {
        mvc = mvc(persistence, true);
        String token = issue();
        onboard(token, session, "미지", "MALE").andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(persistence);
        onboard(token, session, "미지", "MALE").andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"transaction", "integrity", "rollback"})
    void 커밋_결과_불명이나_롤백_실패시_성공_응답과_쿠키와_재활성화가_없다(String failure) throws Exception {
        UserRepository users = mock(UserRepository.class);
        when(users.saveAndFlush(any())).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            ReflectionTestUtils.setField(user, "id", 42L);
            return user;
        });
        AuthExchangePersistenceService issuer = mock(AuthExchangePersistenceService.class);
        String accessToken = jwt.issue(42);
        when(issuer.issueForNewUser(any())).thenReturn(
                new AuthExchangePersistenceService.Credentials(accessToken, "rt_fixture_private"));
        UserOnboardingPersistenceService target = new UserOnboardingPersistenceService(users, issuer);
        if (failure.equals("rollback")) {
            when(users.existsByNickname(anyString())).thenReturn(true);
        }
        PlatformTransactionManager manager = new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() {
                return new Object();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) {
            }

            @Override
            protected void doCommit(DefaultTransactionStatus status) {
                if (failure.equals("integrity")) {
                    throw new DataIntegrityViolationException("fixture-private-commit");
                }
                throw new TransactionSystemException("fixture-private-commit");
            }

            @Override
            protected void doRollback(DefaultTransactionStatus status) {
                throw new TransactionSystemException("fixture-private-rollback");
            }
        };
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        mvc = mvc((UserOnboardingPersistenceService) proxy.getProxy(), false);
        String token = issue();

        MvcResult result = onboard(token, session, "미지", "MALE").andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("accessToken", "fixture-private-commit");
        if (!failure.equals("rollback")) {
            verify(issuer).issueForNewUser(any());
        }
        onboard(token, session, "미지", "MALE").andExpect(status().isUnauthorized());
    }

    @Test
    void 같은_온보딩_토큰의_동시요청은_한_번만_가입한다() throws Exception {
        String token = issue();
        List<Callable<Integer>> calls = IntStream.range(0, 8).mapToObj(index -> (Callable<Integer>) () ->
                onboard(token, session, "미지", "MALE").andReturn().getResponse().getStatus()).toList();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var results = executor.invokeAll(calls);
            int created = 0;
            int denied = 0;
            for (var result : results) {
                int code = result.get();
                created += code == 201 ? 1 : 0;
                denied += code == 401 ? 1 : 0;
            }
            assertThat(created).isEqualTo(1);
            assertThat(denied).isEqualTo(7);
        }
        verify(persistence).create(any(), any(), any());
    }

    @Test
    void Origin과_preflight를_제한하고_거절시_토큰을_보존한다() throws Exception {
        String token = issue();
        String body = "{\"nickname\":\"미지\",\"characterGender\":\"MALE\"}";
        mvc.perform(post("/api/v1/users/onboarding").session(session).header("Authorization", "Bearer " + token)
                        .header("Origin", "https://attacker.example.test").contentType(MediaType.APPLICATION_JSON)
                        .content(body)).andExpect(status().isForbidden());
        assertTokenValid(token);
        mvc.perform(options("/api/v1/users/onboarding").header("Origin", "https://front.example.test")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Access-Control-Allow-Headers", "Content-Type, Authorization"));
        mvc.perform(options("/api/v1/users/onboarding").header("Origin", "https://front.example.test")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "x-debug-auth"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/users/onboarding").session(session).header("Authorization", "Bearer " + token)
                        .header("Origin", "https://front.example.test").contentType(MediaType.APPLICATION_JSON)
                        .content(body)).andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://front.example.test"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    private String issue() {
        return tokens.issue(new OAuthIdentity(OAuthProvider.SSAFY, "fixture-verified-social"));
    }

    private UserOnboardingPersistenceService.CreatedMember created(InvocationOnMock invocation) {
        UserOnboardingRequest input = invocation.getArgument(1);
        UserOnboardingPersistenceService.TransactionOutcome outcome = invocation.getArgument(2);
        outcome.afterCompletion(TransactionSynchronization.STATUS_COMMITTED);
        return new UserOnboardingPersistenceService.CreatedMember(new UserOnboardingResponse(42,
                input.nickname(), input.characterGender(), jwt.issue(42)), "rt_fixture_private");
    }

    private void rolledBack(InvocationOnMock invocation) {
        UserOnboardingPersistenceService.TransactionOutcome outcome = invocation.getArgument(2);
        outcome.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
    }

    private void assertTokenValid(String token) {
        assertThat(tokens.verify(token).provider()).isEqualTo(OAuthProvider.SSAFY);
    }

    private ResultActions onboard(String token, MockHttpSession requestSession, String nickname, String gender)
            throws Exception {
        var request = post("/api/v1/users/onboarding")
                .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("nickname", nickname, "characterGender", gender)));
        if (requestSession != null) {
            request.session(requestSession);
        }
        return mvc.perform(request);
    }

    private MockMvc mvc(UserOnboardingPersistenceService creator, boolean production) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        if (creator != null) {
            beans.addBean("creator", creator);
        }
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(production ? "prod" : "local");
        AuthTokenProperties properties = new AuthTokenProperties("", "ontop",
                List.of("https://front.example.test"),
                new AuthTokenProperties.RefreshCookie(false, "Lax", "/api/v1/auth"));
        UserOnboardingService service = new UserOnboardingService(tokens,
                beans.getBeanProvider(UserOnboardingPersistenceService.class),
                new RefreshCookieService(properties, environment));
        return MockMvcBuilders.standaloneSetup(new UserOnboardingController(service))
                .setControllerAdvice(new UserOnboardingExceptionHandler())
                .addFilters(new UserOnboardingOriginFilter(
                        new AuthExchangeOriginPolicy(properties, environment), mapper))
                .build();
    }
}
