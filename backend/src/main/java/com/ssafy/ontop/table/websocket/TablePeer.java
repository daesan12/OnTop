package com.ssafy.ontop.table.websocket;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

// 연결마다 송신자 하나와 유한 큐를 둬 전송 순서를 유지하고 상태 잠금 밖에서 I/O 한다.
public final class TablePeer {

    private static final Logger log = LoggerFactory.getLogger(TablePeer.class);

    private final WebSocketSession session;
    private final Runnable cleanup;
    private final BlockingQueue<WebSocketMessage<?>> outgoing = new ArrayBlockingQueue<>(128);
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final AtomicBoolean closing = new AtomicBoolean();
    private final WebSocketHeartbeat heartbeat;
    private final LongConsumer textSent;
    private final Thread sender;

    public TablePeer(WebSocketSession session, Runnable cleanup) {
        this(session, cleanup, new WebSocketHeartbeat(Duration.ofSeconds(10), Duration.ofSeconds(10),
                System::nanoTime));
    }

    public TablePeer(WebSocketSession session, Runnable cleanup, WebSocketHeartbeat heartbeat) {
        this(session, cleanup, heartbeat, bytes -> { });
    }

    public TablePeer(WebSocketSession session, Runnable cleanup, WebSocketHeartbeat heartbeat,
            LongConsumer textSent) {
        this.session = session;
        this.cleanup = cleanup;
        this.heartbeat = heartbeat;
        this.textSent = textSent;
        sender = Thread.ofVirtual().name("table-send-" + session.getId()).unstarted(this::sendLoop);
    }

    public void start() {
        sender.start();
    }

    public void offer(String message) {
        if (active.get() && !outgoing.offer(new TextMessage(message))) {
            stop();
        }
    }

    public boolean checkHeartbeat() {
        if (!active.get()) {
            return false;
        }
        WebSocketHeartbeat.Probe probe = heartbeat.probe();
        if (probe.expired()) {
            return false;
        }
        return probe.ping() == null || outgoing.offer(probe.ping());
    }

    public void pong(ByteBuffer payload) {
        heartbeat.pong(payload);
    }

    public void stop() {
        active.set(false);
        sender.interrupt();
        // 송신이 막혀 있어도 Hub 정리/타이머를 기다리게 하지 않는다.
        if (closing.compareAndSet(false, true)) {
            Thread.ofVirtual().name("table-close-" + session.getId()).start(this::closeSession);
        }
    }

    private void sendLoop() {
        try {
            while (active.get()) {
                WebSocketMessage<?> message = outgoing.take();
                if (message instanceof PingMessage ping && !heartbeat.sent(ping.getPayload())) {
                    continue;
                }
                session.sendMessage(message);
                if (message instanceof TextMessage text) {
                    textSent.accept(text.asBytes().length);
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException exception) {
            log.debug("WebSocket 전송 종료 session={}", session.getId(), exception);
        } finally {
            active.set(false);
            outgoing.clear();
            cleanup.run();
            if (closing.compareAndSet(false, true)) {
                closeSession();
            }
        }
    }

    private void closeSession() {
        try {
            session.close(CloseStatus.GOING_AWAY);
        } catch (IOException | RuntimeException exception) {
            log.debug("WebSocket 종료 실패 session={}", session.getId(), exception);
        }
    }
}
