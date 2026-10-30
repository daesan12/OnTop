package com.ssafy.ontop.table.config;

import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.table.websocket.WebSocketIngressGuard;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketLimitsConfigurationTests {
    @Test void 기존구체타입과인증호출을유지하고_파싱전에모든텍스트를제한한다() throws Exception {
        var hub = mock(TableHub.class); var connections = mock(MemberWebSocketConnections.class);
        var guard = new WebSocketIngressGuard(new WebSocketLimitProperties(1, 2, 2, 2, List.of()), () -> 0);
        var beans = new StaticListableBeanFactory(); beans.addBean("guard", guard);
        var target = new TableWebSocketHandler(hub, false, connections);
        var proxy = (TableWebSocketHandler) WebSocketLimitsConfiguration.webSocketIngressBoundary(
                beans.getBeanProvider(WebSocketIngressGuard.class)).postProcessAfterInitialization(target, "tableWebSocketHandler");
        var first = socket("a"); var second = socket("b"); var third = socket("c");
        proxy.afterConnectionEstablished(first); proxy.afterConnectionEstablished(second); proxy.afterConnectionEstablished(third);
        verify(hub).connect(first); verify(hub).connect(second); verify(hub, never()).connect(third);
        verify(third).close(new CloseStatus(1013, "WS_CONNECTION_LIMIT"));
        proxy.handleMessage(first, new TextMessage("not-json"));
        proxy.handleMessage(first, new PongMessage());
        proxy.handleMessage(first, new TextMessage("still-not-json"));
        proxy.handleMessage(first, new TextMessage("no parsing"));
        proxy.handleMessage(first, new TextMessage("no error flood"));
        verify(hub, times(2)).receive(eq("a"), anyString());
        verify(first).close(new CloseStatus(1013, "WS_RATE_LIMITED"));
        proxy.handleMessage(second, new TextMessage("healthy peer")); verify(hub).receive("b", "healthy peer");
        proxy.afterConnectionClosed(first, CloseStatus.NORMAL); proxy.afterConnectionClosed(second, CloseStatus.NORMAL);
        assertThat(guard.activeConnections()).isZero();
    }

    private WebSocketSession socket(String id) throws Exception {
        var socket = mock(WebSocketSession.class); var open = new AtomicBoolean(true);
        when(socket.getId()).thenReturn(id); when(socket.isOpen()).thenAnswer(ignored -> open.get());
        when(socket.getAttributes()).thenReturn(new HashMap<>());
        doAnswer(ignored -> { open.set(false); return null; }).when(socket).close(any());
        return socket;
    }
}
