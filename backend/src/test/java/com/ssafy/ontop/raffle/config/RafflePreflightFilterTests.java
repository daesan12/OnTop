package com.ssafy.ontop.raffle.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RafflePreflightFilterTests {
    private AuthExchangeOriginPolicy origins;
    private RafflePreflightFilter filter;

    @BeforeEach
    void setUp() {
        origins = mock(AuthExchangeOriginPolicy.class);
        filter = new RafflePreflightFilter(origins, new ObjectMapper());
    }

    @Test
    void 구매_사전요청은_응모권_경로에서만_멱등헤더를_허용한다() throws Exception {
        when(origins.allowedOrigin(any())).thenReturn("https://dev.on-top.world");
        var request = request("/api/v1/raffles/current/tickets");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(204);
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo("https://dev.on-top.world");
        assertThat(response.getHeader("Access-Control-Allow-Headers")).containsIgnoringCase("Idempotency-Key");
        verifyNoInteractions(chain);
    }

    @Test
    void 다른_REST의_사전요청은_공통_보안체인으로_넘긴다() throws Exception {
        var request = request("/api/v1/users/me");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(origins);
    }

    private MockHttpServletRequest request(String path) {
        var request = new MockHttpServletRequest("OPTIONS", path);
        request.addHeader("Origin", "https://dev.on-top.world");
        request.addHeader("Access-Control-Request-Method", "POST");
        request.addHeader("Access-Control-Request-Headers", "Authorization,Content-Type,Idempotency-Key");
        return request;
    }
}
