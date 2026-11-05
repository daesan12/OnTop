package com.ssafy.ontop.user.exception;

import org.springframework.http.HttpStatus;

public class UserOnboardingException extends RuntimeException {

    public enum Error {
        INVALID_REQUEST(HttpStatus.BAD_REQUEST, "USER_INVALID_ONBOARDING_REQUEST", "온보딩 요청 형식을 확인해 주세요."),
        INVALID_NICKNAME(HttpStatus.BAD_REQUEST, "USER_INVALID_NICKNAME", "닉네임은 한글, 영문, 숫자 2~8자로 입력해 주세요."),
        RESERVED_NICKNAME(HttpStatus.BAD_REQUEST, "USER_RESERVED_NICKNAME", "GM으로 시작하는 닉네임은 사용할 수 없습니다."),
        INAPPROPRIATE_NICKNAME(HttpStatus.BAD_REQUEST, "USER_INAPPROPRIATE_NICKNAME",
                "사용할 수 없는 표현이 포함된 닉네임입니다."),
        INVALID_GENDER(HttpStatus.BAD_REQUEST, "USER_INVALID_CHARACTER_GENDER", "캐릭터 성별을 확인해 주세요."),
        NICKNAME_TAKEN(HttpStatus.CONFLICT, "USER_NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다."),
        ALREADY_REGISTERED(HttpStatus.CONFLICT, "USER_ALREADY_REGISTERED", "이미 가입된 소셜 계정입니다. 다시 로그인해 주세요."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "USER_ONBOARDING_UNAVAILABLE", "가입 처리를 완료할 수 없습니다.");

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

    public UserOnboardingException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
