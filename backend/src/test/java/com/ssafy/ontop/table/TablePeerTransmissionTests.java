package com.ssafy.ontop.table;

import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TablePeerTransmissionTests {

    @Test
    void 큐등록이_아닌_완료된_텍스트송신의_UTF8바이트만_세고_Ping은_제외한다() throws Exception {
        WebSocketSession socket = socket();
        AtomicLong messages = new AtomicLong();
        AtomicLong bytes = new AtomicLong();
        AtomicLong clock = new AtomicLong();
        WebSocketHeartbeat heartbeat = new WebSocketHeartbeat(Duration.ofSeconds(10), Duration.ofSeconds(10),
                clock::get);
        CountDownLatch pingSent = new CountDownLatch(1);
        doAnswer(call -> {
            pingSent.countDown();
            return null;
        }).when(socket).sendMessage(any(PingMessage.class));
        TablePeer peer = new TablePeer(socket, () -> { }, heartbeat, size -> {
            messages.incrementAndGet();
            bytes.addAndGet(size);
        });
        try {
            peer.offer("A");
            peer.offer("가😀");
            clock.set(TimeUnit.SECONDS.toNanos(10));
            assertThat(peer.checkHeartbeat()).isTrue();
            assertThat(messages.get()).isZero();
            assertThat(bytes.get()).isZero();

            peer.start();
            assertThat(pingSent.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(messages.get()).isEqualTo(2);
            assertThat(bytes.get()).isEqualTo(8); // A1 + 한글3 + 이모지4 바이트.
        } finally {
            peer.stop();
        }
    }

    @Test
    void 송신예외와_그뒤_미전송_대기열은_송신량에_포함하지않는다() throws Exception {
        WebSocketSession socket = socket();
        AtomicLong messages = new AtomicLong();
        CountDownLatch cleaned = new CountDownLatch(1);
        doThrow(new IOException("test send failure")).when(socket).sendMessage(any(TextMessage.class));
        TablePeer peer = new TablePeer(socket, cleaned::countDown, heartbeat(), size -> messages.incrementAndGet());
        try {
            peer.offer("failed");
            peer.offer("queued");
            peer.start();
            assertThat(cleaned.await(5, TimeUnit.SECONDS)).isTrue();

            peer.offer("after-close");
            assertThat(messages.get()).isZero();
        } finally {
            peer.stop();
        }
    }

    @Test
    void 전송중에는_세지않고_종료요청뒤_늦게_완료한_송신은_한번만_센다() throws Exception {
        WebSocketSession socket = socket();
        AtomicLong messages = new AtomicLong();
        AtomicLong bytes = new AtomicLong();
        CountDownLatch sending = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch cleaned = new CountDownLatch(1);
        doAnswer(call -> {
            sending.countDown();
            awaitUninterruptibly(release);
            return null;
        }).when(socket).sendMessage(any(TextMessage.class));
        TablePeer peer = new TablePeer(socket, cleaned::countDown, heartbeat(), size -> {
            messages.incrementAndGet();
            bytes.addAndGet(size);
        });
        try {
            peer.offer("가😀");
            peer.offer("not-sent");
            peer.start();
            assertThat(sending.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(messages.get()).isZero();

            peer.stop();
            release.countDown();
            assertThat(cleaned.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(messages.get()).isEqualTo(1);
            assertThat(bytes.get()).isEqualTo(7);
        } finally {
            release.countDown();
            peer.stop();
        }
    }

    private WebSocketSession socket() {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("transmission-test");
        return socket;
    }

    private WebSocketHeartbeat heartbeat() {
        return new WebSocketHeartbeat(Duration.ofSeconds(10), Duration.ofSeconds(10), System::nanoTime);
    }

    private void awaitUninterruptibly(CountDownLatch release) {
        boolean interrupted = false;
        while (true) {
            try {
                release.await();
                break;
            } catch (InterruptedException exception) {
                interrupted = true;
            }
        }
        if (interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
