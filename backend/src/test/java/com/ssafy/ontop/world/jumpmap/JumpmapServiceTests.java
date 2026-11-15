package com.ssafy.ontop.world.jumpmap;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 지급 지연(pending)·실패 재정산·비활성 동작. 저장소는 지연과 실패만 흉내 낸다. */
class JumpmapServiceTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-30T03:00:00Z"), ZoneOffset.UTC);

    /** 지연·실패를 조절하는 최소 저장소. 금액 계산은 MySQL 테스트가 확인한다. */
    private static final class SlowStore implements JumpmapStore {
        volatile long settleDelayMs;
        final AtomicInteger failures = new AtomicInteger();
        volatile boolean pending = true;
        Runnable duringStatus = () -> { };
        final List<MacroDetection> detections = new CopyOnWriteArrayList<>();
        volatile boolean detectionFails;

        @Override public void recordDetection(MacroDetection detection) {
            if (detectionFails) throw new IllegalStateException("db down");
            detections.add(detection);
        }

        @Override public Started start(String runId, long userId, String channelId, Instant at) {
            return new Started(true, 10, LocalDate.of(2026, 10, 30));
        }
        @Override public boolean passGate(String runId, long userId, int gate, int coins, long elapsedMs, Instant at) { return true; }
        @Override public Optional<Settled> settle(String runId, int gate, Instant now) {
            if (failures.getAndDecrement() > 0) throw new IllegalStateException("db down");
            try { Thread.sleep(settleDelayMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            pending = false;
            return Optional.of(new Settled(runId, 101, gate, 2, 2, 2, 12, LocalDate.of(2026, 10, 30)));
        }
        @Override public Ended end(String runId, RunEnd end) { return new Ended(2, 12, LocalDate.of(2026, 10, 30), null, false); }
        @Override public Status status(long userId, Instant now) {
            duringStatus.run();
            return new Status(false, List.of(), null, 12, LocalDate.of(2026, 10, 30));
        }
        @Override public void seeTips(long userId, Set<String> tips, Instant now) { }
        @Override public int abandonOpenRuns(Instant now) { return 0; }
        @Override public List<RewardKey> pendingRewards(Instant before, int limit) {
            return pending ? List.of(new RewardKey("run-1", 1)) : List.of();
        }
    }

    private record Sent(String user, String type, Map<String, Object> payload) {}

    @Test
    void 상태조회_중_시작된_판을_낡은_빈_스냅샷이_최신_revision으로_덮지_않는다() throws Exception {
        var store = new SlowStore();
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            store.duringStatus = () -> {
                gate(service);
                try {
                    service.drain(Duration.ofSeconds(5));
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(exception);
                }
            };

            var status = service.status("101", Optional::empty);

            assertThat(status.activeRunId()).isNull();
            assertThat(status.revision()).isLessThan((long) sent.getFirst().payload().get("revision"));
        }
    }

    private static JumpmapService service(SlowStore store, List<Sent> sent) throws Exception {
        var course = JumpCourse.loadDefault();
        var service = new JumpmapService(JumpmapActivation.decide(true, course.mapVersion(), () -> course), store, CLOCK);
        service.sink((user, type, payload) -> sent.add(new Sent(user, type, new java.util.HashMap<>(payload))));
        return service;
    }

    private static void gate(JumpmapService service) {
        var view = new JumpmapTracker.RunView("run-1", 9_600, 1, false, 16, false, List.of(), List.of());
        service.accept(new JumpmapTracker.Started("101", "channel-1", "run-1", 0), List.of("101"));
        service.accept(new JumpmapTracker.Progress("101", "channel-1", "run-1", new JumpRun.GatePassed(1, 9_600, 2), view), List.of("101"));
    }

    @Test
    void 지갑_반영이_0_5초_안이면_pending_없이_한번만_알린다() throws Exception {
        var store = new SlowStore();
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            gate(service);
            service.drain(Duration.ofSeconds(5));
            assertThat(sent).extracting(Sent::type).containsExactly("JUMPMAP_STARTED", "JUMPMAP_GATE");
            assertThat(sent.get(1).payload()).containsEntry("pending", false).containsEntry("coinsGranted", 2)
                    .containsEntry("todayEarned", 12).containsEntry("earningsDate", "2026-10-30");
        }
    }

    @Test
    void 늦은_지급은_pending을_먼저_보내고_확정되면_GATE_SETTLED를_보낸다() throws Exception {
        var store = new SlowStore();
        store.settleDelayMs = 1_200;
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            gate(service);
            service.drain(Duration.ofSeconds(10));
            assertThat(sent).extracting(Sent::type).containsExactly("JUMPMAP_STARTED", "JUMPMAP_GATE", "JUMPMAP_GATE_SETTLED");
            var pending = sent.get(1).payload();
            assertThat(pending).containsEntry("pending", true).containsEntry("runCoins", 0).containsEntry("todayEarned", 10);
            assertThat(pending.get("coinsGranted")).isNull();
            assertThat(sent.get(2).payload()).containsEntry("coinsGranted", 2).containsEntry("runCoins", 2);
            assertThat((long) sent.get(2).payload().get("revision")).isGreaterThan((long) pending.get("revision"));
        }
    }

    @Test
    void 재시도가_모두_실패하면_pending을_알리고_주기_정산이_확정한다() throws Exception {
        var store = new SlowStore();
        store.failures.set(100);
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            gate(service);
            service.drain(Duration.ofSeconds(30));
            assertThat(sent).extracting(Sent::type).containsExactly("JUMPMAP_STARTED", "JUMPMAP_GATE");
            assertThat(sent.get(1).payload()).containsEntry("pending", true);
            store.failures.set(0);
            service.settlePending();
            assertThat(sent).extracting(Sent::type).last().isEqualTo("JUMPMAP_GATE_SETTLED");
        }
    }

    @Test
    void 비활성이면_신호를_버리고_status는_enabled_false다() throws Exception {
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = new JumpmapService(JumpmapActivation.disabled(), new SlowStore(), CLOCK)) {
            service.sink((user, type, payload) -> sent.add(new Sent(user, type, payload)));
            service.accept(new JumpmapTracker.Step("101", "channel-1", 0), List.of("101"));
            gate(service);
            service.drain(Duration.ofSeconds(2));
            assertThat(sent).isEmpty();
            assertThat(service.active()).isFalse();
            assertThat(service.status("101", Optional::empty).enabled()).isFalse();
        }
    }

    private static JumpmapTracker.Traced replayed(int run) {
        var landings = java.util.stream.IntStream.rangeClosed(1, 20)
                .mapToObj(block -> new JumpmapTracker.Landing(block, block * 700L)).toList();
        return new JumpmapTracker.Traced("101", "channel-1", "run-" + run,
                new JumpmapTracker.RunTrace(Double.NaN, Double.NaN, null, landings, JumpRun.EndReason.FALL, 15_000));
    }

    @Test
    void 반복_패턴은_운영자_기록으로만_남기고_이용자에게는_아무것도_보내지_않는다() throws Exception {
        var store = new SlowStore();
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            for (int run = 1; run <= 4; run++) {
                service.accept(replayed(run), List.of());
            }
            service.drain(Duration.ofSeconds(5));

            assertThat(sent).isEmpty();
            assertThat(store.detections).singleElement().satisfies(detection -> {
                assertThat(detection.runId()).isEqualTo("run-4");
                assertThat(detection.userId()).isEqualTo(101);
                assertThat(detection.rule()).isEqualTo(JumpmapMacroWatch.REPLAY);
                assertThat(detection.matchedRuns()).isEqualTo(3);
                assertThat(detection.detectedAt()).isEqualTo(CLOCK.instant());
            });
        }
    }

    @Test
    void 반복_패턴_기록이_실패해도_판_처리는_계속된다() throws Exception {
        var store = new SlowStore();
        store.detectionFails = true;
        var sent = new CopyOnWriteArrayList<Sent>();
        try (var service = service(store, sent)) {
            for (int run = 1; run <= 4; run++) {
                service.accept(replayed(run), List.of());
            }
            gate(service);
            service.drain(Duration.ofSeconds(5));

            assertThat(store.detections).isEmpty();
            assertThat(sent).extracting(Sent::type).containsExactly("JUMPMAP_STARTED", "JUMPMAP_GATE");
        }
    }
}
