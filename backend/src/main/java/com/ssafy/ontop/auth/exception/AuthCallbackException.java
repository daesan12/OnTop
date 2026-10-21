package com.ssafy.ontop.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthCallbackException extends RuntimeException {

    public enum Error {
        INVALID_STATE(HttpStatus.BAD_REQUEST, "AUTH_INVALID_STATE", "로그인 요청이 유효하지 않거나 만료되었습니다."),
        INVALID_CALLBACK(HttpStatus.BAD_REQUEST, "AUTH_INVALID_CALLBACK", "올바르지 않은 로그인 응답입니다."),
        PROVIDER_DENIED(HttpStatus.UNAUTHORIZED, "AUTH_PROVIDER_DENIED", "공급자 인증이 거절되었습니다."),
        TOKEN_FAILED(HttpStatus.BAD_GATEWAY, "AUTH_TOKEN_EXCHANGE_FAILED", "공급자 인증 확인에 실패했습니다."),
        PROFILE_FAILED(HttpStatus.BAD_GATEWAY, "AUTH_PROFILE_FAILED", "공급자 사용자 확인에 실패했습니다."),
        DATABASE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_DATABASE_UNAVAILABLE", "회원 상태를 확인할 수 없습니다."),
        REJOIN_PENDING(HttpStatus.CONFLICT, "AUTH_REJOIN_PENDING", "탈퇴 계정의 재가입 처리가 보류되어 있습니다."),
        CAPACITY_EXCEEDED(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_EXCHANGE_CAPACITY_EXCEEDED", "잠시 후 로그인을 다시 시도해 주세요.");

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

    public AuthCallbackException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
