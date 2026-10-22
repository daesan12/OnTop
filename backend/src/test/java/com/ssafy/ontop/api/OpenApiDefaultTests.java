package com.ssafy.ontop.api;

import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class OpenApiDefaultTests extends OpenApiDisabledTestSupport {
}
