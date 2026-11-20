package com.ssafy.ontop.table;

import com.ssafy.ontop.table.service.TableHub;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;

/**
 * Opt-in local load probe: no database, production endpoint, or stored identity.
 * Set ONTOP_WORLD_LOAD_PROBE=true and run only this test class. Add
 * ONTOP_WORLD_LOAD_TOPOLOGY_COMPARE=true for paired 80 versus 40+40 runs.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=false",
        "ontop.world.dynamic-channels.enabled=false",
        "ontop.world.channels[0].channel-id=channel-1",
        "ontop.world.channels[0].name=local-load-probe",
        "ontop.world.channels[0].capacity=80",
        "ontop.world.channels[1].channel-id=channel-2",
        "ontop.world.channels[1].name=local-load-probe-2",
        "ontop.world.channels[1].capacity=40",
        "ontop.websocket.heartbeat.interval=30s",
        "ontop.websocket.heartbeat.timeout=30s"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@EnabledIfEnvironmentVariable(named = "ONTOP_WORLD_LOAD_PROBE", matches = "true")
class WorldLoadProbeTests {
    @LocalServerPort private int port;
    @Autowired private TableHub hub;

    @Test
    void measureActualLoopbackSockets() throws Exception {
        try (HttpClient http = HttpClient.newHttpClient()) {
            if ("true".equals(System.getenv("ONTOP_WORLD_LOAD_TOPOLOGY_COMPARE"))) {
                for (int i = 0; i < 2; i++) {
                    runStage(http, 80, true, false);
                    runStage(http, 80, true, true);
                }
                return;
            }
            for (int users : new int[] {20, 40, 60, 80}) {
                runStage(http, users, false, false);
            }
            for (int users : new int[] {20, 40, 60, 80}) {
                runStage(http, users, true, false);
            }
        }
    }

    private void runStage(HttpClient http, int users, boolean moving, boolean split) throws Exception {
        var clients = new ArrayList<Client>();
        try {
            for (int i = 0; i < users; i++) {
                var client = new Client();
                client.socket = http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(10))
                        .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tables"), client).join();
                clients.add(client);
                if (!client.connected.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("CONNECTED timeout at user " + i);
                }
                client.send("CHANNEL_JOIN", "{\"channelId\":\""
                        + (split && i >= users / 2 ? "channel-2" : "channel-1") + "\"}");
                if (!client.joined.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("CHANNEL_JOIN timeout at user " + i);
                }
            }
            Thread.sleep(1500);
            for (var client : clients) client.reset();
            var threads = java.lang.management.ManagementFactory.getThreadMXBean();
            if (threads.isThreadContentionMonitoringSupported()) {
                threads.setThreadContentionMonitoringEnabled(true);
            }
            long heartbeatId = java.util.Arrays.stream(threads.getAllThreadIds())
                    .filter(id -> {
                        var info = threads.getThreadInfo(id);
                        return info != null && info.getThreadName().equals("table-heartbeat");
                    }).findFirst().orElse(-1);
            long blockedBefore = heartbeatId < 0 ? -1 : threads.getThreadInfo(heartbeatId).getBlockedTime();
            var tickSamples = new ConcurrentLinkedQueue<TableHub.WorldTickTiming>();
            var sampling = new AtomicBoolean(true);
            Thread sampler = Thread.ofVirtual().name("world-load-timing-sampler").start(() -> {
                long lastRun = -1;
                while (sampling.get()) {
                    var timing = hub.lastWorldTickTiming();
                    if (timing != null && timing.run() != lastRun) {
                        tickSamples.add(timing);
                        lastRun = timing.run();
                    }
                    java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(2));
                }
            });
            long start = System.nanoTime();
            long end = start + TimeUnit.SECONDS.toNanos(5);
            int round = 0;
            while (System.nanoTime() < end) {
                long batchStart = System.nanoTime();
                for (int i = 0; i < clients.size(); i++) {
                    var client = clients.get(i);
                    if (!moving || round % 2 == 0) client.probe();
                    if (moving || i % 4 == 0) {
                        client.move(round * clients.size() + i + 1);
                    }
                }
                round++;
                long remaining = TimeUnit.MILLISECONDS.toNanos(moving ? 200 : 500)
                        - (System.nanoTime() - batchStart);
                if (remaining > 0) TimeUnit.NANOSECONDS.sleep(remaining);
            }
            sampling.set(false);
            sampler.join(1000);
            long blockedAfter = heartbeatId < 0 ? -1 : threads.getThreadInfo(heartbeatId).getBlockedTime();
            Thread.sleep(600);
            var rtts = new ArrayList<Long>();
            var gaps = new ArrayList<Long>();
            long pushes = 0, bytes = 0, errors = 0, closes = 0;
            for (var client : clients) {
                rtts.addAll(client.rtts);
                gaps.addAll(client.pushGaps);
                pushes += client.pushes.get();
                bytes += client.bytes.get();
                errors += client.errors.get();
                closes += client.closes.get();
            }
            System.out.printf("WORLD_LOAD scenario=%s users=%d probe_sent=%d probe_ok=%d rtt_p50_ms=%.2f rtt_p95_ms=%.2f rtt_max_ms=%.2f push_gap_p50_ms=%.2f push_gap_p95_ms=%.2f push_gap_max_ms=%.2f pushes=%d received_Mchars=%.2f heartbeat_blocked_ms=%d errors=%d closes=%d active=%d%n",
                    moving ? (split ? "move5hz_2x40" : "move5hz_single") : "light", users,
                    clients.stream().mapToInt(c -> c.probesSent.get()).sum(), rtts.size(),
                    percentile(rtts, 50), percentile(rtts, 95), percentile(rtts, 100),
                    percentile(gaps, 50), percentile(gaps, 95), percentile(gaps, 100),
                    pushes, bytes / 1_000_000.0,
                    blockedBefore < 0 || blockedAfter < 0 ? -1 : blockedAfter - blockedBefore,
                    errors, closes, hub.metricsSnapshot().activeConnections());
            var ticks = List.copyOf(tickSamples);
            var patches = ticks.stream().filter(t -> t.patches() > 0).toList();
            System.out.printf("WORLD_TIMING scenario=%s users=%d tick_samples=%d patch_samples=%d total_p95_ms=%.2f registry_p95_ms=%.2f physics_p95_ms=%.2f snapshot_p95_ms=%.2f lag_p95_ms=%.2f publish_p95_ms=%.2f encode_p95_ms=%.2f queue_p95_ms=%.2f position_log_p95_ms=%.2f watch_p95_ms=%.2f%n",
                    moving ? (split ? "move5hz_2x40" : "move5hz_single") : "light", users,
                    ticks.size(), patches.size(),
                    percentile(ticks.stream().map(TableHub.WorldTickTiming::totalNanos).toList(), 95),
                    percentile(ticks.stream().map(TableHub.WorldTickTiming::registryNanos).toList(), 95),
                    percentile(ticks.stream().map(TableHub.WorldTickTiming::physicsNanos).toList(), 95),
                    percentile(ticks.stream().map(TableHub.WorldTickTiming::snapshotNanos).toList(), 95),
                    percentile(ticks.stream().map(TableHub.WorldTickTiming::simulationLagNanos).toList(), 95),
                    percentile(patches.stream().map(TableHub.WorldTickTiming::publishNanos).toList(), 95),
                    percentile(patches.stream().map(TableHub.WorldTickTiming::encodeNanos).toList(), 95),
                    percentile(patches.stream().map(TableHub.WorldTickTiming::queueNanos).toList(), 95),
                    percentile(patches.stream().map(TableHub.WorldTickTiming::positionLogNanos).toList(), 95),
                    percentile(patches.stream().map(TableHub.WorldTickTiming::watchNanos).toList(), 95));
            int sent = clients.stream().mapToInt(c -> c.probesSent.get()).sum();
            if (rtts.size() != sent || errors != 0 || closes != 0
                    || hub.metricsSnapshot().activeConnections() != users || ticks.size() < 20
                    || moving && patches.isEmpty()) {
                throw new AssertionError("부하 측정 표본이 유실되거나 연결이 종료됐습니다.");
            }
        } finally {
            for (var client : clients) {
                if (client.socket != null) client.socket.abort();
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (hub.metricsSnapshot().activeConnections() != 0 && System.nanoTime() < deadline) {
                Thread.sleep(50);
            }
        }
    }

    private static double percentile(List<Long> nanos, int percentile) {
        if (nanos.isEmpty()) return Double.NaN;
        long[] values = nanos.stream().mapToLong(Long::longValue).sorted().toArray();
        int index = (int) Math.ceil(values.length * percentile / 100.0) - 1;
        return values[Math.max(0, index)] / 1_000_000.0;
    }

    private static final class Client implements WebSocket.Listener {
        volatile WebSocket socket;
        final CountDownLatch connected = new CountDownLatch(1);
        final CountDownLatch joined = new CountDownLatch(1);
        final StringBuilder buffer = new StringBuilder();
        final ConcurrentHashMap<String, Long> pending = new ConcurrentHashMap<>();
        final ConcurrentLinkedQueue<Long> rtts = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Long> pushGaps = new ConcurrentLinkedQueue<>();
        final AtomicInteger probesSent = new AtomicInteger();
        final AtomicLong pushes = new AtomicLong();
        final AtomicLong bytes = new AtomicLong();
        final AtomicLong errors = new AtomicLong();
        final AtomicLong closes = new AtomicLong();
        volatile long lastPush;

        void reset() {
            rtts.clear(); pushGaps.clear(); pending.clear();
            probesSent.set(0); pushes.set(0); bytes.set(0); errors.set(0); closes.set(0); lastPush = 0;
        }

        void probe() {
            String id = UUID.randomUUID().toString();
            pending.put(id, System.nanoTime());
            probesSent.incrementAndGet();
            send(id, "WORLD_TIME_CHECK", "{}");
        }

        void move(int sequence) {
            send("WORLD_MOVE", "{\"seq\":" + sequence + ",\"dx\":" + (sequence % 2 == 0 ? 1 : -1)
                    + ",\"dz\":0,\"run\":false}");
        }

        void send(String type, String payload) {
            send(UUID.randomUUID().toString(), type, payload);
        }

        void send(String id, String type, String payload) {
            try {
                socket.sendText("{\"type\":\"" + type + "\",\"requestId\":\"" + id
                        + "\",\"payload\":" + payload + "}", true).join();
            } catch (RuntimeException failure) {
                errors.incrementAndGet();
            }
        }

        @Override public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override public java.util.concurrent.CompletionStage<?> onText(WebSocket webSocket,
                CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String text = buffer.toString();
                buffer.setLength(0);
                bytes.addAndGet(text.length());
                if (text.contains("\"type\":\"CONNECTED\"")) connected.countDown();
                if (text.contains("\"type\":\"WORLD_STATE\"")) {
                    joined.countDown();
                    if (text.startsWith("{\"requestId\":null")) {
                        long now = System.nanoTime();
                        if (lastPush != 0) pushGaps.add(now - lastPush);
                        lastPush = now;
                        pushes.incrementAndGet();
                    }
                }
                if (text.contains("\"type\":\"ERROR\"")) errors.incrementAndGet();
                if (text.contains("\"type\":\"WORLD_TIME_STATE\"")) {
                    int marker = text.indexOf("\"requestId\":\"");
                    if (marker >= 0) {
                        int begin = marker + 13;
                        int finish = text.indexOf('"', begin);
                        Long sent = pending.remove(text.substring(begin, finish));
                        if (sent != null) rtts.add(System.nanoTime() - sent);
                    }
                }
            }
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override public java.util.concurrent.CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
            webSocket.request(1);
            return webSocket.sendPong(message);
        }

        @Override public java.util.concurrent.CompletionStage<?> onClose(WebSocket webSocket,
                int statusCode, String reason) {
            closes.incrementAndGet();
            return CompletableFuture.completedFuture(null);
        }

        @Override public void onError(WebSocket webSocket, Throwable error) {
            errors.incrementAndGet();
        }
    }
}
