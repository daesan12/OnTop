package com.ssafy.ontop.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;

abstract class OpenApiDisabledTestSupport {

    @LocalServerPort
    int port;
    @Autowired
    Environment environment;
    @Autowired
    RequestMappingHandlerMapping requestMappingHandlerMapping;

    @Test
    void 문서_UI_설정과_HTTP_매핑이_비활성이고_익명_접근도_차단된다() throws Exception {
        assertThat(environment.getProperty("springdoc.api-docs.enabled", Boolean.class)).isFalse();
        assertThat(environment.getProperty("springdoc.swagger-ui.enabled", Boolean.class)).isFalse();
        assertThat(requestMappingHandlerMapping.getHandlerMethods().values())
                .noneMatch(handler -> handler.getBeanType().getName().startsWith("org.springdoc"));
        var client = HttpClient.newHttpClient();
        for (String path : new String[]{"/swagger-ui/index.html", "/v3/api-docs", "/v3/api-docs.yaml",
                "/v3/api-docs/swagger-config", "/webjars/swagger-ui/swagger-ui-bundle.js", "/api/v1/users/me"}) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        }
    }
}
