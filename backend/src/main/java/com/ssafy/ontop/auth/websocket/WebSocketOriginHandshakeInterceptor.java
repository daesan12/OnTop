package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/** 접속권 소비 전에 REST와 동일한 Origin 정책을 적용한다. */
public class WebSocketOriginHandshakeInterceptor implements HandshakeInterceptor {

    private final AuthExchangeOriginPolicy origins;

    public WebSocketOriginHandshakeInterceptor(AuthExchangeOriginPolicy origins) {
        this.origins = origins;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servlet)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        try {
            origins.allowedOrigin(servlet.getServletRequest());
            return true;
        } catch (AuthExchangeException exception) {
            response.setStatusCode(exception.error().status());
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Exception exception) {
    }
}
