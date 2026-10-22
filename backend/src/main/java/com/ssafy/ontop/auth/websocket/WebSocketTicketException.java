package com.ssafy.ontop.auth.websocket;

import org.springframework.http.HttpStatus;

public class WebSocketTicketException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public WebSocketTicketException(HttpStatus status, String code) {
        super("웹소켓 접속권 요청을 처리할 수 없습니다.");
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
}
