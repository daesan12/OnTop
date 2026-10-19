package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.table.service.TableHub;
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

    public TableWebSocketHandler(TableHub hub) {
        this.hub = hub;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        session.setTextMessageSizeLimit(16 * 1024);
        hub.connect(session);
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
