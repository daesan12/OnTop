package com.ssafy.ontop.table;

import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 관전자 채팅·핑 같은 비필수 이벤트가 필수 전송 자리를 빼앗거나 연결을 끊지 않는지 확인한다. */
class TablePeerTransientTests {

    @Test
    void 큐여유가_32이하이면_비필수이벤트만_버리고_연결과_필수전송은_유지한다() throws Exception {
        WebSocketSession socket = socket();
        List<String> sent = new CopyOnWriteArrayList<>();
        CountDownLatch all = new CountDownLatch(97);
        doAnswer(call -> {
            sent.add(((TextMessage) call.getArgument(0)).getPayload());
            all.countDown();
            return null;
        }).when(socket).sendMessage(any(TextMessage.class));
        AtomicInteger cleaned = new AtomicInteger();
        TablePeer peer = new TablePeer(socket, cleaned::incrementAndGet, heartbeat());
        try {
            for (int index = 0; index < 95; index++) {
                peer.offer("state-" + index);
            }
            assertThat(peer.offerTransient("ping-fit", Duration.ofSeconds(2))).isTrue();
            assertThat(peer.offerTransient("ping-dropped", Duration.ofSeconds(2))).isFalse();
            peer.offer("state-required");
            assertThat(peer.closeReason()).isEqualTo(ConnectionCloseReason.UNSPECIFIED);

            peer.start();
            assertThat(all.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(sent).contains("ping-fit", "state-required").doesNotContain("ping-dropped");
            assertThat(sent.getLast()).isEqualTo("state-required");
            assertThat(cleaned.get()).isZero();
        } finally {
            peer.stop();
        }
    }

    @Test
    void 송신차례에_만료된_비필수이벤트는_보내지않고_필수전송은_순서대로_보낸다() throws Exception {
        WebSocketSession socket = socket();
        List<String> sent = new CopyOnWriteArrayList<>();
        CountDownLatch done = new CountDownLatch(2);
        doAnswer(call -> {
            sent.add(((TextMessage) call.getArgument(0)).getPayload());
            done.countDown();
            return null;
        }).when(socket).sendMessage(any(TextMessage.class));
        TablePeer peer = new TablePeer(socket, () -> { }, heartbeat());
        try {
            peer.offer("before");
            assertThat(peer.offerTransient("expired", Duration.ofNanos(1))).isTrue();
            Thread.sleep(5);
            assertThat(peer.offerTransient("zero", Duration.ZERO)).isFalse();
            peer.offer("after");
            peer.start();
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(50);
            assertThat(sent).containsExactly("before", "after");
        } finally {
            peer.stop();
        }
    }

    @Test
    void 종료된_연결에는_비필수이벤트를_넣지않는다() {
        TablePeer peer = new TablePeer(socket(), () -> { }, heartbeat());
        peer.stop(ConnectionCloseReason.SOCKET_CLOSED);
        assertThat(peer.offerTransient("late", Duration.ofSeconds(2))).isFalse();
    }

    private WebSocketSession socket() {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("transient-test");
        return socket;
    }

    private WebSocketHeartbeat heartbeat() {
        return new WebSocketHeartbeat(Duration.ofSeconds(10), Duration.ofSeconds(10), System::nanoTime);
    }
}
