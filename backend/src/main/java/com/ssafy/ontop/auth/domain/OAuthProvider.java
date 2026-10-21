package com.ssafy.ontop.auth.domain;

import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import com.ssafy.ontop.user.domain.LoginProvider;

public enum OAuthProvider {
    SSAFY("ssafy", "https://project.ssafy.com/oauth/sso-check",
            "https://project.ssafy.com/ssafy/oauth2/token", "https://project.ssafy.com/ssafy/resources/userInfo"),
    NAVER("naver", "https://nid.naver.com/oauth2.0/authorize",
            "https://nid.naver.com/oauth2.0/token", "https://openapi.naver.com/v1/nid/me");

    private final String path;
    private final String authorizeEndpoint;
    private final String tokenEndpoint;
    private final String profileEndpoint;

    OAuthProvider(String path, String authorizeEndpoint, String tokenEndpoint, String profileEndpoint) {
        this.path = path;
        this.authorizeEndpoint = authorizeEndpoint;
        this.tokenEndpoint = tokenEndpoint;
        this.profileEndpoint = profileEndpoint;
    }

    public static OAuthProvider fromPath(String path) {
        return switch (path) {
            case "ssafy" -> SSAFY;
            case "naver" -> NAVER;
            default -> throw AuthAuthorizeException.unsupportedProvider();
        };
    }

    public String path() {
        return path;
    }

    public String authorizeEndpoint() {
        return authorizeEndpoint;
    }

    public String tokenEndpoint() {
        return tokenEndpoint;
    }

    public String profileEndpoint() {
        return profileEndpoint;
    }

    public LoginProvider loginProvider() {
        return LoginProvider.valueOf(name());
    }
}
