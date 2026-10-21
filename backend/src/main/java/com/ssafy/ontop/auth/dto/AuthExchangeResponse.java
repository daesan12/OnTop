package com.ssafy.ontop.auth.dto;

public sealed interface AuthExchangeResponse {

    record Authenticated(String status, String accessToken, String tokenType, long expiresIn)
            implements AuthExchangeResponse {
        public Authenticated(String accessToken) {
            this("AUTHENTICATED", accessToken, "Bearer", 1800);
        }

        @Override
        public String toString() {
            return "Authenticated[redacted]";
        }
    }

    record Onboarding(String status, String onboardingToken, long expiresIn) implements AuthExchangeResponse {
        public Onboarding(String onboardingToken) {
            this("ONBOARDING_REQUIRED", onboardingToken, 600);
        }

        @Override
        public String toString() {
            return "Onboarding[redacted]";
        }
    }
}
