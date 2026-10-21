package com.ssafy.ontop.auth.client;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.OAuthClientSettings;
import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class OAuthProviderClient {

    private static final int MAX_RESPONSE_BYTES = 65536;
    private final RestClient http;
    private final OAuthClientSettings settings;
    private final ObjectMapper mapper;

    public OAuthProviderClient(@Qualifier("oauthRestClient") RestClient http,
            OAuthClientSettings settings, ObjectMapper mapper) {
        this.http = http;
        this.settings = settings;
        this.mapper = mapper;
    }

    public OAuthIdentity identify(OAuthProvider provider, String code, String state) {
        OAuthProperties.Client client = settings.callbackClient(provider);
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", client.clientId());
        form.add("client_secret", client.clientSecret());
        form.add("redirect_uri", client.redirectUri());
        form.add("code", code);
        if (provider == OAuthProvider.NAVER) {
            form.add("state", state);
        }
        JsonNode token = json(http.post().uri(provider.tokenEndpoint())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).accept(MediaType.APPLICATION_JSON).body(form),
                AuthCallbackException.Error.TOKEN_FAILED);
        JsonNode accessToken = token.path("access_token");
        if (token.hasNonNull("error") || !accessToken.isTextual() || invalidToken(accessToken.asText())
                || (token.hasNonNull("token_type") && !"Bearer".equalsIgnoreCase(token.path("token_type").asText()))) {
            throw new AuthCallbackException(AuthCallbackException.Error.TOKEN_FAILED);
        }
        JsonNode profile = json(http.get().uri(provider.profileEndpoint()).accept(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBearerAuth(accessToken.asText())),
                AuthCallbackException.Error.PROFILE_FAILED);
        JsonNode identifier;
        if (provider == OAuthProvider.NAVER) {
            if (!"00".equals(profile.path("resultcode").asText())) {
                throw new AuthCallbackException(AuthCallbackException.Error.PROFILE_FAILED);
            }
            identifier = profile.path("response").path("id");
        } else {
            identifier = profile.path("userId");
        }
        if ((provider == OAuthProvider.NAVER && !identifier.isTextual())
                || (!identifier.isTextual() && !identifier.isIntegralNumber()) || identifier.asText().isBlank()
                || identifier.asText().codePoints().anyMatch(Character::isISOControl)
                || identifier.asText().codePointCount(0, identifier.asText().length()) > 255) {
            throw new AuthCallbackException(AuthCallbackException.Error.PROFILE_FAILED);
        }
        return new OAuthIdentity(provider, identifier.asText());
    }

    private boolean invalidToken(String value) {
        return value.isBlank() || value.length() > 16384 || value.codePoints().anyMatch(Character::isISOControl);
    }

    private JsonNode json(RestClient.RequestHeadersSpec<?> request, AuthCallbackException.Error error) {
        try {
            return request.exchange((sent, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    throw new AuthCallbackException(error);
                }
                byte[] body = response.getBody().readNBytes(MAX_RESPONSE_BYTES + 1);
                if (body.length > MAX_RESPONSE_BYTES) {
                    throw new AuthCallbackException(error);
                }
                JsonNode node = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(body);
                if (node == null || !node.isObject()) {
                    throw new AuthCallbackException(error);
                }
                return node;
            });
        } catch (RestClientException | IllegalArgumentException exception) {
            // 원인 예외는 URL·응답·공급자 토큰을 포함할 수 있어 응답이나 로그에 전달하지 않는다.
            throw new AuthCallbackException(error);
        }
    }
}
