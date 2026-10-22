package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import java.util.HashMap;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.WebSocketHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class WebSocketOriginPolicyTests {
    @Test
    void 등록목록은_기존_REST의_정규화와_local_루프백_정책을_공유한다() {
        var policy = policy(List.of("https://APP.EXAMPLE:443/", "http://LOCALHOST:8080"), "local");
        assertThat(policy.configuredOrigins()).containsExactly("https://app.example", "http://localhost:8080");
        var request = new MockHttpServletRequest();
        request.addHeader("Origin", "https://app.example");
        assertThat(policy.allowedOrigin(request)).isEqualTo("https://app.example");
        assertThat(policy(null, "dev").configuredOrigins()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"*", "https://*.example", "null", "https://app.example/path",
            "https://app.example?query=1", "https://user@app.example", "http://external.example"})
    void 잘못된_설정은_허용_목록으로_확장되지_않는다(String configured) {
        var policy = policy(List.of(configured), "local");
        assertThatThrownBy(policy::configuredOrigins).isInstanceOf(AuthExchangeException.class);
        var request = new MockHttpServletRequest();
        request.addHeader("Origin", "https://app.example");
        var response = new MockHttpServletResponse();
        assertThat(new WebSocketOriginHandshakeInterceptor(policy).beforeHandshake(
                new ServletServerHttpRequest(request), new ServletServerHttpResponse(response),
                mock(WebSocketHandler.class), new HashMap<>())).isFalse();
        assertThat(response.getStatus()).isEqualTo(500);
    }

    @Test
    void 비local_HTTP와_32개초과_목록도_기존_설정오류로_거절한다() {
        assertThatThrownBy(() -> policy(List.of("http://localhost:8080"), "dev").configuredOrigins())
                .isInstanceOf(AuthExchangeException.class);
        assertThatThrownBy(() -> policy(IntStream.range(0, 33)
                .mapToObj(i -> "https://app" + i + ".example").toList(), "local").configuredOrigins())
                .isInstanceOf(AuthExchangeException.class);
    }

    @Test
    void 중복_Origin헤더와_Origin없는_cross_site는_소비전에_거절한다() {
        var policy = policy(List.of("https://app.example"), "local");
        for (boolean duplicate : List.of(true, false)) {
            var request = new MockHttpServletRequest();
            if (duplicate) {
                request.addHeader("Origin", "https://app.example");
                request.addHeader("Origin", "https://app.example");
            } else {
                request.addHeader("Sec-Fetch-Site", "cross-site");
            }
            var response = new MockHttpServletResponse();
            assertThat(new WebSocketOriginHandshakeInterceptor(policy).beforeHandshake(
                    new ServletServerHttpRequest(request), new ServletServerHttpResponse(response),
                    mock(WebSocketHandler.class), new HashMap<>())).isFalse();
            assertThat(response.getStatus()).isEqualTo(403);
        }
    }

    private AuthExchangeOriginPolicy policy(List<String> origins, String profile) {
        var environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        return new AuthExchangeOriginPolicy(new AuthTokenProperties("", "ontop", origins, null), environment);
    }
}
