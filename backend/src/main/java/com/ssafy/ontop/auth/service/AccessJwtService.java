package com.ssafy.ontop.auth.service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.BitSet;
import java.util.Date;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class AccessJwtService {

    public static final long LIFETIME_SECONDS = 1800;
    private static final String AUDIENCE = "ontop-api";
    private static final JOSEObjectType TYPE = new JOSEObjectType("at+jwt");
    private final AuthTokenProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AccessJwtService(AuthTokenProperties properties, @Qualifier("oauthClock") Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public String issue(long userId) {
        if (userId <= 0) {
            throw new AuthExchangeException(AuthExchangeException.Error.MEMBER_CHANGED);
        }
        byte[] key = signingKey();
        Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        SignedJWT token = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(TYPE).build(),
                new JWTClaimsSet.Builder().issuer(properties.jwtIssuer()).audience(AUDIENCE)
                        .subject(Long.toString(userId)).issueTime(Date.from(now)).notBeforeTime(Date.from(now))
                        .expirationTime(Date.from(now.plusSeconds(LIFETIME_SECONDS)))
                        .jwtID(OpaqueTokens.generate(random)).claim("token_use", "access").build());
        try {
            token.sign(new MACSigner(key));
            return token.serialize();
        } catch (JOSEException exception) {
            throw new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION);
        }
    }

    // 일반 REST/WebSocket 검증자는 이 경계만 사용한다. 온보딩 토큰을 받아들이지 않는다.
    public long verify(String value) {
        byte[] key = signingKey();
        try {
            if (value == null || value.length() > 8192
                    || !value.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) {
                throw invalid();
            }
            SignedJWT token = SignedJWT.parse(value);
            if (!JWSAlgorithm.HS256.equals(token.getHeader().getAlgorithm())
                    || !TYPE.equals(token.getHeader().getType())
                    || (token.getHeader().getCriticalParams() != null
                    && !token.getHeader().getCriticalParams().isEmpty())
                    || !token.verify(new MACVerifier(key))) {
                throw invalid();
            }
            JWTClaimsSet claims = token.getJWTClaimsSet();
            Instant now = clock.instant();
            Date issued = claims.getIssueTime();
            Date expires = claims.getExpirationTime();
            Date notBefore = claims.getNotBeforeTime();
            if (!properties.jwtIssuer().equals(claims.getIssuer()) || !List.of(AUDIENCE).equals(claims.getAudience())
                    || !"access".equals(claims.getStringClaim("token_use")) || issued == null || expires == null
                    || notBefore == null || issued.toInstant().isAfter(now) || notBefore.toInstant().isAfter(now)
                    || !expires.toInstant().isAfter(now) || !expires.after(issued)
                    || expires.toInstant().isAfter(issued.toInstant().plusSeconds(LIFETIME_SECONDS))
                    || claims.getJWTID() == null || claims.getSubject() == null
                    || !claims.getSubject().matches("[1-9][0-9]{0,18}")) {
                throw invalid();
            }
            long userId = Long.parseLong(claims.getSubject());
            if (userId <= 0) {
                throw invalid();
            }
            return userId;
        } catch (ParseException | JOSEException | IllegalArgumentException exception) {
            throw invalid();
        }
    }

    private byte[] signingKey() {
        try {
            String encoded = properties.jwtSecretBase64();
            if (encoded == null || encoded.length() > 1024 || properties.jwtIssuer() == null
                    || !properties.jwtIssuer().matches("[A-Za-z0-9._:-]{1,128}")) {
                throw new IllegalArgumentException();
            }
            byte[] key = Base64.getDecoder().decode(encoded);
            BitSet distinct = new BitSet(256);
            for (byte value : key) {
                distinct.set(Byte.toUnsignedInt(value));
            }
            if (key.length < 32 || key.length > 128 || distinct.cardinality() < 16) {
                throw new IllegalArgumentException();
            }
            return key;
        } catch (IllegalArgumentException exception) {
            throw new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION);
        }
    }

    private AuthExchangeException invalid() {
        return new AuthExchangeException(AuthExchangeException.Error.INVALID_ACCESS);
    }
}
