package com.ssafy.ontop.game.result;

/** 인증 실패를 사용자 로그아웃으로 추정하지 않는다. 명시적으로 전달된 사유만 사용한다. */
public enum GameDepartureReason {
    DISCONNECT_TIMEOUT, LOGOUT, MEMBER_DEACTIVATED
}
