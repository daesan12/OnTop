package com.ssafy.ontop.table.websocket;

/** 같은 로그인 세션의 기존 연결 생존을 확인하는 중이다. 새 연결은 재시도 가능한 1013으로 닫는다. */
public class RetryableConnectionException extends RuntimeException {
    public RetryableConnectionException(String message) {
        super(message);
    }
}
