package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.service.AccessJwtService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class StoneRumbleParkApplicationTests {
    @Test
    void 스프링_프로퍼티가_true이면_QA_세션을_발급한다() throws Exception {
        var environment = new MockEnvironment().withProperty("ontop.qa-feedback.enabled", "true");
        var request = request("POST", "/api/v1/qa/session");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter(environment).doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(new ObjectMapper().readTree(response.getContentAsString()).path("exchangeCode").asText())
                .isNotBlank();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = "false")
    void QA_프로퍼티가_없거나_false이면_다음_필터로_넘긴다(String enabled) throws Exception {
        var environment = new MockEnvironment();
        if (enabled != null) {
            environment.setProperty("ontop.qa-feedback.enabled", enabled);
        }
        var request = request("POST", "/api/v1/qa/session");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter(environment).doFilter(request, response, chain);

        assertThat(chain.getRequest()).isSameAs(request);
        assertThat(response.getContentAsString()).isEmpty();
    }

    @Test
    void QA_활성화와_관계없이_기존_DEV_세션은_유지한다() throws Exception {
        var request = request("POST", "/dev/stone-rumble-park/session");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter(new MockEnvironment()).doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(new ObjectMapper().readTree(response.getContentAsString()).path("exchangeCode").asText())
                .isNotBlank();
    }

    @Test
    void QA_세션은_POST_요청만_처리한다() throws Exception {
        var environment = new MockEnvironment().withProperty("ontop.qa-feedback.enabled", "true");
        var request = request("GET", "/api/v1/qa/session");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter(environment).doFilter(request, response, chain);

        assertThat(chain.getRequest()).isSameAs(request);
        assertThat(response.getContentAsString()).isEmpty();
    }

    @Test
    void QA_세션도_허용되지_않은_Origin은_거절한다() throws Exception {
        var environment = new MockEnvironment().withProperty("ontop.qa-feedback.enabled", "true");
        var request = request("POST", "/api/v1/qa/session");
        request.addHeader("Origin", "https://untrusted.example");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter(environment).doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).isEmpty();
    }

    private static OncePerRequestFilter filter(MockEnvironment environment) {
        var properties = new AuthTokenProperties("", "ontop", List.of("http://127.0.0.1:5512"), null);
        var ledger = new StoneRumbleParkApplication.LocalLedger(event -> { });
        return new StoneRumbleParkApplication.Fixture().stoneRumbleFixtureHttp(mock(AccessJwtService.class),
                mock(AccessAuthenticationService.class), new ObjectMapper(), properties, ledger, environment)
                .getFilter();
    }

    private static MockHttpServletRequest request(String method, String path) {
        var request = new MockHttpServletRequest(method, path);
        request.setContentType("application/json");
        request.setContent("{\"role\":\"1\"}".getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
