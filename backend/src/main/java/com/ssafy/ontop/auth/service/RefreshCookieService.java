package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import java.time.Duration;
import java.util.Locale;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class RefreshCookieService {

    public static final long LIFETIME_SECONDS = 604800;
    public static final String NAME = "ONTOP_REFRESH";
    private final AuthTokenProperties properties;
    private final Environment environment;

    public RefreshCookieService(AuthTokenProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public void validate() {
        AuthTokenProperties.RefreshCookie cookie = properties.refreshCookie();
        if (cookie == null || (!environment.matchesProfiles("local") && !cookie.secure())
                || cookie.path() == null || !cookie.path().matches("/api/v1/auth(?:/[A-Za-z0-9/_-]*)?")
                || cookie.sameSite() == null) {
            throw invalid();
        }
        String sameSite = cookie.sameSite().toLowerCase(Locale.ROOT);
        if (!sameSite.equals("lax") && !sameSite.equals("strict") && !sameSite.equals("none")) {
            throw invalid();
        }
        if (sameSite.equals("none") && !cookie.secure()) {
            throw invalid();
        }
    }

    public String issue(String raw) {
        return builder(raw).maxAge(Duration.ofSeconds(LIFETIME_SECONDS)).build().toString();
    }

    public String clear() {
        return builder("").maxAge(Duration.ZERO).build().toString();
    }

    private ResponseCookie.ResponseCookieBuilder builder(String raw) {
        validate();
        AuthTokenProperties.RefreshCookie cookie = properties.refreshCookie();
        return ResponseCookie.from(NAME, raw).httpOnly(true).secure(cookie.secure()).sameSite(cookie.sameSite())
                .path(cookie.path());
    }

    private AuthExchangeException invalid() {
        return new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION);
    }
}
