package com.ssafy.ontop.user.exception;

import org.springframework.http.HttpStatus;

public class UserNicknameUpdateException extends RuntimeException {

    public enum Error {
        INVALID_REQUEST(HttpStatus.BAD_REQUEST, "USER_INVALID_NICKNAME_UPDATE_REQUEST",
                "닉네임 수정 요청 형식을 확인해 주세요."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "USER_PROFILE_UPDATE_UNAVAILABLE", "회원 정보를 수정할 수 없습니다.");

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

    public UserNicknameUpdateException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
