package com.ssafy.ontop.observability;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 HTTP 경계에서 운영 관리 포트가 일반 애플리케이션 포트와 분리되는지 검증한다. */
@SpringBootTest(classes = ProdMetricsBoundaryTests.Fixture.class,
        webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT, properties = "server.port=0")
@AutoConfigureObservability
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@ActiveProfiles({"prod", "observe-prod"})
class ProdMetricsBoundaryTests {

    private static final int MANAGEMENT_PORT = 8082;

    @LocalServerPort
    int applicationPort;

    private final HttpClient client = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void managementPort(DynamicPropertyRegistry properties) {
        properties.add("management.server.port", () -> MANAGEMENT_PORT);
    }

    @Test
    void 운영_메트릭은_관리_포트에서만_조회한다() throws Exception {
        var response = get(MANAGEMENT_PORT, "/actuator/prometheus");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("jvm_memory_used_bytes", "process_uptime_seconds");
        assertThat(get(applicationPort, "/actuator/prometheus").statusCode()).isEqualTo(403);
    }

    @Test
    void 관리_포트는_일반_API를_노출하지_않는다() throws Exception {
        assertThat(get(MANAGEMENT_PORT, "/api/v1/protected").statusCode()).isEqualTo(403);
        assertThat(get(applicationPort, "/api/v1/protected").statusCode()).isEqualTo(403);
    }

    @Test
    void 운영_헬스체크는_관리_포트에서_응답한다() throws Exception {
        assertThat(get(MANAGEMENT_PORT, "/actuator/health").statusCode()).isEqualTo(200);
        assertThat(get(applicationPort, "/actuator/health").statusCode()).isEqualTo(403);
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import(ObservabilityConfiguration.class)
    static class Fixture {

        @Bean
        @Order(1)
        SecurityFilterChain fallback(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(auth -> auth.anyRequest().denyAll()).build();
        }
    }
}
