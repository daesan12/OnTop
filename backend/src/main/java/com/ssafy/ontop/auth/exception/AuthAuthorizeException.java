package com.ssafy.ontop.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthAuthorizeException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    private AuthAuthorizeException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AuthAuthorizeException unsupportedProvider() {
        return new AuthAuthorizeException(HttpStatus.BAD_REQUEST, "AUTH_UNSUPPORTED_PROVIDER",
                "지원하지 않는 로그인 제공자입니다.");
    }

    public static AuthAuthorizeException invalidConfiguration() {
        return new AuthAuthorizeException(HttpStatus.INTERNAL_SERVER_ERROR, "AUTH_CONFIGURATION_ERROR",
                "소셜 로그인 설정을 확인해 주세요.");
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
