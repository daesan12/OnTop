package com.ssafy.ontop.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthExchangeException extends RuntimeException {

    public enum Error {
        INVALID_REQUEST(HttpStatus.BAD_REQUEST, "AUTH_INVALID_EXCHANGE_REQUEST", "교환 요청 형식을 확인해 주세요."),
        INVALID_CODE(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_EXCHANGE_CODE", "교환 코드가 유효하지 않거나 만료되었습니다."),
        INVALID_ACCESS(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_ACCESS_TOKEN", "Access 인증이 유효하지 않습니다."),
        INVALID_ONBOARDING(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_ONBOARDING_TOKEN", "온보딩 인증이 유효하지 않습니다."),
        MEMBER_CHANGED(HttpStatus.UNAUTHORIZED, "AUTH_MEMBER_STATE_CHANGED", "회원 상태가 변경되어 다시 로그인해야 합니다."),
        ORIGIN_DENIED(HttpStatus.FORBIDDEN, "AUTH_ORIGIN_NOT_ALLOWED", "허용되지 않은 요청 출처입니다."),
        CONFIGURATION(HttpStatus.INTERNAL_SERVER_ERROR, "AUTH_TOKEN_CONFIGURATION_ERROR", "인증 설정을 확인해 주세요."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_EXCHANGE_STORAGE_UNAVAILABLE", "인증 처리를 완료할 수 없습니다."),
        CAPACITY(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_ONBOARDING_CAPACITY_EXCEEDED", "잠시 후 다시 로그인해 주세요.");

        private final HttpStatus status;
        private final String code;
        private final String message;

        Error(HttpStatus status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public HttpStatus status() {
            return status;
        }

        public String code() {
            return code;
        }
    }

    private final Error error;

    public AuthExchangeException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
