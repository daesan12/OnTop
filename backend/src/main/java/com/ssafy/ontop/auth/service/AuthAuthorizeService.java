package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.config.OAuthClientSettings;
import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class AuthAuthorizeService {

    private final OAuthClientSettings settings;
    private final OAuthStateStore stateStore;

    public AuthAuthorizeService(OAuthClientSettings settings, OAuthStateStore stateStore) {
        this.settings = settings;
        this.stateStore = stateStore;
    }

    public URI authorize(String providerPath, HttpServletRequest request) {
        OAuthProvider provider = OAuthProvider.fromPath(providerPath);
        OAuthProperties.Client client = settings.authorizeClient(provider);
        return UriComponentsBuilder.fromUriString(provider.authorizeEndpoint())
                .queryParam("response_type", "code")
                .queryParam("client_id", "{clientId}")
                .queryParam("redirect_uri", "{redirectUri}")
                .queryParam("state", "{state}")
                .encode().buildAndExpand(Map.of("clientId", client.clientId(), "redirectUri", client.redirectUri(),
                        "state", stateStore.issue(request, provider))).toUri();
    }
}
