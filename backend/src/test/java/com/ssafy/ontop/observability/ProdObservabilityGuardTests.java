package com.ssafy.ontop.observability;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProdObservabilityGuardTests {

    @Test
    void 운영_프로필과_함께_사용할_수_있다() {
        var environment = new StandardEnvironment();
        environment.setActiveProfiles("prod", "db", "observe-prod");

        assertDoesNotThrow(() -> new ObservabilityConfiguration(environment));
    }

    @Test
    void 개발_로컬_프로필과_혼합하거나_운영_프로필이_없으면_거절한다() {
        for (String forbidden : new String[]{"dev", "local"}) {
            var environment = new StandardEnvironment();
            environment.setActiveProfiles("prod", "observe-prod", forbidden);

            assertThrows(IllegalStateException.class, () -> new ObservabilityConfiguration(environment));
        }

        var environment = new StandardEnvironment();
        environment.setActiveProfiles("observe-prod", "db");

        assertThrows(IllegalStateException.class, () -> new ObservabilityConfiguration(environment));
    }

    @Test
    void 두_관측_프로필을_동시에_사용하면_거절한다() {
        var environment = new StandardEnvironment();
        environment.setActiveProfiles("prod", "observe-dev", "observe-prod");

        assertThrows(IllegalStateException.class, () -> new ObservabilityConfiguration(environment));
    }
}
