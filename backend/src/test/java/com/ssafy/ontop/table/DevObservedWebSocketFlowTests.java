package com.ssafy.ontop.table;

import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Reuses actual DEV authentication/socket flows with the optional monitoring profile enabled. */
@ActiveProfiles({"dev", "observe-dev"})
@AutoConfigureObservability
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DevObservedWebSocketFlowTests extends DevCommittedStartFlowTests {

    @DynamicPropertySource
    static void managementPort(DynamicPropertyRegistry properties) {
        properties.add("management.server.port", () -> 8082);
    }
}
