package com.ssafy.ontop.auth.security;

import org.springframework.security.core.AuthenticationException;

public class RestAuthenticationException extends AuthenticationException {

    public enum Error {
        REQUIRED(401, "AUTH_AUTHENTICATION_REQUIRED", "로그인이 필요합니다."),
        INVALID(401, "AUTH_INVALID_ACCESS_TOKEN", "Access 인증이 유효하지 않습니다."),
        MEMBER_CHANGED(401, "AUTH_MEMBER_STATE_CHANGED", "활성 회원 인증이 필요합니다."),
        FORBIDDEN(403, "AUTH_ACCESS_DENIED", "접근 권한이 없습니다."),
        REQUEST_REJECTED(403, "AUTH_REQUEST_REJECTED", "허용되지 않은 요청 형식입니다."),
        CONFIGURATION(500, "AUTH_TOKEN_CONFIGURATION_ERROR", "인증 설정을 확인해 주세요."),
        STORAGE(503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE", "회원 인증 정보를 확인할 수 없습니다.");

        private final int status;
        private final String code;
        private final String message;

        Error(int status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public int status() {
            return status;
        }

        public String code() {
            return code;
        }

        public String message() {
            return message;
        }
    }

    private final Error error;

    public RestAuthenticationException(Error error) {
        super(error.message());
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
