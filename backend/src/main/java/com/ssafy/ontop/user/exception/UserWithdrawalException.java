package com.ssafy.ontop.user.exception;

public class UserWithdrawalException extends RuntimeException {

    public UserWithdrawalException() {
        super("회원 탈퇴를 완료할 수 없습니다.");
    }
}
