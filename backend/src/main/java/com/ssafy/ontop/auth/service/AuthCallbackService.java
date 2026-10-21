package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.config.OAuthClientSettings;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class AuthCallbackService {

    private static final Logger log = LoggerFactory.getLogger(AuthCallbackService.class);

    private final OAuthStateStore states;
    private final OAuthProviderClient providerClient;
    private final ObjectProvider<AuthUserStateService> users;
    private final OAuthExchangeStore exchanges;
    private final OAuthClientSettings settings;

    public AuthCallbackService(OAuthStateStore states, OAuthProviderClient providerClient,
            ObjectProvider<AuthUserStateService> users, OAuthExchangeStore exchanges, OAuthClientSettings settings) {
        this.states = states;
        this.providerClient = providerClient;
        this.users = users;
        this.exchanges = exchanges;
        this.settings = settings;
    }

    public Completion callback(String providerPath, HttpServletRequest request, MultiValueMap<String, String> params) {
        OAuthProvider provider = OAuthProvider.fromPath(providerPath);
        for (String key : new String[]{"state", "code", "error"}) {
            if (params.containsKey(key) && params.get(key).size() != 1) {
                throw new AuthCallbackException(AuthCallbackException.Error.INVALID_CALLBACK);
            }
        }
        String state = params.getFirst("state");
        if (!states.consume(request, provider, state)) {
            throw new AuthCallbackException(AuthCallbackException.Error.INVALID_STATE);
        }
        if (params.containsKey("error")) {
            throw new AuthCallbackException(params.containsKey("code")
                    ? AuthCallbackException.Error.INVALID_CALLBACK : AuthCallbackException.Error.PROVIDER_DENIED);
        }
        String code = params.getFirst("code");
        if (code == null || code.isBlank() || code.length() > 4096
                || code.codePoints().anyMatch(Character::isISOControl)) {
            throw new AuthCallbackException(AuthCallbackException.Error.INVALID_CALLBACK);
        }
        URI frontend = settings.frontendCallback().orElse(null);
        AuthUserStateService resolver = users.getIfAvailable();
        if (resolver == null) {
            log.warn("OAuth callback unavailable: reason=USER_STATE_SERVICE_MISSING; required_profile=db");
            throw new AuthCallbackException(AuthCallbackException.Error.DATABASE_UNAVAILABLE);
        }
        OAuthIdentity identity = providerClient.identify(provider, code, state);
        LoginOutcome outcome;
        try {
            outcome = resolver.resolve(identity);
        } catch (DataAccessException | TransactionException exception) {
            throw new AuthCallbackException(AuthCallbackException.Error.DATABASE_UNAVAILABLE);
        }
        String exchangeCode = exchanges.issue(request, outcome);
        URI redirect = frontend == null ? null : UriComponentsBuilder.fromUri(frontend)
                .fragment("exchange_code={code}").encode().buildAndExpand(exchangeCode).toUri();
        return new Completion(exchangeCode, redirect);
    }

    public record Completion(String exchangeCode, URI redirect) {
        @Override
        public String toString() {
            return "CallbackCompletion[redacted]";
        }
    }
}
