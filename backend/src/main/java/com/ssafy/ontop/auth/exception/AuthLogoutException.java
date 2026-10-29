package com.ssafy.ontop.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthLogoutException extends RuntimeException {

    public enum Error {
        INVALID_REQUEST(HttpStatus.BAD_REQUEST, "AUTH_INVALID_LOGOUT_REQUEST", "로그아웃 요청 형식을 확인해 주세요."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_LOGOUT_STORAGE_UNAVAILABLE", "로그아웃을 완료할 수 없습니다.");

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

    public AuthLogoutException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
