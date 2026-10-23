package com.ssafy.ontop.api;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "prod"})
class OpenApiMixedProductionTests extends OpenApiDisabledTestSupport {
}
