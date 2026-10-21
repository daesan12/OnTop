package com.ssafy.ontop.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthRefreshException extends RuntimeException {

    public enum Error {
        INVALID_REQUEST(HttpStatus.BAD_REQUEST, "AUTH_INVALID_REFRESH_REQUEST", "재발급 요청에는 본문을 사용할 수 없습니다."),
        INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_REFRESH_TOKEN", "Refresh 인증이 유효하지 않습니다."),
        ALREADY_ROTATED(HttpStatus.UNAUTHORIZED, "AUTH_REFRESH_ALREADY_ROTATED", "이미 처리된 재발급 요청입니다."),
        REUSE_DETECTED(HttpStatus.UNAUTHORIZED, "AUTH_REFRESH_REUSE_DETECTED", "다시 로그인해 주세요."),
        MEMBER_CHANGED(HttpStatus.UNAUTHORIZED, "AUTH_MEMBER_STATE_CHANGED", "회원 상태가 변경되어 다시 로그인해야 합니다."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_REFRESH_STORAGE_UNAVAILABLE", "인증 재발급을 완료할 수 없습니다.");

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

    public AuthRefreshException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
