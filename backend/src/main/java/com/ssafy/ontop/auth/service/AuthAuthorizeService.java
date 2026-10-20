package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class AuthAuthorizeService {

    private static final String SSAFY_AUTHORIZE_URL = "https://project.ssafy.com/oauth/sso-check";
    private static final String NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

    private final OAuthProperties properties;
    private final NaverStateStore stateStore;
    private final Environment environment;

    public AuthAuthorizeService(OAuthProperties properties, NaverStateStore stateStore, Environment environment) {
        this.properties = properties;
        this.stateStore = stateStore;
        this.environment = environment;
    }

    public URI authorize(String provider, HttpServletRequest request) {
        OAuthProperties.Client client = switch (provider) {
            case "ssafy" -> properties.ssafy();
            case "naver" -> properties.naver();
            default -> throw AuthAuthorizeException.unsupportedProvider();
        };
        validateClient(client, provider);

        String endpoint = "naver".equals(provider) ? NAVER_AUTHORIZE_URL : SSAFY_AUTHORIZE_URL;
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(endpoint)
                .queryParam("response_type", "code")
                .queryParam("client_id", "{clientId}")
                .queryParam("redirect_uri", "{redirectUri}");
        Map<String, String> variables = new HashMap<>();
        variables.put("clientId", client.clientId());
        variables.put("redirectUri", client.redirectUri());
        if ("naver".equals(provider)) {
            builder.queryParam("state", "{state}");
            variables.put("state", stateStore.issue(request));
        }

        // URI 변수로 확장해 '+', '&', '=' 등 값 내부의 예약 문자도 인코딩한다.
        return builder.encode().buildAndExpand(variables).toUri();
    }

    private void validateClient(OAuthProperties.Client client, String provider) {
        if (client == null || client.clientId() == null || client.clientId().isBlank()
                || client.clientId().codePoints().anyMatch(Character::isISOControl)
                || client.redirectUri() == null || client.redirectUri().isBlank()) {
            throw AuthAuthorizeException.invalidConfiguration();
        }

        URI callback;
        try {
            callback = URI.create(client.redirectUri());
        } catch (IllegalArgumentException exception) {
            // 파싱 예외에는 설정 원문이 포함될 수 있어 원인 예외를 응답·로그에 전달하지 않는다.
            throw AuthAuthorizeException.invalidConfiguration();
        }
        boolean https = "https".equalsIgnoreCase(callback.getScheme());
        boolean localHttp = environment.matchesProfiles("local")
                && "http".equalsIgnoreCase(callback.getScheme())
                && callback.getHost() != null && LOOPBACK_HOSTS.contains(callback.getHost());
        if ((!https && !localHttp) || callback.getHost() == null || callback.getRawUserInfo() != null
                || callback.getRawQuery() != null || callback.getRawFragment() != null
                || !("/api/v1/auth/" + provider + "/callback").equals(callback.getRawPath())
                || callback.getPort() == 0 || callback.getPort() > 65535) {
            throw AuthAuthorizeException.invalidConfiguration();
        }
    }
}
