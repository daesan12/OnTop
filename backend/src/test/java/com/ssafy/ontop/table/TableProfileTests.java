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
        "spring.profiles.active=test", "ontop.start-rehearsal.enabled=true"
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
        for (String path : new String[] {"/ws/tables", "/dev/tables", "/dev/world-config", "/dev/tables.html", "/api/v1/tables",
                "/api/v1/channels", "/dev/games", "/dev/games/config", "/dev/games/games.js", "/dev/games/games.css"}) {
            assertThat(http.getForEntity(path, String.class).getStatusCode().value()).isEqualTo(404);
        }
        assertThat(registry.find("ontop.websocket.connections.active").gauge()).isNull();
        assertThat(registry.find("ontop.websocket.messages.sent").functionCounter()).isNull();
    }
}
