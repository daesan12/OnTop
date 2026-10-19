package com.ssafy.ontop.table;

import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.table.websocket.TableHandshakeInterceptor;
import com.ssafy.ontop.table.websocket.TableWebSocketConfiguration;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.table.service.TableHub;
import java.security.Principal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.CloseStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TableAuthenticationTests {

    private final ServerHttpRequest request = mock(ServerHttpRequest.class);
    private final ServerHttpResponse response = mock(ServerHttpResponse.class);
    private final WebSocketHandler handler = mock(WebSocketHandler.class);

    @Test
    void 인증속성없이_연결처리기가_호출돼도_Hub에_등록하지않는다() throws Exception {
        TableHub hub = mock(TableHub.class);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getAttributes()).thenReturn(Map.of());
        new TableWebSocketHandler(hub, true).afterConnectionEstablished(session);
        verify(session).close(CloseStatus.POLICY_VIOLATION.withReason("Authentication required"));
        verifyNoInteractions(hub);
    }

    @Test
    void 검증기_미설정과_미인증과_검증실패는_서버신원없이_연결을_막는다() {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(TableHandshakeInterceptor.VERIFIED_USER, new VerifiedWebSocketUser(99, Provider.SSAFY));
        TableHandshakeInterceptor missing = new TableHandshakeInterceptor(true, Optional.empty());
        assertThat(missing.beforeHandshake(request, response, handler, attributes)).isFalse();
        verify(response).setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(attributes).isEmpty();

        WebSocketUserResolver resolver = mock(WebSocketUserResolver.class);
        TableHandshakeInterceptor configured = new TableHandshakeInterceptor(true, Optional.of(resolver));
        assertThat(configured.beforeHandshake(request, response, handler, attributes)).isFalse();
        verify(response).setStatusCode(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(resolver);
        Principal principal = () -> "forged-name";
        when(request.getPrincipal()).thenReturn(principal);
        when(resolver.resolve(principal)).thenReturn(Optional.empty());
        assertThat(configured.beforeHandshake(request, response, handler, attributes)).isFalse();
        assertThat(attributes).isEmpty();
    }

    @Test
    void Principal_이름_대신_검증된_내부계정만_보관하고_검증기_오류도_차단한다() {
        Principal principal = () -> "untrusted-provider-subject";
        when(request.getPrincipal()).thenReturn(principal);
        VerifiedWebSocketUser expected = new VerifiedWebSocketUser(123, Provider.NAVER);
        WebSocketUserResolver resolver = mock(WebSocketUserResolver.class);
        when(resolver.resolve(principal)).thenReturn(Optional.of(expected));
        TableHandshakeInterceptor interceptor = new TableHandshakeInterceptor(true, Optional.of(resolver));
        Map<String, Object> attributes = new HashMap<>();
        assertThat(interceptor.beforeHandshake(request, response, handler, attributes)).isTrue();
        assertThat(attributes.get(TableHandshakeInterceptor.VERIFIED_USER)).isEqualTo(expected);

        when(resolver.resolve(principal)).thenThrow(new IllegalStateException("test resolver unavailable"));
        assertThat(interceptor.beforeHandshake(request, response, handler, attributes)).isFalse();
        assertThat(attributes).isEmpty();
        verify(response).setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void 개발모드는_검증기를_쓰지_않고_인증모드와_시작대역은_동시에_켤수없다() {
        WebSocketUserResolver resolver = mock(WebSocketUserResolver.class);
        TableHandshakeInterceptor dev = new TableHandshakeInterceptor(false, Optional.of(resolver));
        assertThat(dev.beforeHandshake(request, response, handler, new HashMap<>())).isTrue();
        verifyNoInteractions(resolver);
        assertThatThrownBy(() -> new TableWebSocketConfiguration(mock(TableWebSocketHandler.class), dev, true, true))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new VerifiedWebSocketUser(0, Provider.NAVER))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
