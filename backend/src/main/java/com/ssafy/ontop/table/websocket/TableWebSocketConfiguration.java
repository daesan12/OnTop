package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.websocket.WebSocketOriginHandshakeInterceptor;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class TableWebSocketConfiguration implements WebSocketConfigurer {

    private final TableWebSocketHandler handler;
    private final TableHandshakeInterceptor identityInterceptor;
    private final AuthExchangeOriginPolicy origins;

    public TableWebSocketConfiguration(TableWebSocketHandler handler, TableHandshakeInterceptor identityInterceptor,
            @Value("${ontop.websocket.authenticated:true}") boolean authenticated,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            AuthExchangeOriginPolicy origins) {
        if (authenticated && startRehearsal) {
            throw new IllegalArgumentException("인증 연결과 임시 사용자 시작 대역을 함께 켤 수 없습니다.");
        }
        this.handler = handler;
        this.identityInterceptor = identityInterceptor;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        List<String> allowed;
        try {
            allowed = origins.configuredOrigins();
        } catch (AuthExchangeException exception) {
            // 기존 요청 시점의 안전한 설정 오류 계약을 유지한다. 잘못된 값은 허용 목록에 넣지 않는다.
            // 앞단 Origin 인터셉터가 해당 요청을 실패시키므로 기본 same-origin 검사로 우회할 수 없다.
            allowed = List.of();
        }
        registry.addHandler(handler, "/ws/tables")
                .addInterceptors(new WebSocketOriginHandshakeInterceptor(origins), identityInterceptor)
                .setAllowedOrigins(allowed.toArray(String[]::new));
    }
}
