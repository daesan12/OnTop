package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.config.OAuthClientSettings;
import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.auth.service.AuthAuthorizeService;
import com.ssafy.ontop.auth.service.AuthCallbackService;
import com.ssafy.ontop.auth.service.AuthUserStateService;
import com.ssafy.ontop.auth.service.OAuthExchangeStore;
import com.ssafy.ontop.auth.service.OAuthStateStore;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthCallbackControllerTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private Clock clock;
    private OAuthStateStore states;
    private OAuthExchangeStore exchanges;
    private AuthUserStateService users;
    private MockRestServiceServer supplier;
    private OAuthProviderClient client;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        states = new OAuthStateStore(clock);
        exchanges = new OAuthExchangeStore(clock);
        users = mock(AuthUserStateService.class);
        OAuthClientSettings settings = settings("");
        RestClient.Builder builder = RestClient.builder();
        supplier = MockRestServiceServer.bindTo(builder).build();
        client = new OAuthProviderClient(builder.build(), settings, mapper);
        when(users.resolve(any())).thenAnswer(invocation -> {
            OAuthIdentity identity = invocation.getArgument(0);
            return new LoginOutcome(identity.provider(), LoginOutcome.Status.NEW_MEMBER,
                    null, identity.providerUserId());
        });
        mvc = mvc(settings, true);
    }

    @ParameterizedTest
    @EnumSource(OAuthProvider.class)
    void 공급자_성공_응답은_검증된_식별자를_서버에_보관하고_교환_코드만_반환한다(OAuthProvider provider) throws Exception {
        Attempt attempt = authorize(provider);
        expectSuccess(provider, attempt.state());

        MvcResult result = callback(provider, attempt).andExpect(status().isOk()).andReturn();

        assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.path("expiresIn").asInt()).isEqualTo(60);
        String exchange = body.path("exchangeCode").asText();
        assertThat(exchange).matches("[A-Za-z0-9_-]{43}");
        assertThat(result.getResponse().getContentAsString()).doesNotContain(
                "fixture-oauth-access", "fixture-secret", "fixture-code", "access_token", "refresh_token", "userId");
        LoginOutcome stored = exchanges.consume(result.getRequest(), exchange).orElseThrow();
        assertThat(stored.provider()).isEqualTo(provider);
        assertThat(stored.status()).isEqualTo(LoginOutcome.Status.NEW_MEMBER);
        assertThat(stored.userId()).isNull();
        assertThat(stored.providerUserId()).isEqualTo("verified-id");
        assertThat(exchanges.consume(result.getRequest(), exchange)).isEmpty();
        supplier.verify();
    }

    @ParameterizedTest
    @EnumSource(LoginOutcome.Status.class)
    void 회원_상태와_기존_ID는_교환_코드에만_연계한다(LoginOutcome.Status status) throws Exception {
        Attempt attempt = authorize(OAuthProvider.SSAFY);
        expectSuccess(OAuthProvider.SSAFY, attempt.state());
        doReturn(new LoginOutcome(OAuthProvider.SSAFY, status,
                status == LoginOutcome.Status.NEW_MEMBER ? null : 123L,
                status == LoginOutcome.Status.NEW_MEMBER ? "verified-id" : null)).when(users).resolve(any());

        MvcResult result = callback(OAuthProvider.SSAFY, attempt).andExpect(status().isOk()).andReturn();

        String code = mapper.readTree(result.getResponse().getContentAsString()).path("exchangeCode").asText();
        assertThat(exchanges.consume(result.getRequest(), code).orElseThrow().status()).isEqualTo(status);
        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.has("userId") || body.has("providerUserId") || body.has("status")).isFalse();
        supplier.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "forged", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"})
    void 위조_state는_공급자를_호출하지_않는다(String state) throws Exception {
        Attempt attempt = authorize(OAuthProvider.SSAFY);

        callback(OAuthProvider.SSAFY, new Attempt(attempt.session(), state))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_STATE"));

        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void 누락_state와_미지원_provider는_공급자를_호출하지_않는다() throws Exception {
        mvc.perform(get("/api/v1/auth/ssafy/callback").param("code", "fixture-code"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_STATE"));
        mvc.perform(get("/api/v1/auth/google/callback"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_UNSUPPORTED_PROVIDER"));
        supplier.verify();
    }

    @Test
    void 만료_state와_다른_세션과_다른_provider는_거절한다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.SSAFY);

        callback(OAuthProvider.NAVER, attempt).andExpect(status().isBadRequest());
        callback(OAuthProvider.SSAFY, new Attempt(new MockHttpSession(), attempt.state()))
                .andExpect(status().isBadRequest());
        when(clock.instant()).thenReturn(START.plusSeconds(300));
        callback(OAuthProvider.SSAFY, attempt).andExpect(status().isBadRequest());

        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void 성공_callback의_state는_다시_사용하지_못한다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.NAVER);
        expectSuccess(OAuthProvider.NAVER, attempt.state());
        callback(OAuthProvider.NAVER, attempt).andExpect(status().isOk());

        callback(OAuthProvider.NAVER, attempt).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AUTH_INVALID_STATE"));
        supplier.verify();
    }

    @Test
    void 공급자_오류도_state를_소비하고_오류_원문은_노출하지_않는다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.NAVER);

        MvcResult result = mvc.perform(get("/api/v1/auth/naver/callback").session(attempt.session())
                        .param("state", attempt.state()).param("error", "access_denied")
                        .param("error_description", "private-provider-detail"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_PROVIDER_DENIED"))
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("private-provider-detail");
        callback(OAuthProvider.NAVER, attempt).andExpect(status().isBadRequest());
        supplier.verify();
    }

    @Test
    void 토큰_교환_실패와_프로필_실패를_구분하고_원문을_노출하지_않는다() throws Exception {
        Attempt first = authorize(OAuthProvider.SSAFY);
        supplier.expect(requestTo(OAuthProvider.SSAFY.tokenEndpoint()))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("private-token-detail"));
        MvcResult failure = callback(OAuthProvider.SSAFY, first).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_EXCHANGE_FAILED")).andReturn();
        assertThat(failure.getResponse().getContentAsString()).doesNotContain("private-token-detail");
        supplier.verify();
        supplier.reset();
        Attempt second = authorize(OAuthProvider.NAVER);
        expectToken(OAuthProvider.NAVER, second.state());
        supplier.expect(requestTo(OAuthProvider.NAVER.profileEndpoint()))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("private-profile-detail"));

        callback(OAuthProvider.NAVER, second).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AUTH_PROFILE_FAILED"));
        supplier.verify();
    }

    @Test
    void 잘못된_JSON이나_식별자_없는_프로필을_거절한다() throws Exception {
        Attempt first = authorize(OAuthProvider.SSAFY);
        supplier.expect(requestTo(OAuthProvider.SSAFY.tokenEndpoint()))
                .andRespond(withSuccess("{", MediaType.APPLICATION_JSON));
        callback(OAuthProvider.SSAFY, first).andExpect(status().isBadGateway());
        supplier.verify();
        supplier.reset();
        Attempt second = authorize(OAuthProvider.SSAFY);
        expectToken(OAuthProvider.SSAFY, second.state());
        supplier.expect(requestTo(OAuthProvider.SSAFY.profileEndpoint()))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        callback(OAuthProvider.SSAFY, second).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AUTH_PROFILE_FAILED"));
        supplier.verify();
    }

    @Test
    void 재가입_보류는_409이며_교환_코드를_발급하지_않는다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.SSAFY);
        expectSuccess(OAuthProvider.SSAFY, attempt.state());
        doThrow(new AuthCallbackException(AuthCallbackException.Error.REJOIN_PENDING)).when(users).resolve(any());

        callback(OAuthProvider.SSAFY, attempt).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AUTH_REJOIN_PENDING"))
                .andExpect(jsonPath("$.exchangeCode").doesNotExist());
        supplier.verify();
    }

    @Test
    void DB가_없으면_신규회원으로_가정하지_않고_공급자_호출_전에_실패한다() throws Exception {
        mvc = mvc(settings(""), false);
        Attempt attempt = authorize(OAuthProvider.SSAFY);

        callback(OAuthProvider.SSAFY, attempt).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_DATABASE_UNAVAILABLE"));
        supplier.verify();
    }

    @Test
    void 프론트_주소가_있으면_등록된_주소의_fragment에_교환_코드만_전달한다() throws Exception {
        mvc = mvc(settings("https://front.example.test/auth/complete"), true);
        Attempt attempt = authorize(OAuthProvider.SSAFY);
        expectSuccess(OAuthProvider.SSAFY, attempt.state());

        MvcResult result = callback(OAuthProvider.SSAFY, attempt).andExpect(status().isFound()).andReturn();

        URI location = URI.create(result.getResponse().getHeader("Location"));
        assertThat(location.getHost()).isEqualTo("front.example.test");
        assertThat(location.getPath()).isEqualTo("/auth/complete");
        assertThat(location.getRawQuery()).isNull();
        assertThat(location.getFragment()).startsWith("exchange_code=");
        assertThat(result.getResponse().getContentAsString()).isEmpty();
        supplier.verify();
    }

    @Test
    void 잘못된_프론트_설정은_공급자_호출과_회원_복구_전에_거절한다() throws Exception {
        mvc = mvc(settings("https://user:private@example.test/callback"), true);
        Attempt attempt = authorize(OAuthProvider.SSAFY);

        callback(OAuthProvider.SSAFY, attempt).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUTH_CONFIGURATION_ERROR"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void code_누락이나_중복_파라미터는_공급자_호출_없이_거절한다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.NAVER);
        mvc.perform(get("/api/v1/auth/naver/callback").session(attempt.session())
                        .param("state", attempt.state()).param("code", "first", "second"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_CALLBACK"));
        mvc.perform(get("/api/v1/auth/naver/callback").session(attempt.session()).param("state", attempt.state()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTH_INVALID_CALLBACK"));
        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void Client_Secret_누락은_설정_오류이고_공급자를_호출하지_않는다() throws Exception {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        OAuthClientSettings missingSecret = new OAuthClientSettings(new OAuthProperties(
                new OAuthProperties.Client("fixture-ssafy", "http://localhost:8080/api/v1/auth/ssafy/callback", ""),
                null), environment);
        RestClient.Builder builder = RestClient.builder();
        supplier = MockRestServiceServer.bindTo(builder).build();
        client = new OAuthProviderClient(builder.build(), missingSecret, mapper);
        mvc = mvc(settings(""), true);
        Attempt attempt = authorize(OAuthProvider.SSAFY);

        callback(OAuthProvider.SSAFY, attempt).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUTH_CONFIGURATION_ERROR"));

        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void 공급자의_200_오류와_초과_크기_응답도_안전하게_거절한다() throws Exception {
        Attempt first = authorize(OAuthProvider.NAVER);
        supplier.expect(requestTo(OAuthProvider.NAVER.tokenEndpoint())).andRespond(withSuccess(
                "{\"error\":\"invalid_grant\",\"error_description\":\"private-detail\"}", MediaType.APPLICATION_JSON));
        callback(OAuthProvider.NAVER, first).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_EXCHANGE_FAILED"));
        supplier.verify();
        supplier.reset();
        Attempt second = authorize(OAuthProvider.SSAFY);
        supplier.expect(requestTo(OAuthProvider.SSAFY.tokenEndpoint()))
                .andRespond(withSuccess(" ".repeat(65537), MediaType.APPLICATION_JSON));
        callback(OAuthProvider.SSAFY, second).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_EXCHANGE_FAILED"));
        supplier.verify();
        verifyNoInteractions(users);
    }

    @Test
    void DB_실패_원문도_응답에_노출하지_않는다() throws Exception {
        Attempt attempt = authorize(OAuthProvider.SSAFY);
        expectSuccess(OAuthProvider.SSAFY, attempt.state());
        doThrow(new DataAccessResourceFailureException("private-database-detail")).when(users).resolve(any());

        MvcResult result = callback(OAuthProvider.SSAFY, attempt).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_DATABASE_UNAVAILABLE")).andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("private-database-detail");
        supplier.verify();
    }

    private MockMvc mvc(OAuthClientSettings settings, boolean databaseAvailable) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        if (databaseAvailable) {
            beans.addBean("users", users);
        }
        AuthCallbackService callbacks = new AuthCallbackService(states, client,
                beans.getBeanProvider(AuthUserStateService.class), exchanges, settings);
        return MockMvcBuilders.standaloneSetup(new AuthController(new AuthAuthorizeService(settings, states)),
                        new AuthCallbackController(callbacks)).setControllerAdvice(new AuthExceptionHandler()).build();
    }

    private OAuthClientSettings settings(String frontend) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        return new OAuthClientSettings(new OAuthProperties(
                new OAuthProperties.Client("fixture-ssafy", "http://localhost:8080/api/v1/auth/ssafy/callback", "fixture-secret"),
                new OAuthProperties.Client("fixture-naver", "http://localhost:8080/api/v1/auth/naver/callback", "fixture-secret"),
                frontend), environment);
    }

    private Attempt authorize(OAuthProvider provider) throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/auth/{provider}/authorize", provider.path()))
                .andExpect(status().isFound()).andReturn();
        String state = Arrays.stream(URI.create(result.getResponse().getHeader("Location")).getRawQuery().split("&"))
                .map(pair -> pair.split("=", 2)).filter(pair -> pair[0].equals("state"))
                .map(pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8)).findFirst().orElseThrow();
        return new Attempt((MockHttpSession) result.getRequest().getSession(false), state);
    }

    private org.springframework.test.web.servlet.ResultActions callback(OAuthProvider provider, Attempt attempt)
            throws Exception {
        return mvc.perform(get("/api/v1/auth/{provider}/callback", provider.path()).session(attempt.session())
                .param("state", attempt.state()).param("code", "fixture-code"));
    }

    private void expectToken(OAuthProvider provider, String state) {
        supplier.expect(requestTo(provider.tokenEndpoint())).andExpect(method(HttpMethod.POST))
                .andExpect(request -> {
                    assertThat(request.getURI().getRawQuery()).isNull();
                    var expected = new org.springframework.util.LinkedMultiValueMap<String, String>();
                    expected.add("grant_type", "authorization_code");
                    expected.add("client_id", "fixture-" + provider.path());
                    expected.add("client_secret", "fixture-secret");
                    expected.add("redirect_uri", "http://localhost:8080/api/v1/auth/" + provider.path() + "/callback");
                    expected.add("code", "fixture-code");
                    if (provider == OAuthProvider.NAVER) {
                        expected.add("state", state);
                    }
                    org.springframework.test.web.client.match.MockRestRequestMatchers.content().formData(expected)
                            .match(request);
                })
                .andRespond(withSuccess("{\"access_token\":\"fixture-oauth-access\",\"token_type\":\"Bearer\"}",
                        MediaType.APPLICATION_JSON));
    }

    private void expectSuccess(OAuthProvider provider, String state) {
        expectToken(provider, state);
        supplier.expect(requestTo(provider.profileEndpoint())).andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer fixture-oauth-access"))
                .andRespond(withSuccess(provider == OAuthProvider.SSAFY ? "{\"userId\":\"verified-id\"}"
                        : "{\"resultcode\":\"00\",\"response\":{\"id\":\"verified-id\"}}", MediaType.APPLICATION_JSON));
    }

    private record Attempt(MockHttpSession session, String state) {
    }
}
