package com.ssafy.ontop.auth.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ontop.auth")
public record AuthTokenProperties(@DefaultValue("") String jwtSecretBase64,
        @DefaultValue("ontop") String jwtIssuer, List<String> allowedOrigins,
        @DefaultValue RefreshCookie refreshCookie) {

    public record RefreshCookie(@DefaultValue("true") boolean secure,
            @DefaultValue("Lax") String sameSite, @DefaultValue("/api/v1/auth") String path) {
    }

    @Override
    public String toString() {
        return "AuthTokenProperties[redacted]";
    }
}
