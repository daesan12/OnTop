package com.ssafy.ontop;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.health.diskspace.enabled=false")
@Import(HealthEndpointTests.Fixture.class)
class HealthEndpointTests {

    @Autowired
    private TestRestTemplate http;
    @Autowired
    private TestHealthIndicator indicator;

    @Test
    void 정상은_인증없이_200과_UP만_반환하고_다른관리API는_노출하지않는다() {
        var response = http.getForEntity("/actuator/health", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().size()).isEqualTo(1);
        assertThat(response.getBody().path("status").asText()).isEqualTo("UP");
        for (String endpoint : new String[]{"env", "configprops", "beans", "metrics"}) {
            assertThat(http.getForEntity("/actuator/" + endpoint, String.class).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Test
    void 장애는_503과_DOWN만_반환하고_내부상세를_숨긴다() {
        indicator.down.set(true);
        try {
            var response = http.getForEntity("/actuator/health", JsonNode.class);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().size()).isEqualTo(1);
            assertThat(response.getBody().path("status").asText()).isEqualTo("DOWN");
        } finally {
            indicator.down.set(false);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        TestHealthIndicator testHealthIndicator() {
            return new TestHealthIndicator();
        }
    }

    static class TestHealthIndicator implements HealthIndicator {
        private final AtomicBoolean down = new AtomicBoolean();

        @Override
        public Health health() {
            return (down.get() ? Health.down() : Health.up())
                    .withDetail("internal", "test-only-marker").build();
        }
    }
}
