package com.ssafy.ontop.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "springdoc.api-docs.enabled=true", "springdoc.swagger-ui.enabled=true"})
@ActiveProfiles({"dev", "production"})
class OpenApiProductionOverrideTests {

    @LocalServerPort
    private int port;

    @Test
    void 운영_혼합_프로필은_외부_활성화_설정이_있어도_문서_접근을_차단한다() throws Exception {
        var client = HttpClient.newHttpClient();
        for (String path : new String[]{"/swagger-ui/index.html", "/v3/api-docs", "/v3/api-docs.yaml",
                "/webjars/swagger-ui/swagger-ui-bundle.js"}) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("Authorization", "Bearer invalid-documentation-header").GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(401);
        }
    }
}
