package com.ssafy.ontop.world.fitness;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.auth.service.AccessJwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=local")
@Import(RestSecurityTestSupport.class)
class FitnessRewardHttpTests {
    private static final String PATH = "/api/v1/world/fitness/rewards/status";
    @Autowired private TestRestTemplate http;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private FitnessRewardService service;

    @Test
    void 인증된_본인수입만_조회하고_캐시하지_않는다() {
        RestSecurityTestSupport.authenticate(http, jwt);
        when(service.status(42)).thenReturn(new FitnessRewardStatusResponse(true, "2026-11-03", 29,
                300, 60, 100_000, 137_000L, "own-lease"));

        var response = http.getForEntity(PATH + "?userId=999", JsonNode.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody().path("todayEarned").asLong()).isEqualTo(29);
        assertThat(response.getBody().path("nextRewardAt").asLong()).isEqualTo(137_000);
        verify(service).status(42);
    }

    @Test
    void 미인증_조회는_수입을_노출하지_않는다() {
        http.getRestTemplate().setInterceptors(java.util.List.of());

        var response = http.getForEntity(PATH, JsonNode.class);

        assertThat(response.getStatusCode().value()).isEqualTo(401);
        verify(service, never()).status(anyLong());
    }
}
