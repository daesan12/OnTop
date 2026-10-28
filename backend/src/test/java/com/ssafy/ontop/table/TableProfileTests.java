package com.ssafy.ontop.table;

import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.auth.service.AccessJwtService;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=test"
})
@Import(RestSecurityTestSupport.class)
class TableProfileTests {

    @Autowired
    private AccessJwtService jwt;

    @BeforeEach
    void authenticateRest() {
        RestSecurityTestSupport.authenticate(http, jwt);
    }

    @Autowired
    private TestRestTemplate http;
    @Autowired
    private MeterRegistry registry;

    @Test
    void local_외_환경에는_개발_경로와_리소스가_없다() {
        for (String path : new String[] {"/dev/tables", "/dev/world-config", "/dev/tables.html",
                "/dev/games", "/dev/games/config", "/dev/games/games.js", "/dev/games/games.css"}) {
            assertThat(http.getForEntity(path, String.class).getStatusCode().value()).isEqualTo(404);
        }
        assertThat(http.getForEntity("/api/v1/tables", String.class).getStatusCode().value()).isEqualTo(200);
        assertThat(http.getForEntity("/api/v1/channels", String.class).getStatusCode().value()).isEqualTo(200);
        assertThat(http.getForEntity("/ws/tables", String.class).getStatusCode().value()).isEqualTo(401);
        assertThat(registry.find("ontop.websocket.connections.active").gauge()).isNotNull();
        assertThat(registry.find("ontop.websocket.messages.sent").functionCounter()).isNotNull();
    }
}
