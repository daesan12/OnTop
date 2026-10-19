package com.ssafy.ontop.table;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=test", "ontop.start-rehearsal.enabled=true"
})
class TableProfileTests {

    @Autowired
    private TestRestTemplate http;

    @Test
    void local_외_환경에는_개발_경로와_리소스가_없다() {
        for (String path : new String[] {"/ws/tables", "/dev/tables", "/dev/tables.html", "/api/v1/tables"}) {
            assertThat(http.getForEntity(path, String.class).getStatusCode().value()).isEqualTo(404);
        }
    }
}
