package com.ssafy.ontop.table.websocket;

import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.UUID;
import java.util.function.LongSupplier;
import org.springframework.web.socket.PingMessage;

// 벽시계 변경에 영향받지 않는 단조 시간으로 연결별 Ping/Pong을 검사한다.
public final class WebSocketHeartbeat {

    private final long interval;
    private final long timeout;
    private final LongSupplier ticker;
    private long lastPong;
    private ByteBuffer pending;
    private long queuedAt;
    private Long sentAt;
    // 즉시 생존 확인의 응답 기한. 일반 heartbeat 기한보다 짧다.
    private Long urgentUntil;

    public WebSocketHeartbeat(Duration interval, Duration timeout, LongSupplier ticker) {
        this.interval = interval.toNanos();
        this.timeout = timeout.toNanos();
        if (this.interval <= 0 || this.timeout <= 0) {
            throw new IllegalArgumentException("heartbeat 시간은 양수여야 합니다.");
        }
        this.ticker = ticker;
        lastPong = ticker.getAsLong();
    }

    public synchronized Probe probe() {
        long now = ticker.getAsLong();
        if (expired(now)) {
            return new Probe(true, null);
        }
        if (pending != null || now - lastPong < interval) {
            return new Probe(false, null);
        }
        UUID id = UUID.randomUUID();
        pending = ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits());
        pending.flip();
        queuedAt = now;
        sentAt = null;
        return new Probe(false, new PingMessage(pending.asReadOnlyBuffer()));
    }

    /**
     * 같은 로그인 세션의 새 연결이 왔을 때 기존 연결의 생존을 바로 확인한다. 이미 보낸 ping이 있으면 응답 기한만 줄인다.
     * @return 새로 보낼 ping. 보낼 필요가 없으면 null
     */
    public synchronized PingMessage probeNow(Duration deadline) {
        long now = ticker.getAsLong();
        urgentUntil = now + deadline.toNanos();
        if (pending != null) {
            return null;
        }
        UUID id = UUID.randomUUID();
        pending = ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits());
        pending.flip();
        queuedAt = now;
        sentAt = null;
        return new PingMessage(pending.asReadOnlyBuffer());
    }

    public synchronized boolean sent(ByteBuffer payload) {
        long now = ticker.getAsLong();
        if (pending == null || !pending.equals(payload) || expired(now)) {
            return false;
        }
        if (sentAt == null) {
            sentAt = now;
        }
        return true;
    }

    public synchronized void pong(ByteBuffer payload) {
        long now = ticker.getAsLong();
        if (pending != null && sentAt != null && !expired(now) && pending.equals(payload)) {
            pending = null;
            sentAt = null;
            urgentUntil = null;
            lastPong = now;
        }
    }

    private boolean expired(long now) {
        return pending != null && (now - (sentAt == null ? queuedAt : sentAt) >= timeout
                || urgentUntil != null && now - urgentUntil >= 0);
    }

    public record Probe(boolean expired, PingMessage ping) {
    }
}
