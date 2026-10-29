package com.ssafy.ontop.table.config;

import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.table.websocket.WebSocketIngressGuard;
import com.ssafy.ontop.table.websocket.WebSocketIngressGuard.Message;
import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** 기존 구체 Handler 주입 타입과 팀원 인증 코드를 유지하면서 공개 수명 메서드만 감싼다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties(WebSocketLimitProperties.class)
public class WebSocketLimitsConfiguration {
    @Bean WebSocketIngressGuard webSocketIngressGuard(WebSocketLimitProperties properties) {
        return new WebSocketIngressGuard(properties);
    }

    @Bean MeterBinder webSocketIngressMetrics(WebSocketIngressGuard guard) {
        return registry -> {
            Gauge.builder("ontop.websocket.ingress.connections", guard, WebSocketIngressGuard::activeConnections)
                    .register(registry);
            for (var reason : WebSocketIngressGuard.Rejection.values()) {
                FunctionCounter.builder("ontop.websocket.ingress.rejected", guard, value -> value.rejected(reason))
                        .tag("reason", reason.name()).register(registry);
            }
        };
    }

    @Bean static BeanPostProcessor webSocketIngressBoundary(ObjectProvider<WebSocketIngressGuard> guards) {
        return new BeanPostProcessor() {
            @Override public Object postProcessAfterInitialization(Object bean, String name) {
                if (!(bean instanceof TableWebSocketHandler)) { return bean; }
                WebSocketIngressGuard guard = guards.getObject();
                ProxyFactory factory = new ProxyFactory(bean);
                factory.setProxyTargetClass(true);
                factory.addAdvice((MethodInterceptor) invocation -> {
                    String method = invocation.getMethod().getName();
                    Object[] arguments = invocation.getArguments();
                    if (arguments.length == 0 || !(arguments[0] instanceof WebSocketSession socket)) {
                        return invocation.proceed();
                    }
                    if (method.equals("afterConnectionEstablished")) {
                        if (!guard.admit(socket)) {
                            socket.close(new CloseStatus(1013, "WS_CONNECTION_LIMIT"));
                            return null;
                        }
                        try { return invocation.proceed(); }
                        finally { if (!socket.isOpen()) { guard.release(socket); } }
                    }
                    if (method.equals("handleMessage") && arguments.length == 2
                            && arguments[1] instanceof TextMessage text) {
                        Message decision = guard.message(socket, text.getPayloadLength());
                        if (decision == Message.IGNORE) { return null; }
                        if (decision != Message.ACCEPT) {
                            try { socket.close(decision == Message.SIZE ? new CloseStatus(1009, "WS_MESSAGE_TOO_LARGE")
                                    : new CloseStatus(1013, "WS_RATE_LIMITED")); }
                            finally { if (!socket.isOpen()) { guard.release(socket); } }
                            return null;
                        }
                    }
                    if (method.equals("afterConnectionClosed")) {
                        try { return invocation.proceed(); }
                        finally { guard.release(socket); }
                    }
                    if (method.equals("handleTransportError")) {
                        guard.closing(socket);
                        try { return invocation.proceed(); }
                        finally { if (!socket.isOpen()) { guard.release(socket); } }
                    }
                    return invocation.proceed();
                });
                return factory.getProxy(bean.getClass().getClassLoader());
            }
        };
    }
}
