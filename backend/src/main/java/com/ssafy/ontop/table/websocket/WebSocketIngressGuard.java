package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.table.config.WebSocketLimitProperties;
import jakarta.annotation.PreDestroy;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.LongSupplier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.web.socket.WebSocketSession;

/** Upgrade 후 추가 회원 재검사·Hub 등록·파싱 앞의 단일 JVM 경계. IP는 메모리에만 보관한다. */
public final class WebSocketIngressGuard {
    public static final int MAX_TEXT_BYTES = 16 * 1024;
    public enum Rejection { GLOBAL_CONNECTIONS, ADDRESS_CONNECTIONS, RATE, SIZE }
    public enum Message { ACCEPT, RATE, SIZE, IGNORE }

    private final WebSocketLimitProperties properties;
    private final LongSupplier nanos;
    private final List<IpAddressMatcher> trustedProxies;
    private final ConcurrentHashMap<String, Lease> leases = new ConcurrentHashMap<>();
    private final Map<String, Integer> addresses = new HashMap<>();
    private final Map<Rejection, LongAdder> rejected = new java.util.EnumMap<>(Rejection.class);
    private boolean stopped;

    public WebSocketIngressGuard(WebSocketLimitProperties properties) { this(properties, System::nanoTime); }

    public WebSocketIngressGuard(WebSocketLimitProperties properties, LongSupplier nanos) {
        this.properties = properties;
        this.nanos = nanos;
        trustedProxies = properties.trustedProxyCidrs().stream().map(cidr -> {
            String literal = cidr.split("/", -1)[0];
            if (numeric(literal) == null) { throw new IllegalArgumentException("프록시는 숫자 IP/CIDR로 설정해주세요."); }
            return new IpAddressMatcher(cidr);
        }).toList();
        for (Rejection reason : Rejection.values()) { rejected.put(reason, new LongAdder()); }
    }

    public boolean admit(WebSocketSession socket) {
        String address = address(socket);
        synchronized (this) {
            pruneClosed();
            Lease existing = leases.get(socket.getId());
            if (existing != null) { return existing.socket == socket; }
            if (stopped || leases.size() >= properties.maxConnections()) {
                rejected.get(Rejection.GLOBAL_CONNECTIONS).increment(); return false;
            }
            int count = addresses.getOrDefault(address, 0);
            if (count >= properties.maxConnectionsPerAddress()) {
                rejected.get(Rejection.ADDRESS_CONNECTIONS).increment(); return false;
            }
            leases.put(socket.getId(), new Lease(socket, address, properties.burst(), nanos.getAsLong()));
            addresses.put(address, count + 1);
            return true;
        }
    }

    public Message message(WebSocketSession socket, int bytes) {
        Lease lease = leases.get(socket.getId());
        if (lease == null || lease.socket != socket) { return Message.IGNORE; }
        Message result = lease.consume(bytes, nanos.getAsLong(), properties.messagesPerSecond(), properties.burst());
        if (result == Message.RATE) { rejected.get(Rejection.RATE).increment(); }
        if (result == Message.SIZE) { rejected.get(Rejection.SIZE).increment(); }
        return result;
    }

    public void closing(WebSocketSession socket) {
        Lease lease = leases.get(socket.getId());
        if (lease != null && lease.socket == socket) { lease.block(); }
    }

    public synchronized void release(WebSocketSession socket) {
        Lease lease = leases.get(socket.getId());
        if (lease == null || lease.socket != socket || !leases.remove(socket.getId(), lease)) { return; }
        lease.block();
        addresses.computeIfPresent(lease.address, (key, count) -> count == 1 ? null : count - 1);
    }

    @Scheduled(fixedDelay = 10000)
    public synchronized void pruneClosed() {
        for (Lease lease : leases.values()) { if (!lease.socket.isOpen()) { release(lease.socket); } }
    }

    public int activeConnections() { return leases.size(); }
    public long rejected(Rejection reason) { return rejected.get(reason).sum(); }

    @PreDestroy
    public synchronized void shutdown() {
        stopped = true;
        leases.values().forEach(Lease::block);
        leases.clear();
        addresses.clear();
    }

    private String address(WebSocketSession socket) {
        InetSocketAddress peer = socket.getRemoteAddress();
        String actual = peer == null || peer.getAddress() == null ? "unknown" : peer.getAddress().getHostAddress();
        if (actual.equals("unknown") || trustedProxies.stream().noneMatch(proxy -> proxy.matches(actual))) {
            return actual;
        }
        // Nginx가 덮어쓰는 한 홉 X-Real-IP만 사용한다. 임의 X-Forwarded-For 목록은 해석하지 않는다.
        List<String> values = socket.getHandshakeHeaders().get("X-Real-IP");
        String forwarded = values != null && values.size() == 1 ? numeric(values.getFirst()) : null;
        return forwarded == null ? actual : forwarded;
    }

    private static String numeric(String value) {
        if (value == null || value.length() > 64) { return null; }
        String text = value.trim();
        if (!text.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")
                && !(text.contains(":") && text.matches("[0-9a-fA-F:.]+"))) { return null; }
        try { return InetAddress.getByName(text).getHostAddress(); }
        catch (UnknownHostException invalid) { return null; }
    }

    private static final class Lease {
        private final WebSocketSession socket;
        private final String address;
        private double tokens;
        private long previous;
        private boolean blocked;
        private Lease(WebSocketSession socket, String address, int tokens, long now) {
            this.socket = socket; this.address = address; this.tokens = tokens; previous = now;
        }
        private synchronized Message consume(int bytes, long now, int rate, int burst) {
            if (blocked) { return Message.IGNORE; }
            if (bytes < 0 || bytes > MAX_TEXT_BYTES) { blocked = true; return Message.SIZE; }
            long elapsed = now - previous;
            if (elapsed > 0) { tokens = Math.min(burst, tokens + elapsed / 1_000_000_000.0 * rate); previous = now; }
            if (tokens < 1) { blocked = true; return Message.RATE; }
            tokens -= 1;
            return Message.ACCEPT;
        }
        private synchronized void block() { blocked = true; }
    }
}
