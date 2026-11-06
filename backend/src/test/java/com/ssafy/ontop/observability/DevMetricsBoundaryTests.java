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

/** Real HTTP and Actuator; member authentication and DB are outside this fixture. */
@SpringBootTest(classes = DevMetricsBoundaryTests.Fixture.class,
        webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT, properties = "server.port=0")
@AutoConfigureObservability
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@ActiveProfiles({"dev", "observe-dev"})
class DevMetricsBoundaryTests {

    @LocalServerPort
    int applicationPort;

    private final HttpClient client = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void managementPort(DynamicPropertyRegistry properties) {
        // Spring Boot's test customizer otherwise assigns a random management port.
        properties.add("management.server.port", () -> 8082);
    }

    @Test
    void scrapesRealMetricsOnlyOnManagementPort() throws Exception {
        var response = get(8082, "/actuator/prometheus");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("jvm_memory_used_bytes", "process_uptime_seconds");
        assertThat(get(applicationPort, "/actuator/prometheus").statusCode()).isEqualTo(403);
    }

    @Test
    void managementPortDoesNotBypassProtectedRoutes() throws Exception {
        assertThat(get(8082, "/api/v1/protected").statusCode()).isEqualTo(403);
        assertThat(get(applicationPort, "/api/v1/protected").statusCode()).isEqualTo(403);
    }

    @Test
    void healthCheckMovesToManagementPort() throws Exception {
        assertThat(get(8082, "/actuator/health").statusCode()).isEqualTo(200);
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import(DevObservabilityConfiguration.class)
    static class Fixture {

        @Bean
        @Order(1)
        SecurityFilterChain fallback(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(auth -> auth.requestMatchers("/actuator/health").permitAll()
                    .anyRequest().denyAll()).build();
        }
    }
}
