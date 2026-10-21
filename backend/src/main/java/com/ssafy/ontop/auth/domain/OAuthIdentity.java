package com.ssafy.ontop.auth.domain;

public record OAuthIdentity(OAuthProvider provider, String providerUserId) {
    @Override
    public String toString() {
        return "OAuthIdentity[redacted]";
    }
}
