package com.ssafy.ontop.table.websocket;

// 서버가 먼저 관찰한 정리 사유다. 물리적인 네트워크 장애의 원인이나 사용자 행동을 추정하지 않는다.
public enum ConnectionCloseReason {
    SOCKET_CLOSED,
    TRANSPORT_ERROR,
    HEARTBEAT_TIMEOUT,
    SEND_QUEUE_FULL,
    SEND_ERROR,
    SERVER_SHUTDOWN,
    AUTH_SESSION_REVOKED,
    MEMBER_DEACTIVATED,
    UNSPECIFIED
}
