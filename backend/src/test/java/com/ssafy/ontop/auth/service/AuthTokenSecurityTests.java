package com.ssafy.ontop.auth.service;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthTokenSecurityTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private byte[] key;
    private Clock clock;
    private AccessJwtService jwt;

    @BeforeEach
    void setUp() {
        key = new byte[32];
        new SecureRandom().nextBytes(key);
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        jwt = new AccessJwtService(properties(Base64.getEncoder().encodeToString(key),
                true, "Lax", "/api/v1/auth"), clock);
    }

    @Test
    void Access_JWT는_30분이며_서명과_주체와_목적이_일치한다() throws Exception {
        String token = jwt.issue(42);
        JWTClaimsSet claims = SignedJWT.parse(token).getJWTClaimsSet();

        assertThat(jwt.verify(token)).isEqualTo(42);
        assertThat(claims.getExpirationTime().toInstant()).isEqualTo(START.plusSeconds(1800));
        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.getStringClaim("token_use")).isEqualTo("access");
        assertThat(claims.getAudience()).containsExactly("ontop-api");
        when(clock.instant()).thenReturn(START.plusSeconds(1800));
        assertThatThrownBy(() -> jwt.verify(token)).isInstanceOf(AuthExchangeException.class);
    }

    @Test
    void 위조_서명과_다른_키와_다른_알고리즘은_거절한다() throws Exception {
        String token = jwt.issue(1);
        String[] parts = token.split("\\.");
        String signature = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
        assertThatThrownBy(() -> jwt.verify(parts[0] + "." + parts[1] + "." + signature))
                .isInstanceOf(AuthExchangeException.class);
        byte[] otherKey = new byte[32];
        new SecureRandom().nextBytes(otherKey);
        AccessJwtService other = new AccessJwtService(properties(Base64.getEncoder().encodeToString(otherKey),
                true, "Lax", "/api/v1/auth"), clock);
        assertThatThrownBy(() -> other.verify(token)).isInstanceOf(AuthExchangeException.class);
        String plain = "eyJhbGciOiJub25lIn0.e30.";
        assertThatThrownBy(() -> jwt.verify(plain)).isInstanceOf(AuthExchangeException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"purpose", "audience", "issuer", "future", "subject", "type", "lifetime"})
    void 정상_서명이어도_잘못된_클레임은_거절한다(String invalid) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().issuer(invalid.equals("issuer") ? "other" : "ontop")
                .audience(invalid.equals("audience") ? "onboarding" : "ontop-api")
                .subject(invalid.equals("subject") ? "9223372036854775808" : "1")
                .issueTime(Date.from(invalid.equals("future") ? START.plusSeconds(1) : START))
                .notBeforeTime(Date.from(START)).expirationTime(Date.from(START.plusSeconds(
                        invalid.equals("lifetime") ? 1801 : 1800))).jwtID("fixture-id")
                .claim("token_use", invalid.equals("purpose") ? "onboarding" : "access");
        SignedJWT signed = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256)
                .type(new JOSEObjectType(invalid.equals("type") ? "JWT" : "at+jwt")).build(), claims.build());
        signed.sign(new MACSigner(key));

        assertThatThrownBy(() -> jwt.verify(signed.serialize())).isInstanceOf(AuthExchangeException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "invalid-base64", "short", "repeated"})
    void 누락되거나_약한_키는_발급하지_않는다(String invalid) {
        String encoded = switch (invalid) {
            case "short" -> Base64.getEncoder().encodeToString(new byte[16]);
            case "repeated" -> Base64.getEncoder().encodeToString(new byte[32]);
            default -> invalid;
        };
        AccessJwtService unsafe = new AccessJwtService(properties(encoded, true, "Lax", "/api/v1/auth"), clock);

        assertThatThrownBy(() -> unsafe.issue(1)).isInstanceOfSatisfying(AuthExchangeException.class,
                exception -> assertThat(exception.error()).isEqualTo(AuthExchangeException.Error.CONFIGURATION));
    }

    @Test
    void 온보딩은_독립_Bearer이며_Access로_검증되지_않고_10분_만료된다() {
        OnboardingTokenStore store = new OnboardingTokenStore(clock);
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.SSAFY, "fixture-verified-id");
        String token = store.issue(identity);

        assertThat(token).matches("ob_[A-Za-z0-9_-]{43}");
        assertThat(store.issue(identity)).isNotEqualTo(token);
        assertThat(store.verify(token)).isEqualTo(identity);
        assertThatThrownBy(() -> jwt.verify(token)).isInstanceOf(AuthExchangeException.class);
        assertThatThrownBy(() -> store.verify(jwt.issue(1))).isInstanceOf(AuthExchangeException.class);
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        assertThatThrownBy(() -> store.verify(token)).isInstanceOf(AuthExchangeException.class);
    }

    @Test
    void 온보딩도_동시_소비는_한_번만_가능하다() throws Exception {
        OnboardingTokenStore store = new OnboardingTokenStore(clock);
        String token = store.issue(new OAuthIdentity(OAuthProvider.NAVER, "fixture-id"));
        List<Callable<Boolean>> tasks = IntStream.range(0, 8).mapToObj(index -> (Callable<Boolean>) () -> {
            try {
                store.consume(token);
                return true;
            } catch (AuthExchangeException exception) {
                return false;
            }
        }).toList();

        try (var executor = Executors.newFixedThreadPool(8)) {
            int successful = 0;
            for (var future : executor.invokeAll(tasks)) {
                if (future.get()) {
                    successful++;
                }
            }
            assertThat(successful).isEqualTo(1);
        }
    }

    @Test
    void 온보딩_용량_제한과_주기_정리는_유효한_토큰을_임의_제거하지_않는다() {
        OnboardingTokenStore store = new OnboardingTokenStore(clock, new SecureRandom(), 1);
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.SSAFY, "fixture-id");
        String token = store.issue(identity);
        assertThatThrownBy(() -> store.issue(identity)).isInstanceOf(AuthExchangeException.class);
        assertThat(store.verify(token)).isEqualTo(identity);
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        store.removeExpired();
        assertThat(store.verify(store.issue(identity))).isEqualTo(identity);
        store.clearOnShutdown();
        assertThatThrownBy(() -> store.verify(token)).isInstanceOf(AuthExchangeException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"default", "local", "prod", "local,db"})
    void Refresh_쿠키는_HttpOnly와_7일_수명과_AUTH_경로를_사용한다(String profile) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profile.split(","));
        RefreshCookieService cookies = new RefreshCookieService(properties("", true, "Lax", "/api/v1/auth"), env);

        assertThat(cookies.issue("fixture-refresh")).contains("HttpOnly", "Secure", "SameSite=Lax",
                "Path=/api/v1/auth", "Max-Age=604800");
    }

    @ParameterizedTest
    @ValueSource(strings = {"insecure", "none-insecure", "path", "same-site"})
    void 운영_쿠키의_보안_약화를_거절한다(String invalid) {
        RefreshCookieService cookies = new RefreshCookieService(properties("", !invalid.contains("insecure"),
                invalid.equals("same-site") ? "invalid" : invalid.equals("none-insecure") ? "None" : "Lax",
                invalid.equals("path") ? "/" : "/api/v1/auth"), new MockEnvironment());

        assertThatThrownBy(cookies::validate).isInstanceOf(AuthExchangeException.class);
    }

    private AuthTokenProperties properties(String encoded, boolean secure, String sameSite, String path) {
        return new AuthTokenProperties(encoded, "ontop", List.of(),
                new AuthTokenProperties.RefreshCookie(secure, sameSite, path));
    }
}
