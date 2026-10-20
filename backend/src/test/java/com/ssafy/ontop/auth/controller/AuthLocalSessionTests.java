package com.ssafy.ontop.auth.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("local")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ontop.oauth.naver.client-id=naver-test-client")
class AuthLocalSessionTests {

    @LocalServerPort
    private int port;

    @Test
    void local_HTTP에서는_Secure만_해제하고_등록된_로컬_callback을_사용한다() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(
                URI.create("http://localhost:" + port + "/api/v1/auth/naver/authorize")).GET().build();

        HttpResponse<Void> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().allValues("Set-Cookie")).singleElement().asString()
                .contains("HttpOnly", "SameSite=Lax", "Path=/api/v1/auth").doesNotContain("Secure");
        assertThat(response.headers().firstValue("Location")).get().asString()
                .contains("redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fv1%2Fauth%2Fnaver%2Fcallback");
    }
}
