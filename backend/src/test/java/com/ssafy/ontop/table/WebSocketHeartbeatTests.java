package com.ssafy.ontop.table;

import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketHeartbeatTests {

    private final AtomicLong nanos = new AtomicLong();
    private final WebSocketHeartbeat heartbeat = new WebSocketHeartbeat(
            Duration.ofSeconds(10), Duration.ofSeconds(10), nanos::get);

    @Test
    void 주기전에는_핑이없고_전송된_핑의_일치하는_퐁만_다음주기를_시작한다() {
        assertThat(heartbeat.probe().ping()).isNull();
        nanos.set(TimeUnit.SECONDS.toNanos(10));
        PingMessage ping = heartbeat.probe().ping();
        assertThat(ping).isNotNull();
        assertThat(heartbeat.probe().ping()).isNull();
        heartbeat.pong(ping.getPayload()); // 전송 전 응답은 인정하지 않는다.
        assertThat(heartbeat.sent(ping.getPayload())).isTrue();
        nanos.set(TimeUnit.SECONDS.toNanos(19));
        heartbeat.pong(ping.getPayload());
        nanos.set(TimeUnit.SECONDS.toNanos(28));
        assertThat(heartbeat.probe().ping()).isNull();
        nanos.set(TimeUnit.SECONDS.toNanos(29));
        assertThat(heartbeat.probe().ping().getPayload()).isNotEqualTo(ping.getPayload());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 전송_대기중이나_퐁대기중이나_타임아웃에_도달하면_만료한다(boolean sent) {
        nanos.set(TimeUnit.SECONDS.toNanos(10));
        PingMessage ping = heartbeat.probe().ping();
        if (sent) {
            heartbeat.sent(ping.getPayload());
        }
        heartbeat.pong(ByteBuffer.wrap(new byte[] {1}));
        nanos.set(TimeUnit.SECONDS.toNanos(20) - 1);
        assertThat(heartbeat.probe().expired()).isFalse();
        nanos.incrementAndGet();
        heartbeat.pong(ping.getPayload()); // 마감 이후 응답으로 부활시키지 않는다.
        assertThat(heartbeat.probe().expired()).isTrue();
        assertThat(heartbeat.sent(ping.getPayload())).isFalse();
    }

    @Test
    void 이전_핑의_퐁은_새_핑의_마감을_늘리지않는다() {
        nanos.set(TimeUnit.SECONDS.toNanos(10));
        PingMessage old = heartbeat.probe().ping();
        heartbeat.sent(old.getPayload());
        heartbeat.pong(old.getPayload());
        nanos.set(TimeUnit.SECONDS.toNanos(20));
        PingMessage current = heartbeat.probe().ping();
        heartbeat.sent(current.getPayload());
        nanos.set(TimeUnit.SECONDS.toNanos(29));
        heartbeat.pong(old.getPayload());
        nanos.set(TimeUnit.SECONDS.toNanos(30));
        assertThat(heartbeat.probe().expired()).isTrue();
    }

    @Test
    void 대기열에서_보낸_시점부터_응답시간을_주되_전송중에도_만료검사는_막히지않는다() throws Exception {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("blocked");
        CountDownLatch sending = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(call -> {
            sending.countDown();
            boolean waiting = true;
            while (waiting) {
                try {
                    release.await();
                    waiting = false;
                } catch (InterruptedException ignored) {
                    // 네트워크 I/O가 인터럽트만으로 풀리지 않는 상황을 재현한다.
                }
            }
            return null;
        }).when(socket).sendMessage(any());
        TablePeer peer = new TablePeer(socket, () -> { }, heartbeat);
        try {
            nanos.set(TimeUnit.SECONDS.toNanos(10));
            assertThat(peer.checkHeartbeat()).isTrue();
            nanos.set(TimeUnit.SECONDS.toNanos(15));
            peer.start();
            assertThat(sending.await(5, TimeUnit.SECONDS)).isTrue();
            nanos.set(TimeUnit.SECONDS.toNanos(24));
            assertThat(peer.checkHeartbeat()).isTrue();
            nanos.set(TimeUnit.SECONDS.toNanos(25));
            assertThat(peer.checkHeartbeat()).isFalse();
            peer.stop();
            verify(socket, timeout(2000)).close(any());
        } finally {
            release.countDown();
            peer.stop();
        }
    }

    @Test
    void 영과_음수_설정은_거절한다() {
        assertThatThrownBy(() -> new WebSocketHeartbeat(Duration.ZERO, Duration.ofSeconds(10), nanos::get))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new WebSocketHeartbeat(Duration.ofSeconds(10), Duration.ofSeconds(-1), nanos::get))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
