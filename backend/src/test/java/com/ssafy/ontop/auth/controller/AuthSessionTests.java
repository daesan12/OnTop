package com.ssafy.ontop.auth.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.oauth.ssafy.client-id=ssafy-test-client",
        "ontop.oauth.ssafy.redirect-uri=https://backend.example.test/api/v1/auth/ssafy/callback",
        "ontop.oauth.naver.client-id=naver-test-client",
        "ontop.oauth.naver.redirect-uri=https://backend.example.test/api/v1/auth/naver/callback"
})
class AuthSessionTests {

    @LocalServerPort
    private int port;

    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    @Test
    void NAVER_세션_쿠키는_HttpOnly_Secure_SameSite_Lax이며_AUTH_경로로_제한된다() throws Exception {
        HttpResponse<Void> response = get("/api/v1/auth/naver/authorize");

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().allValues("Set-Cookie")).singleElement().asString()
                .contains("JSESSIONID=", "HttpOnly", "Secure", "SameSite=Lax", "Path=/api/v1/auth")
                .doesNotContain("Domain=");
        assertThat(response.headers().firstValue("Location")).get().asString()
                .startsWith("https://nid.naver.com/oauth2.0/authorize?").doesNotContain("jsessionid");
    }

    @Test
    void SSAFY_리다이렉트에는_불필요한_세션_쿠키를_만들지_않는다() throws Exception {
        HttpResponse<Void> response = get("/api/v1/auth/ssafy/authorize");

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().allValues("Set-Cookie")).isEmpty();
    }

    @Test
    void 두_provider의_callback과_로그아웃은_아직_제공하지_않는다() throws Exception {
        assertThat(get("/api/v1/auth/ssafy/callback").statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/auth/naver/callback").statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/auth/logout").statusCode()).isEqualTo(404);
    }

    private HttpResponse<Void> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.discarding());
    }
}
