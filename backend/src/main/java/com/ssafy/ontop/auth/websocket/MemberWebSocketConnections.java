package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

/** 단일 인스턴스 연결 수명 관리. 게임 상태/승패/기권 규칙을 판정하지 않는다. */
@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class MemberWebSocketConnections {
    private static final Logger log = LoggerFactory.getLogger(MemberWebSocketConnections.class);
    private static final String END_REASON = MemberWebSocketConnections.class.getName() + ".reason";
    private final AccessAuthenticationService authentication;
    private final Map<String, Connection> connections = new HashMap<>();

    public MemberWebSocketConnections(AccessAuthenticationService authentication) {
        this.authentication = authentication;
    }

    public void connect(WebSocketSession socket, VerifiedWebSocketUser user, BooleanSupplier register,
            Consumer<ConnectionCloseReason> cleanup) {
        Connection connection = new Connection(socket, user, cleanup);
        synchronized (this) {
            connections.put(socket.getId(), connection);
        }
        try {
            // Upgrade 전 검사와 등록 사이의 로그아웃을 막는다. JWT 만료는 재검사하지 않는다.
            // DB 조회는 레지스트리 잠금 밖에서 실행하며 실패를 의도적 로그아웃으로 처리하지 않는다.
            authentication.requireActive(user.userId(), user.sessionId());
            boolean accepted;
            synchronized (this) {
                if (connections.get(socket.getId()) != connection) {
                    return; // 커밋 후 폐기가 이미 이 pending 연결을 선점해 종료한다.
                }
                accepted = socket.isOpen() && register.getAsBoolean();
                if (!accepted) {
                    connections.remove(socket.getId());
                }
            }
            if (!accepted) {
                close(connection, CloseStatus.POLICY_VIOLATION.withReason("User session unavailable"),
                        ConnectionCloseReason.SOCKET_CLOSED);
            }
        } catch (RestAuthenticationException exception) {
            if (!removeOwned(connection)) {
                return;
            }
            boolean unavailable = exception.error() == RestAuthenticationException.Error.STORAGE;
            close(connection, unavailable ? new CloseStatus(1013, "Authentication temporarily unavailable")
                            : new CloseStatus(4401, "Login session ended"),
                    unavailable ? ConnectionCloseReason.TRANSPORT_ERROR : ConnectionCloseReason.AUTH_SESSION_REVOKED);
        } catch (com.ssafy.ontop.table.websocket.RetryableConnectionException exception) {
            // 기존 연결 생존 확인 중. FE는 1013을 재시도 대상으로 처리한다.
            if (!removeOwned(connection)) {
                return;
            }
            close(connection, new CloseStatus(1013, "Previous connection check"), ConnectionCloseReason.SOCKET_CLOSED);
        } catch (RuntimeException exception) {
            if (!removeOwned(connection)) {
                return;
            }
            close(connection, CloseStatus.SERVER_ERROR, ConnectionCloseReason.TRANSPORT_ERROR);
        }
    }

    private synchronized boolean removeOwned(Connection connection) {
        return connections.remove(connection.socket().getId(), connection);
    }

    public synchronized ConnectionCloseReason remove(WebSocketSession socket, ConnectionCloseReason fallback) {
        connections.remove(socket.getId());
        Object reason = socket.getAttributes().get(END_REASON);
        return reason instanceof ConnectionCloseReason known ? known : fallback;
    }

    public boolean isClosing(WebSocketSession socket) {
        return socket.getAttributes().containsKey(END_REASON);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void revoked(AuthenticationRevocations.Revoked event) {
        // 커밋 이후의 연결 종료 실패를 HTTP 로그아웃/폐기 실패로 반사하지 않는다.
        try {
            ConnectionCloseReason reason = switch (event.reason()) {
                case LOGOUT -> ConnectionCloseReason.LOGOUT;
                case MEMBER_DEACTIVATED -> ConnectionCloseReason.MEMBER_DEACTIVATED;
                case REFRESH_REUSE_DETECTED, SESSION_REVOKED -> ConnectionCloseReason.AUTH_SESSION_REVOKED;
            };
            boolean member = reason == ConnectionCloseReason.MEMBER_DEACTIVATED;
            List<Connection> selected;
            synchronized (this) {
                selected = connections.values().stream().filter(connection ->
                        connection.user().userId() == event.userId() && (event.sessionId() == null
                                || connection.user().sessionId().equals(event.sessionId()))).toList();
                for (Connection connection : selected) {
                    connections.remove(connection.socket().getId());
                    connection.socket().getAttributes().put(END_REASON, reason);
                }
            }
            for (Connection connection : selected) {
                Thread.ofVirtual().name("auth-websocket-close").start(() -> close(connection,
                        new CloseStatus(member ? 4403 : 4401, member ? "Member inactive" : "Login session ended"),
                        reason));
            }
        } catch (RuntimeException exception) {
            log.warn("커밋된 인증 폐기의 WebSocket 종료 처리를 완료하지 못했습니다.");
        }
    }

    private void close(Connection connection, CloseStatus status, ConnectionCloseReason reason) {
        connection.socket().getAttributes().put(END_REASON, reason);
        try {
            connection.socket().close(status);
        } catch (IOException | RuntimeException exception) {
            log.warn("인증 연결을 닫지 못했습니다. 서버 연결 정리를 계속합니다.");
        } finally {
            try {
                connection.cleanup().accept(reason);
            } catch (RuntimeException exception) {
                log.warn("인증 연결의 서버 정리를 완료하지 못했습니다.");
            }
        }
    }

    private record Connection(WebSocketSession socket, VerifiedWebSocketUser user,
            Consumer<ConnectionCloseReason> cleanup) { }
}
