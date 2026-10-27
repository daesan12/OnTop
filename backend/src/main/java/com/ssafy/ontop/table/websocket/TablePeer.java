package com.ssafy.ontop.table.websocket;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
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
    // 비필수 이벤트는 큐에 이만큼 여유가 남아 있을 때만 넣어 필수 상태 전송 자리를 남긴다.
    static final int TRANSIENT_RESERVE = 32;

    private final BlockingQueue<Outgoing> outgoing = new ArrayBlockingQueue<>(128);
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final AtomicBoolean closing = new AtomicBoolean();
    private final AtomicReference<ConnectionCloseReason> closeReason = new AtomicReference<>();
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
        if (active.get() && !outgoing.offer(new Outgoing(new TextMessage(message), 0, false))) {
            stop(ConnectionCloseReason.SEND_QUEUE_FULL);
        }
    }

    /**
     * 관전자 채팅·핑처럼 놓쳐도 경기 진행에 영향이 없는 이벤트를 넣는다. 큐 여유가 적으면 연결을 끊지 않고
     * 버리고(false), 송신 차례에 만료됐으면 보내지 않는다. 경기 상태·응답은 기존 offer를 사용한다.
     */
    public boolean offerTransient(String message, Duration ttl) {
        if (!active.get() || ttl.isNegative() || ttl.isZero()
                || outgoing.remainingCapacity() <= TRANSIENT_RESERVE) {
            return false;
        }
        return outgoing.offer(new Outgoing(new TextMessage(message), System.nanoTime() + ttl.toNanos(), true));
    }

    public boolean checkHeartbeat() {
        if (!active.get()) {
            return false;
        }
        WebSocketHeartbeat.Probe probe = heartbeat.probe();
        if (probe.expired()) {
            rememberCloseReason(ConnectionCloseReason.HEARTBEAT_TIMEOUT);
            return false;
        }
        if (probe.ping() != null && !outgoing.offer(new Outgoing(probe.ping(), 0, false))) {
            rememberCloseReason(ConnectionCloseReason.SEND_QUEUE_FULL);
            return false;
        }
        return true;
    }

    public void pong(ByteBuffer payload) {
        heartbeat.pong(payload);
    }

    public void stop() {
        stop(ConnectionCloseReason.UNSPECIFIED);
    }

    public void stop(ConnectionCloseReason reason) {
        rememberCloseReason(reason);
        active.set(false);
        sender.interrupt();
        // 송신이 막혀 있어도 Hub 정리/타이머를 기다리게 하지 않는다.
        if (closing.compareAndSet(false, true)) {
            Thread.ofVirtual().name("table-close-" + session.getId()).start(this::closeSession);
        }
    }

    public ConnectionCloseReason closeReason() {
        ConnectionCloseReason reason = closeReason.get();
        return reason == null ? ConnectionCloseReason.UNSPECIFIED : reason;
    }

    private void rememberCloseReason(ConnectionCloseReason reason) {
        closeReason.compareAndSet(null, reason);
    }

    private void sendLoop() {
        try {
            while (active.get()) {
                Outgoing next = outgoing.take();
                if (next.expiring() && System.nanoTime() - next.expiresAtNanos() >= 0) {
                    continue;
                }
                WebSocketMessage<?> message = next.message();
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
            rememberCloseReason(ConnectionCloseReason.SEND_ERROR);
            log.debug("WebSocket 전송 종료 session={}", session.getId(), exception);
        } finally {
            rememberCloseReason(ConnectionCloseReason.UNSPECIFIED);
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

    private record Outgoing(WebSocketMessage<?> message, long expiresAtNanos, boolean expiring) {
    }
}
