package com.ssafy.ontop.observability;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DevObservabilityGuardTests {

    @Test
    void acceptsExplicitDev() {
        var environment = new StandardEnvironment();
        environment.setActiveProfiles("dev", "db", "observe-dev");
        assertDoesNotThrow(() -> new ObservabilityConfiguration(environment));
    }

    @Test
    void refusesProductionMixedProfilesAndMissingDev() {
        for (String forbidden : new String[]{"prod", "production", "local"}) {
            var environment = new StandardEnvironment();
            environment.setActiveProfiles("dev", "observe-dev", forbidden);
            assertThrows(IllegalStateException.class, () -> new ObservabilityConfiguration(environment));
        }
        var environment = new StandardEnvironment();
        environment.setActiveProfiles("observe-dev", "db");
        assertThrows(IllegalStateException.class, () -> new ObservabilityConfiguration(environment));
    }
}
