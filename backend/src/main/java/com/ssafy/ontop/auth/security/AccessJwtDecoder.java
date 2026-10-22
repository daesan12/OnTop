package com.ssafy.ontop.auth.security;

import com.nimbusds.jwt.SignedJWT;
import java.text.ParseException;
import java.util.Map;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.MappedJwtClaimSetConverter;
import org.springframework.stereotype.Component;

@Component
public class AccessJwtDecoder implements JwtDecoder {

    private final AccessAuthenticationService authentication;
    private final MappedJwtClaimSetConverter claims = MappedJwtClaimSetConverter.withDefaults(Map.of());

    public AccessJwtDecoder(AccessAuthenticationService authentication) {
        this.authentication = authentication;
    }

    @Override
    public Jwt decode(String token) {
        long userId = authentication.verifyUserId(token);
        try {
            // 서명/용도/시각 검증은 기존 서비스만 수행한다. 여기서는 검증된 클레임의 표현만 변환한다.
            SignedJWT parsed = SignedJWT.parse(token);
            Map<String, Object> converted = claims.convert(parsed.getJWTClaimsSet().getClaims());
            return Jwt.withTokenValue(token).headers(values -> values.putAll(parsed.getHeader().toJSONObject()))
                    .claims(values -> values.putAll(converted))
                    .subject(Long.toString(userId)).build();
        } catch (ParseException exception) {
            throw new BadJwtException("Access 인증 형식이 유효하지 않습니다.");
        }
    }
}
