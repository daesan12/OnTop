package com.ssafy.ontop.table.websocket;

import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@Profile("local")
public class TableWebSocketConfiguration implements WebSocketConfigurer {

    private final TableWebSocketHandler handler;
    private final TableHandshakeInterceptor identityInterceptor;

    public TableWebSocketConfiguration(TableWebSocketHandler handler, TableHandshakeInterceptor identityInterceptor,
            @Value("${ontop.websocket.authenticated:false}") boolean authenticated,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal) {
        if (authenticated && startRehearsal) {
            throw new IllegalArgumentException("인증 연결과 임시 사용자 시작 대역을 함께 켤 수 없습니다.");
        }
        this.handler = handler;
        this.identityInterceptor = identityInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/tables").addInterceptors(identityInterceptor);
    }
}
