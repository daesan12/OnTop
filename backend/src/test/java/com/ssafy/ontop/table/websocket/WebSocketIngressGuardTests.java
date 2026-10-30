package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.table.config.WebSocketLimitProperties;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketIngressGuardTests {
    private final AtomicLong clock = new AtomicLong();
    private WebSocketIngressGuard guard(int global, int address, int burst, List<String> proxies) {
        return new WebSocketIngressGuard(new WebSocketLimitProperties(2, burst, global, address, proxies), clock::get);
    }
    private WebSocketSession socket(String id, String ip, String forwarded) {
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        when(socket.getRemoteAddress()).thenReturn(new InetSocketAddress(ip, 12345));
        var headers = new HttpHeaders();
        if (forwarded != null) { headers.add("X-Real-IP", forwarded); }
        when(socket.getHandshakeHeaders()).thenReturn(headers);
        return socket;
    }

    @Test void 토큰은_상한까지회복하고_시간역행은추가허용을만들지않는다() {
        var guard = guard(4, 4, 2, List.of()); var socket = socket("a", "127.0.0.1", null);
        assertThat(guard.admit(socket)).isTrue();
        assertThat(guard.message(socket, 10)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        assertThat(guard.message(socket, 10)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        clock.set(500_000_000);
        assertThat(guard.message(socket, 10)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        clock.set(250_000_000);
        assertThat(guard.message(socket, 10)).isEqualTo(WebSocketIngressGuard.Message.RATE);
        clock.set(10_000_000_000L);
        assertThat(guard.message(socket, 10)).isEqualTo(WebSocketIngressGuard.Message.IGNORE);
        assertThat(guard.rejected(WebSocketIngressGuard.Rejection.RATE)).isEqualTo(1);
    }

    @Test void 긴유휴뒤에도_한번의버스트상한만허용한다() {
        var guard = guard(4, 4, 2, List.of()); var socket = socket("a", "127.0.0.1", null);
        guard.admit(socket); clock.set(100_000_000_000L);
        assertThat(guard.message(socket, 0)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        assertThat(guard.message(socket, 0)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        assertThat(guard.message(socket, 0)).isEqualTo(WebSocketIngressGuard.Message.RATE);
    }

    @Test void 전역과주소상한을독립검사하고_중복정리와재접속에슬롯을복구한다() {
        var guard = guard(2, 1, 10, List.of());
        var first = socket("a", "127.0.0.1", null); var same = socket("b", "127.0.0.1", null);
        var other = socket("c", "127.0.0.2", null); var third = socket("d", "127.0.0.3", null);
        assertThat(guard.admit(first)).isTrue(); assertThat(guard.admit(first)).isTrue();
        assertThat(guard.admit(same)).isFalse(); assertThat(guard.admit(other)).isTrue();
        assertThat(guard.admit(third)).isFalse();
        guard.release(first); guard.release(first);
        assertThat(guard.admit(same)).isTrue(); assertThat(guard.activeConnections()).isEqualTo(2);
        assertThat(guard.rejected(WebSocketIngressGuard.Rejection.ADDRESS_CONNECTIONS)).isEqualTo(1);
        assertThat(guard.rejected(WebSocketIngressGuard.Rejection.GLOBAL_CONNECTIONS)).isEqualTo(1);
    }

    @Test void 같은주소의동시접속도_상한을넘지않는다() throws Exception {
        var guard = guard(3, 3, 2, List.of()); var start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 24; i++) {
                var socket = socket("user-" + i, "127.0.0.1", null);
                jobs.add(workers.submit(() -> { start.await(); return guard.admit(socket); }));
            }
            start.countDown(); int admitted = 0;
            for (var job : jobs) { if (job.get()) { admitted++; } }
            assertThat(admitted).isEqualTo(3); assertThat(guard.activeConnections()).isEqualTo(3);
        }
    }

    @Test void 같은연결의동시메시지도_토큰을한번씩차감한다() throws Exception {
        var guard = guard(3, 3, 2, List.of()); var socket = socket("a", "127.0.0.1", null);
        guard.admit(socket); var start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<java.util.concurrent.Future<WebSocketIngressGuard.Message>>();
            for (int i = 0; i < 24; i++) { jobs.add(workers.submit(() -> { start.await(); return guard.message(socket, 10); })); }
            start.countDown(); var results = new ArrayList<WebSocketIngressGuard.Message>();
            for (var job : jobs) { results.add(job.get()); }
            assertThat(results).filteredOn(result -> result == WebSocketIngressGuard.Message.ACCEPT).hasSize(2);
            assertThat(results).filteredOn(result -> result == WebSocketIngressGuard.Message.RATE).hasSize(1);
        }
    }

    @Test void 신뢰하지않은프록시헤더와_복수잘못된IP는_주소상한을우회하지못한다() {
        var guard = guard(4, 1, 2, List.of());
        assertThat(guard.admit(socket("a", "127.0.0.1", "198.51.100.1"))).isTrue();
        assertThat(guard.admit(socket("b", "127.0.0.1", "198.51.100.2"))).isFalse();
        var trusted = guard(4, 1, 2, List.of("127.0.0.0/8"));
        assertThat(trusted.admit(socket("c", "127.0.0.1", "198.51.100.1"))).isTrue();
        assertThat(trusted.admit(socket("d", "127.0.0.1", "198.51.100.2"))).isTrue();
        assertThat(trusted.admit(socket("e", "127.0.0.1", "attacker.example"))).isTrue();
        assertThat(trusted.admit(socket("f", "127.0.0.1", "198.51.100.3, 198.51.100.4"))).isFalse();
    }

    @Test void 크기경계와_종료콜백유실_다른객체의같은ID_정리를검사한다() {
        var guard = guard(1, 1, 3, List.of()); var first = socket("a", "::1", null);
        assertThat(guard.admit(first)).isTrue();
        assertThat(guard.message(first, 16384)).isEqualTo(WebSocketIngressGuard.Message.ACCEPT);
        assertThat(guard.message(first, 16385)).isEqualTo(WebSocketIngressGuard.Message.SIZE);
        var impostor = socket("a", "::1", null); guard.release(impostor);
        assertThat(guard.activeConnections()).isEqualTo(1);
        when(first.isOpen()).thenReturn(false); guard.pruneClosed();
        assertThat(guard.admit(impostor)).isTrue();
        guard.shutdown(); assertThat(guard.activeConnections()).isZero(); assertThat(guard.admit(impostor)).isFalse();
    }

    @Test void 잘못된제한설정과_호스트이름프록시는_시작할수없다() {
        assertThatThrownBy(() -> new WebSocketLimitProperties(0, 2, 2, 2, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> guard(2, 2, 2, List.of("proxy.example"))).isInstanceOf(IllegalArgumentException.class);
    }
}
