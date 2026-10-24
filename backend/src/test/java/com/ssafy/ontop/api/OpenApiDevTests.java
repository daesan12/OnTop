package com.ssafy.ontop.api;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "ontop.feedback.enabled=true"})
@ActiveProfiles("dev")
class OpenApiDevTests extends OpenApiHttpTestSupport {
}
