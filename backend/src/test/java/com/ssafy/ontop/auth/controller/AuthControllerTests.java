package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.service.AuthAuthorizeService;
import com.ssafy.ontop.auth.service.NaverStateStore;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTests {

    private static final String SSAFY_CALLBACK = "http://localhost:8080/api/v1/auth/ssafy/callback";
    private static final String NAVER_CALLBACK = "http://localhost:8080/api/v1/auth/naver/callback";
    private static final String SSAFY_CLIENT_ID = "ssafy+client /?&=한글";

    private NaverStateStore stateStore;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        stateStore = new NaverStateStore();
        mvc = mvc(new OAuthProperties(
                new OAuthProperties.Client(SSAFY_CLIENT_ID, SSAFY_CALLBACK),
                new OAuthProperties.Client("naver-test-client", NAVER_CALLBACK)), "local");
    }

    @Test
    void SSAFY는_정확한_인가주소와_세_파라미터로_302_응답한다() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/auth/ssafy/authorize"))
                .andExpect(status().isFound())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(content().string(""))
                .andReturn();

        URI location = location(result);
        assertThat(location.getScheme()).isEqualTo("https");
        assertThat(location.getHost()).isEqualTo("project.ssafy.com");
        assertThat(location.getPath()).isEqualTo("/oauth/sso-check");
        assertThat(query(location)).containsExactlyInAnyOrderEntriesOf(Map.of(
                "client_id", SSAFY_CLIENT_ID, "redirect_uri", SSAFY_CALLBACK, "response_type", "code"));
        assertThat(location.getRawQuery()).contains("%2B", "%26", "%3D", "%20", "%ED%95%9C");
        assertThat(result.getRequest().getSession(false)).isNull();
    }

    @Test
    void NAVER는_302_응답하며_서버_세션에_난수_state를_보관한다() throws Exception {
        MvcResult first = mvc.perform(get("/api/v1/auth/naver/authorize"))
                .andExpect(status().isFound()).andReturn();
        MvcResult second = mvc.perform(get("/api/v1/auth/naver/authorize"))
                .andExpect(status().isFound()).andReturn();

        URI location = location(first);
        Map<String, String> query = query(location);
        String state = query.get("state");
        assertThat(location.getScheme()).isEqualTo("https");
        assertThat(location.getHost()).isEqualTo("nid.naver.com");
        assertThat(location.getPath()).isEqualTo("/oauth2.0/authorize");
        assertThat(query).hasSize(4).containsEntry("client_id", "naver-test-client")
                .containsEntry("response_type", "code").containsEntry("redirect_uri", NAVER_CALLBACK);
        assertThat(state).matches("[A-Za-z0-9_-]{43}").isNotEqualTo(query(location(second)).get("state"));
        assertThat(first.getRequest().getSession(false)).isNotNull();
        assertThat(stateStore.consume(new MockHttpServletRequest(), state)).isFalse();
        assertThat(stateStore.consume(first.getRequest(), state)).isTrue();
        assertThat(stateStore.consume(first.getRequest(), state)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"google", "SSAFY", "NAVER", "unknown"})
    void 허용하지_않는_provider는_JSON_400으로_응답한다(String provider) throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/auth/{provider}/authorize", provider)
                        .accept(MediaType.TEXT_HTML))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("AUTH_UNSUPPORTED_PROVIDER"))
                .andExpect(header().doesNotExist("Location"))
                .andReturn();

        assertThat(result.getRequest().getSession(false)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ssafy", "naver"})
    void 요청_파라미터로_인가주소와_등록_callback과_state를_바꿀_수_없다(String provider) throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/auth/{provider}/authorize", provider)
                        .param("redirect_uri", "https://attacker.invalid/callback")
                        .param("returnUrl", "https://attacker.invalid")
                        .param("client_id", "attacker-client")
                        .param("response_type", "token")
                        .param("state", "attacker-state"))
                .andExpect(status().isFound()).andReturn();

        Map<String, String> query = query(location(result));
        assertThat(query).containsEntry("redirect_uri", "ssafy".equals(provider) ? SSAFY_CALLBACK : NAVER_CALLBACK)
                .containsEntry("response_type", "code").doesNotContainKey("returnUrl");
        assertThat(location(result).toString()).doesNotContain("attacker");
    }

    @ParameterizedTest
    @MethodSource("invalidClients")
    void 필수_설정_누락이나_잘못된_URI는_설정값_노출_없이_JSON_500으로_실패한다(
            OAuthProperties.Client client) throws Exception {
        mvc = mvc(new OAuthProperties(client, client), "local");

        MvcResult result = mvc.perform(get("/api/v1/auth/naver/authorize"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().doesNotExist("Location"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json("""
                        {"code":"AUTH_CONFIGURATION_ERROR","message":"소셜 로그인 설정을 확인해 주세요."}
                        """))
                .andReturn();

        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("private-config", "stackTrace");
    }

    @Test
    void 인가_API는_POST를_제공하지_않는다() throws Exception {
        mvc.perform(post("/api/v1/auth/naver/authorize")).andExpect(status().isMethodNotAllowed());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ssafy", "naver"})
    void 기본_프로필에서_HTTP_callback은_기존_JSON_500_계약으로_거절한다(String provider) throws Exception {
        mvc = mvc(new OAuthProperties(
                new OAuthProperties.Client("ssafy-test-client", SSAFY_CALLBACK),
                new OAuthProperties.Client("naver-test-client", NAVER_CALLBACK)));

        MvcResult result = mvc.perform(get("/api/v1/auth/{provider}/authorize", provider))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().doesNotExist("Location"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json("""
                        {"code":"AUTH_CONFIGURATION_ERROR","message":"소셜 로그인 설정을 확인해 주세요."}
                        """))
                .andReturn();

        assertThat(result.getRequest().getSession(false)).isNull();
    }

    private MockMvc mvc(OAuthProperties properties, String... profiles) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        return MockMvcBuilders.standaloneSetup(
                        new AuthController(new AuthAuthorizeService(properties, stateStore, environment)))
                .setControllerAdvice(new AuthExceptionHandler()).build();
    }

    private URI location(MvcResult result) {
        return URI.create(result.getResponse().getHeader("Location"));
    }

    private Map<String, String> query(URI uri) {
        return Arrays.stream(uri.getRawQuery().split("&"))
                .map(pair -> pair.split("=", 2))
                .collect(Collectors.toMap(pair -> decode(pair[0]), pair -> decode(pair[1])));
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static Stream<Arguments> invalidClients() {
        return Stream.of(
                Arguments.of((OAuthProperties.Client) null),
                Arguments.of(new OAuthProperties.Client(null, NAVER_CALLBACK)),
                Arguments.of(new OAuthProperties.Client("  ", NAVER_CALLBACK)),
                Arguments.of(new OAuthProperties.Client("private-config\n", NAVER_CALLBACK)),
                Arguments.of(new OAuthProperties.Client("private-config", null)),
                Arguments.of(new OAuthProperties.Client("private-config", "")),
                Arguments.of(new OAuthProperties.Client("private-config", "not a uri private-config")),
                Arguments.of(new OAuthProperties.Client("private-config", "http:///api/v1/auth/naver/callback")),
                Arguments.of(new OAuthProperties.Client("private-config", "http://example.test/api/v1/auth/naver/callback")),
                Arguments.of(new OAuthProperties.Client("private-config", "https://example.test/api/v1/auth/ssafy/callback")),
                Arguments.of(new OAuthProperties.Client("private-config", NAVER_CALLBACK + "?returnUrl=private-config")),
                Arguments.of(new OAuthProperties.Client("private-config", NAVER_CALLBACK + "#private-config")),
                Arguments.of(new OAuthProperties.Client("private-config",
                        "https://user:private-config@example.test/api/v1/auth/naver/callback")),
                Arguments.of(new OAuthProperties.Client("private-config",
                        "https://example.test:99999/api/v1/auth/naver/callback")));
    }
}
