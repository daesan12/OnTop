package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@Profile("local")
public class TableWebSocketHandler extends TextWebSocketHandler {

    private final TableHub hub;
    private final boolean authenticated;

    public TableWebSocketHandler(TableHub hub,
            @Value("${ontop.websocket.authenticated:false}") boolean authenticated) {
        this.hub = hub;
        this.authenticated = authenticated;
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
        if (!hub.connectAuthenticated(session, user)) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("User session unavailable"));
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        hub.receive(session.getId(), message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.disconnect(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.disconnect(session.getId());
    }
}
