package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class AuthExchangeOriginPolicy {

    private final AuthTokenProperties properties;
    private final Environment environment;

    public AuthExchangeOriginPolicy(AuthTokenProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public String allowedOrigin(HttpServletRequest request) {
        List<String> origins = Collections.list(request.getHeaders("Origin"));
        if (origins.isEmpty()) {
            String fetchSite = request.getHeader("Sec-Fetch-Site");
            if (fetchSite != null && !Set.of("same-origin", "none").contains(fetchSite)) {
                throw denied();
            }
            return null;
        }
        if (origins.size() != 1) {
            throw denied();
        }
        String requested;
        try {
            requested = normalize(origins.getFirst());
        } catch (IllegalArgumentException exception) {
            throw denied();
        }
        List<String> allowed = properties.allowedOrigins() == null ? List.of() : properties.allowedOrigins();
        if (allowed.size() > 32) {
            throw new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION);
        }
        for (String configured : allowed) {
            try {
                if (normalize(configured).equals(requested)) {
                    return requested;
                }
            } catch (IllegalArgumentException exception) {
                throw new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION);
            }
        }
        throw denied();
    }

    private String normalize(String value) {
        if (value == null || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException();
        }
        URI uri = URI.create(value);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        boolean https = "https".equalsIgnoreCase(scheme);
        boolean localHttp = environment.matchesProfiles("local") && "http".equalsIgnoreCase(scheme)
                && host != null && Set.of("localhost", "127.0.0.1", "[::1]").contains(host.toLowerCase(Locale.ROOT));
        if ((!https && !localHttp) || host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || (!uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))
                || uri.getPort() == 0 || uri.getPort() > 65535) {
            throw new IllegalArgumentException();
        }
        int port = uri.getPort();
        boolean defaultPort = port == -1 || (https && port == 443) || (!https && port == 80);
        return scheme.toLowerCase(Locale.ROOT) + "://" + host.toLowerCase(Locale.ROOT)
                + (defaultPort ? "" : ":" + port);
    }

    private AuthExchangeException denied() {
        return new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
    }
}
