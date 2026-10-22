package com.ssafy.ontop.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(oneOf = {AuthExchangeResponse.Authenticated.class,
        AuthExchangeResponse.Onboarding.class}, discriminatorProperty = "status")
public sealed interface AuthExchangeResponse {

    @Schema(requiredProperties = {"status", "accessToken", "tokenType", "expiresIn"})
    record Authenticated(
            @Schema(allowableValues = "AUTHENTICATED") String status,
            String accessToken,
            @Schema(allowableValues = "Bearer") String tokenType,
            @Schema(example = "1800") long expiresIn)
            implements AuthExchangeResponse {
        public Authenticated(String accessToken) {
            this("AUTHENTICATED", accessToken, "Bearer", 1800);
        }

        @Override
        public String toString() {
            return "Authenticated[redacted]";
        }
    }

    @Schema(requiredProperties = {"status", "onboardingToken", "expiresIn"})
    record Onboarding(
            @Schema(allowableValues = "ONBOARDING_REQUIRED") String status,
            String onboardingToken,
            @Schema(example = "600") long expiresIn) implements AuthExchangeResponse {
        public Onboarding(String onboardingToken) {
            this("ONBOARDING_REQUIRED", onboardingToken, 600);
        }

        @Override
        public String toString() {
            return "Onboarding[redacted]";
        }
    }
}
