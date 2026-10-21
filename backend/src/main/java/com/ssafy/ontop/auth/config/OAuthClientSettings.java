package com.ssafy.ontop.auth.config;

import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import java.net.URI;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class OAuthClientSettings {

    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");
    private final OAuthProperties properties;
    private final Environment environment;

    public OAuthClientSettings(OAuthProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public OAuthProperties.Client authorizeClient(OAuthProvider provider) {
        OAuthProperties.Client client = provider == OAuthProvider.SSAFY ? properties.ssafy() : properties.naver();
        if (client == null || invalidValue(client.clientId())) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        URI callback = trustedUri(client.redirectUri());
        if (!("/api/v1/auth/" + provider.path() + "/callback").equals(callback.getRawPath())) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        return client;
    }

    public OAuthProperties.Client callbackClient(OAuthProvider provider) {
        OAuthProperties.Client client = authorizeClient(provider);
        if (invalidValue(client.clientSecret())) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        return client;
    }

    public Optional<URI> frontendCallback() {
        String value = properties.frontendCallbackUri();
        return value == null || value.isBlank() ? Optional.empty() : Optional.of(trustedUri(value));
    }

    private boolean invalidValue(String value) {
        return value == null || value.isBlank() || value.codePoints().anyMatch(Character::isISOControl);
    }

    private URI trustedUri(String value) {
        if (invalidValue(value)) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        boolean https = "https".equalsIgnoreCase(uri.getScheme());
        boolean localHttp = environment.matchesProfiles("local") && "http".equalsIgnoreCase(uri.getScheme())
                && uri.getHost() != null && LOOPBACK_HOSTS.contains(uri.getHost());
        if ((!https && !localHttp) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || uri.getPort() == 0 || uri.getPort() > 65535) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
        return uri;
    }
}
