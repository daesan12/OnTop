package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.OAuthStateStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static com.ssafy.ontop.auth.domain.OAuthProvider.NAVER;
import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("local")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ontop.oauth.naver.client-id=naver-test-client")
@Import(NaverSessionRoundTripTests.CallbackTestConfiguration.class)
class NaverSessionRoundTripTests {

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper mapper;

    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    @Test
    void 인가_응답의_쿠키로_callback에서_동일_세션을_찾고_state를_소비한다() throws Exception {
        AuthorizationAttempt attempt = authorize();

        JsonNode result = callback(attempt.cookie(), attempt.state());

        assertResult(result, true, true);
    }

    @Test
    void 동일_세션에서도_이미_소비한_state를_재사용할_수_없다() throws Exception {
        AuthorizationAttempt attempt = authorize();
        assertResult(callback(attempt.cookie(), attempt.state()), true, true);

        JsonNode replay = callback(attempt.cookie(), attempt.state());

        assertResult(replay, true, false);
    }

    @Test
    void 다른_유효한_세션은_원래_세션의_state를_소비할_수_없다() throws Exception {
        AuthorizationAttempt original = authorize();
        AuthorizationAttempt other = authorize();

        JsonNode wrongSession = callback(other.cookie(), original.state());

        assertResult(wrongSession, true, false);
        assertResult(callback(original.cookie(), original.state()), true, true);
        assertResult(callback(other.cookie(), other.state()), true, true);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "JSESSIONID=unknown-test-session"})
    void 세션_쿠키가_없거나_유효하지_않으면_새_세션_없이_거절한다(String cookie) throws Exception {
        AuthorizationAttempt original = authorize();

        JsonNode result = callback(cookie, original.state());

        assertResult(result, false, false);
        assertResult(callback(original.cookie(), original.state()), true, true);
    }

    @Test
    void 형식이_정상인_다른_state는_거절하고_원래_state는_보존한다() throws Exception {
        AuthorizationAttempt attempt = authorize();
        String wrongState = (attempt.state().startsWith("A") ? "B" : "A") + attempt.state().substring(1);

        JsonNode result = callback(attempt.cookie(), wrongState);

        assertResult(result, true, false);
        assertResult(callback(attempt.cookie(), attempt.state()), true, true);
    }

    private AuthorizationAttempt authorize() throws Exception {
        HttpResponse<Void> response = http.send(HttpRequest.newBuilder(
                        URI.create("http://localhost:" + port + "/api/v1/auth/naver/authorize")).GET().build(),
                HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(302);

        HttpCookie cookie = response.headers().allValues(HttpHeaders.SET_COOKIE).stream()
                .flatMap(value -> HttpCookie.parse(value).stream())
                .filter(value -> "JSESSIONID".equals(value.getName()))
                .findFirst().orElseThrow(() -> new IllegalStateException("테스트 응답에 세션 쿠키가 없습니다."));
        assertThat(cookie.getPath()).isEqualTo("/api/v1/auth");
        URI location = URI.create(response.headers().firstValue(HttpHeaders.LOCATION).orElseThrow());
        String state = Arrays.stream(location.getRawQuery().split("&"))
                .map(pair -> pair.split("=", 2))
                .filter(pair -> "state".equals(pair[0]))
                .map(pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8))
                .findFirst().orElseThrow(() -> new IllegalStateException("테스트 응답에 state가 없습니다."));
        return new AuthorizationAttempt(cookie.getName() + "=" + cookie.getValue(), state);
    }

    private JsonNode callback(String cookie, String state) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(
                "http://localhost:" + port + "/api/v1/auth/naver/state-test-callback?state="
                        + URLEncoder.encode(state, StandardCharsets.UTF_8))).GET();
        if (!cookie.isEmpty()) {
            request.header(HttpHeaders.COOKIE, cookie);
        }

        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE)).isEmpty();
        return mapper.readTree(response.body());
    }

    private void assertResult(JsonNode result, boolean sessionPresent, boolean consumed) {
        assertThat(result.path("sessionPresent").isBoolean()).isTrue();
        assertThat(result.path("requestedSessionMatches").isBoolean()).isTrue();
        assertThat(result.path("consumed").isBoolean()).isTrue();
        assertThat(result.path("sessionPresent").asBoolean()).isEqualTo(sessionPresent);
        assertThat(result.path("requestedSessionMatches").asBoolean()).isEqualTo(sessionPresent);
        assertThat(result.path("consumed").asBoolean()).isEqualTo(consumed);
    }

    private record AuthorizationAttempt(String cookie, String state) {
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class CallbackTestConfiguration {

        @Bean
        @org.springframework.core.annotation.Order(0)
        org.springframework.security.web.SecurityFilterChain probeChain(
                org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
            return http.securityMatcher("/api/v1/auth/naver/state-test-callback")
                    .csrf(csrf -> csrf.disable()).requestCache(cache -> cache.disable())
                    .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll()).build();
        }

        @Bean
        CallbackProbeController callbackProbeController(OAuthStateStore stateStore) {
            return new CallbackProbeController(stateStore);
        }
    }

    // 이 테스트에서만 명시적으로 등록한다. 다른 테스트와 운영 컴포넌트 스캔에서 제외한다.
    @TestComponent
    @RestController
    static class CallbackProbeController {

        private final OAuthStateStore stateStore;

        CallbackProbeController(OAuthStateStore stateStore) {
            this.stateStore = stateStore;
        }

        @GetMapping("/api/v1/auth/naver/state-test-callback")
        public CallbackProbeResponse receive(HttpServletRequest request, @RequestParam String state) {
            HttpSession session = request.getSession(false);
            boolean requestedSessionMatches = session != null
                    && session.getId().equals(request.getRequestedSessionId());
            return new CallbackProbeResponse(session != null, requestedSessionMatches,
                    stateStore.consume(request, NAVER, state));
        }
    }

    record CallbackProbeResponse(boolean sessionPresent, boolean requestedSessionMatches, boolean consumed) {
    }
}
