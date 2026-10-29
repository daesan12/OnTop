package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class TableWebSocketHandler extends TextWebSocketHandler {

    private final TableHub hub;
    private final boolean authenticated;
    private final MemberWebSocketConnections connections;

    public TableWebSocketHandler(TableHub hub,
            @Value("${ontop.websocket.authenticated:true}") boolean authenticated,
            MemberWebSocketConnections connections) {
        this.hub = hub;
        this.authenticated = authenticated;
        this.connections = connections;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        session.setTextMessageSizeLimit(16 * 1024);
        if (!authenticated) {
            hub.connect(session);
            return;
        }
        Object identity = session.getAttributes().get(TableHandshakeInterceptor.VERIFIED_USER);
        if (!(identity instanceof VerifiedWebSocketUser user)) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Authentication required"));
            return;
        }
        connections.connect(session, user, () -> hub.connectAuthenticated(session, user),
                reason -> hub.disconnect(session.getId(), reason));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        if (!connections.isClosing(session)) {
            hub.receive(session.getId(), message.getPayload());
        }
    }

    @Override
    protected void handlePongMessage(WebSocketSession session, PongMessage message) {
        hub.pong(session.getId(), message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.disconnect(session.getId(), connections.remove(session, ConnectionCloseReason.SOCKET_CLOSED));
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.disconnect(session.getId(), connections.remove(session, ConnectionCloseReason.TRANSPORT_ERROR));
    }
}
