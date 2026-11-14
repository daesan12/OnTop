package com.ssafy.ontop.world.jumpmap;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * 판정 신호를 저장·지급·개인 이벤트로 옮긴다(BE 명세 6·8장). DB 작업은 전용 스레드 하나에서 신호 순서대로 한다.
 * 비활성이면 아무것도 하지 않고 status는 enabled=false다.
 *
 * <p>잠금 순서: 월드 허브 → (없음). 이 서비스 잠금을 잡은 채 sink를 부르지만, 허브 스레드는 이 잠금을 기다리지 않는다
 * ({@link #accept}는 잠금 없이 작업만 넣는다).
 */
public class JumpmapService implements AutoCloseable {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(JumpmapService.class);
    /** 이 시간 안에 지갑 반영이 끝나면 pending 없이 문 통과를 알린다(8장). */
    public static final Duration PENDING_AFTER = Duration.ofMillis(500);
    /** 끊김 등으로 놓친 종료 결과를 status lastRun으로 다시 줄 기간. 원본 기획 확정값이 아닌 구현 제안이다. */
    public static final Duration LAST_RUN_RECOVERY = Duration.ofSeconds(60);
    private static final long[] RETRY_MS = {200, 500, 1_000, 2_000, 4_000, 8_000};

    /** 사용자 개인 이벤트와 주변 착지 알림을 보낸다. 구현은 연결된 세션의 송신 큐에 넣기만 한다. */
    public interface Sink {
        void send(String userId, String type, Map<String, Object> payload);
    }

    public record LastRun(String runId, String channelId, JumpRun.EndReason reason, int gatesPassed, double maxHeight,
            int runCoins, long elapsedMs, Long finishMs, Long bestFinishMs, Boolean newBest, Instant endedAt) {}

    public record StatusView(boolean enabled, long revision, boolean firstRun, List<String> seenTips, Long bestFinishMs,
            int todayEarned, LocalDate today, String activeRunId, Map<String, Object> activeRun, LastRun lastRun) {}

    private final JumpmapActivation activation;
    private final JumpmapStore store;
    private final Clock clock;
    private final ExecutorService db;
    private final ScheduledExecutorService timer;
    private final AtomicLong revisions;
    private volatile Sink sink = (user, type, payload) -> { };
    private final Map<String, Integer> runCoins = new HashMap<>();
    private final Map<String, String> runUsers = new HashMap<>();
    private final Map<String, String> channels = new HashMap<>();
    private final Map<String, LastRun> lastRuns = new HashMap<>();
    /** 마지막으로 확인한 오늘 수입. 지급 대기·저장 실패 이벤트에 쓴다(FE 계약상 정수가 필요하다). */
    private final Map<String, Earned> earned = new HashMap<>();
    private record Earned(int value, LocalDate date) {}
    /** 저장 스레드에서만 쓴다. */
    private final JumpmapMacroWatch macroWatch = new JumpmapMacroWatch();

    public JumpmapService(JumpmapActivation activation, JumpmapStore store, Clock clock) {
        this.activation = activation;
        this.store = activation.active() ? store : null;
        this.clock = clock;
        this.revisions = new AtomicLong(clock.millis() * 1000);
        db = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon(true).name("jumpmap-store").factory());
        timer = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("jumpmap-timer").factory());
    }

    /** 서버 시작 때 남은 판을 DISCONNECT로 닫고, 남은 PENDING 지급을 주기적으로 정산한다. */
    public void start() {
        if (store == null) return;
        int abandoned = store.abandonOpenRuns(clock.instant());
        if (abandoned > 0) log.warn("서버 재시작으로 진행 중 점프맵 판 정리 count={} reason=DISCONNECT", abandoned);
        timer.scheduleWithFixedDelay(() -> db.execute(this::settlePending), 10, 30, TimeUnit.SECONDS);
    }

    public boolean active() { return store != null; }

    /** 운영자 조회 전용. 비활성이면 빈 목록이다. */
    public List<JumpmapStore.MacroSuspect> macroSuspects(int limit) {
        return store == null ? List.of() : store.macroSuspects(limit);
    }

    public JumpmapStore.Ranking ranking(long userId) {
        return store == null ? new JumpmapStore.Ranking(List.of(), null) : store.ranking(userId);
    }

    public void sink(Sink sink) { this.sink = sink; }

    public String courseVersion() { return activation.course().map(JumpCourse::courseVersion).orElse(JumpCourse.COURSE_VERSION); }
    public String rulesVersion() { return activation.course().map(JumpCourse::rulesVersion).orElse(JumpCourse.RULES_VERSION); }

    public String mapVersion() { return activation.course().map(JumpCourse::mapVersion).orElse(""); }

    /** 허브 스레드에서 호출한다. 잠금 없이 착지 알림만 바로 보내고 나머지는 저장 스레드에 넣는다. */
    public void accept(JumpmapTracker.Signal signal, List<String> recipients) {
        if (store == null) return;
        if (signal instanceof JumpmapTracker.Step step) {
            var payload = new LinkedHashMap<String, Object>();
            payload.put("channelId", step.channelId());
            payload.put("mapVersion", mapVersion());
            payload.put("playerId", step.userId());
            payload.put("block", step.block());
            payload.put("serverTime", clock.millis());
            for (String user : recipients) {
                sink.send(user, "JUMPMAP_STEP", payload);
            }
            return;
        }
        if (!JumpmapTracker.member(signal.userId())) return;
        db.execute(() -> handle(signal));
    }

    private void handle(JumpmapTracker.Signal signal) {
        long userId = Long.parseLong(signal.userId());
        synchronized (this) { channels.put(signal.userId(), signal.channelId()); }
        if (signal instanceof JumpmapTracker.Started started) {
            Instant at = clock.instant();
            var result = retry("start", () -> store.start(started.runId(), userId, started.channelId(), at));
            if (result == null) return;
            synchronized (this) {
                earned.put(started.userId(), new Earned(result.todayEarned(), result.today()));
                runCoins.put(started.runId(), 0);
                runUsers.put(started.runId(), started.userId());
                var payload = ordered(started.channelId(), started.runId(), result.todayEarned(), result.today());
                payload.put("rulesVersion", rulesVersion());
                payload.put("courseVersion", courseVersion());
                payload.put("serverTime", at.toEpochMilli());
                emit(started.userId(), "JUMPMAP_STARTED", payload);
            }
            return;
        }
        if (signal instanceof JumpmapTracker.Traced traced) {
            watch(traced, userId);
            return;
        }
        if (!(signal instanceof JumpmapTracker.Progress progress)) return;
        switch (progress.outcome()) {
            case JumpRun.GatePassed gate -> passGate(progress, userId, gate);
            case JumpRun.FinalPad ignored -> {
                synchronized (this) {
                    var payload = scope(progress.channelId());
                    payload.put("runId", progress.runId());
                    emit(progress.userId(), "JUMPMAP_FINAL_PAD", payload);
                }
            }
            case JumpRun.Ended ended -> end(progress, ended);
            case JumpRun.GateRejected rejected ->
                    log.info("점프맵 문 불인정 run={} gate={} reason={}", progress.runId(), rejected.gate(), rejected.reason());
        }
    }

    /** 운영자 전용 기록. 실패해도 판 저장·지급·이용자 이벤트에는 영향을 주지 않으며 다시 시도하지 않는다. */
    private void watch(JumpmapTracker.Traced traced, long userId) {
        try {
            Instant at = clock.instant();
            for (var detection : macroWatch.evaluate(traced.userId(), traced.trace(), at.toEpochMilli())) {
                store.recordDetection(new JumpmapStore.MacroDetection(traced.runId(), userId, detection.rule(),
                        detection.matchedRuns(), detection.evidence(), at));
                log.info("점프맵 반복 패턴 기록 run={} user={} rule={} matched={}", traced.runId(), userId,
                        detection.rule(), detection.matchedRuns());
            }
        } catch (RuntimeException exception) {
            log.warn("점프맵 반복 패턴 기록 실패 run={} reason={}", traced.runId(), exception.getMessage());
        }
    }

    private void passGate(JumpmapTracker.Progress progress, long userId, JumpRun.GatePassed gate) {
        Instant at = clock.instant();
        Boolean recorded = retry("gate", () -> store.passGate(progress.runId(), userId, gate.gate(),
                gate.coinsCalculated(), gate.elapsedMs(), at));
        if (!Boolean.TRUE.equals(recorded)) {
            log.warn("점프맵 문 통과를 저장하지 못함 run={} gate={}", progress.runId(), gate.gate());
            return;
        }
        // 0: 미전송, 1: pending 전송, 2: 확정 전송. 0.5초 안에 확정되면 pending 없이 한 번만 보낸다.
        var sent = new AtomicInteger();
        var pending = timer.schedule(() -> {
            if (sent.compareAndSet(0, 1)) {
                synchronized (this) {
                    emit(progress.userId(), "JUMPMAP_GATE", gatePayload(progress, gate, null,
                            runCoins.getOrDefault(progress.runId(), 0), null, null));
                }
            }
        }, PENDING_AFTER.toMillis(), TimeUnit.MILLISECONDS);
        var settled = retry("settle", () -> store.settle(progress.runId(), gate.gate(), clock.instant()).orElse(null));
        if (settled == null) {
            // PENDING 행은 남는다. 주기 정산이 확정하면 GATE_SETTLED를 보낸다.
            if (sent.compareAndSet(0, 1)) {
                pending.cancel(false);
                synchronized (this) {
                    emit(progress.userId(), "JUMPMAP_GATE", gatePayload(progress, gate, null,
                            runCoins.getOrDefault(progress.runId(), 0), null, null));
                }
            }
            return;
        }
        pending.cancel(false);
        synchronized (this) {
            applySettled(settled);
            if (sent.compareAndSet(0, 2)) {
                emit(progress.userId(), "JUMPMAP_GATE", gatePayload(progress, gate, settled.coinsGranted(),
                        settled.runCoins(), settled.todayEarned(), settled.today()));
            } else {
                emitSettled(progress.userId(), progress.channelId(), settled);
            }
        }
    }

    private void end(JumpmapTracker.Progress progress, JumpRun.Ended ended) {
        var run = progress.run();
        Instant at = clock.instant();
        var end = new JumpmapStore.RunEnd(ended.reason(), at, ended.elapsedMs(), ended.finishMs(), run.gatesPassed(),
                run.finalReached(), Math.max(0, run.maxHeight()), run.landings(), run.suspicious(), run.reasons());
        var result = retry("end", () -> store.end(progress.runId(), end));
        synchronized (this) {
            int coins = result != null ? result.runCoins() : runCoins.getOrDefault(progress.runId(), 0);
            if (result != null) earned.put(progress.userId(), new Earned(result.todayEarned(), result.today()));
            var known = known(progress.userId());
            var payload = ordered(progress.channelId(), progress.runId(), known.value(), known.date());
            payload.put("reason", ended.reason().name());
            payload.put("gatesPassed", run.gatesPassed());
            payload.put("maxHeight", round(run.maxHeight()));
            payload.put("runCoins", coins);
            payload.put("elapsedMs", ended.elapsedMs());
            Long best = result == null ? null : result.bestFinishMs();
            Boolean newBest = result != null && result.newBest();
            if (ended.reason() == JumpRun.EndReason.FINISH) {
                payload.put("finishMs", ended.finishMs());
                payload.put("bestFinishMs", best);
                payload.put("newBest", newBest);
            }
            lastRuns.put(progress.userId(), new LastRun(progress.runId(), progress.channelId(), ended.reason(),
                    run.gatesPassed(), round(run.maxHeight()), coins, ended.elapsedMs(),
                    ended.reason() == JumpRun.EndReason.FINISH ? ended.finishMs() : null,
                    ended.reason() == JumpRun.EndReason.FINISH ? best : null,
                    ended.reason() == JumpRun.EndReason.FINISH ? newBest : null, at));
            emit(progress.userId(), "JUMPMAP_ENDED", payload);
        }
    }

    /** 남은 PENDING 지급(재시작·장애)을 정산한다. 같은 키라 이중 지급은 없다. */
    void settlePending() {
        if (store == null) return;
        try {
            for (var key : store.pendingRewards(clock.instant().minusSeconds(10), 100)) {
                var settled = retry("settle", () -> store.settle(key.runId(), key.gate(), clock.instant()).orElse(null));
                if (settled == null) continue;
                synchronized (this) {
                    applySettled(settled);
                    String user = Long.toString(settled.userId());
                    String channel = channels.get(user);
                    if (channel != null) emitSettled(user, channel, settled);
                }
            }
        } catch (RuntimeException exception) {
            log.warn("점프맵 PENDING 정산 실패 reason={}", exception.getMessage());
        }
    }

    /** REST status. activeRun은 월드 메모리(레지스트리)의 진행 판이고, lastRun은 최근 끝난 판이다. */
    public StatusView status(String userId, Supplier<Optional<JumpmapTracker.RunView>> readActive) {
        if (store == null) {
            LocalDate today = JumpmapStore.kstDate(clock.instant());
            return new StatusView(false, revisions.get(), false, List.of(), null, 0, today, null, null, null);
        }
        // 조회 뒤 새 revision을 붙이면 느린 DB 조회 중 발생한 START/END 이벤트를 낡은 판으로 덮는다.
        // 월드 스냅샷 이전 revision을 고정하며, 레지스트리 잠금을 DB 조회나 서비스 잠금과 겹치지 않는다.
        long snapshotRevision = revisions.get();
        var active = readActive.get();
        var stored = store.status(Long.parseLong(userId), clock.instant());
        synchronized (this) {
            Map<String, Object> run = null;
            String runId = null;
            if (active.isPresent()) {
                var view = active.get();
                runId = view.runId();
                run = new LinkedHashMap<>();
                run.put("runId", view.runId());
                run.put("elapsedMs", view.elapsedMs());
                run.put("gatesPassed", view.gatesPassed());
                run.put("finalReached", view.finalReached());
                run.put("maxHeight", round(view.maxHeight()));
                run.put("runCoins", runCoins.getOrDefault(view.runId(), 0));
            }
            LastRun last = lastRuns.get(userId);
            if (last != null && Duration.between(last.endedAt(), clock.instant()).compareTo(LAST_RUN_RECOVERY) > 0) {
                lastRuns.remove(userId);
                last = null;
            }
            return new StatusView(true, snapshotRevision, stored.firstRun(), stored.seenTips(),
                    stored.bestFinishMs(), stored.todayEarned(), stored.today(), runId, run, last);
        }
    }

    public void seeTips(String userId, Set<String> tips) {
        if (store == null) return;
        store.seeTips(Long.parseLong(userId), tips, clock.instant());
    }

    /** 날짜가 바뀌었으면 새 날짜의 수입은 아직 0이다. */
    private Earned known(String userId) {
        LocalDate today = JumpmapStore.kstDate(clock.instant());
        var value = earned.get(userId);
        return value != null && value.date().equals(today) ? value : new Earned(0, today);
    }

    private void applySettled(JumpmapStore.Settled settled) {
        earned.put(Long.toString(settled.userId()), new Earned(settled.todayEarned(), settled.today()));
        runCoins.computeIfPresent(settled.runId(), (id, coins) -> settled.runCoins());
        lastRuns.computeIfPresent(Long.toString(settled.userId()), (user, last) -> last.runId().equals(settled.runId())
                ? new LastRun(last.runId(), last.channelId(), last.reason(), last.gatesPassed(), last.maxHeight(),
                        settled.runCoins(), last.elapsedMs(), last.finishMs(), last.bestFinishMs(), last.newBest(), last.endedAt())
                : last);
    }

    private void emitSettled(String userId, String channelId, JumpmapStore.Settled settled) {
        var payload = ordered(channelId, settled.runId(), settled.todayEarned(), settled.today());
        payload.put("gate", settled.gate());
        payload.put("coinsGranted", settled.coinsGranted());
        payload.put("runCoins", settled.runCoins());
        emit(userId, "JUMPMAP_GATE_SETTLED", payload);
    }

    private Map<String, Object> gatePayload(JumpmapTracker.Progress progress, JumpRun.GatePassed gate, Integer granted,
            int coins, Integer today, LocalDate date) {
        var known = today == null ? known(progress.userId()) : new Earned(today, date);
        var payload = ordered(progress.channelId(), progress.runId(), known.value(), known.date());
        payload.put("gate", gate.gate());
        payload.put("elapsedMs", gate.elapsedMs());
        payload.put("coinsCalculated", gate.coinsCalculated());
        payload.put("coinsGranted", granted);
        payload.put("pending", granted == null);
        payload.put("runCoins", coins);
        return payload;
    }

    private Map<String, Object> scope(String channelId) {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("channelId", channelId);
        payload.put("mapVersion", mapVersion());
        return payload;
    }

    private Map<String, Object> ordered(String channelId, String runId, int todayEarned, LocalDate date) {
        var payload = scope(channelId);
        payload.put("runId", runId);
        payload.put("todayEarned", todayEarned);
        payload.put("dailyCap", com.ssafy.ontop.minigame.service.MinigameRewardBudget.DAILY_CAP);
        payload.put("earningsDate", date.toString());
        return payload;
    }

    /** revision은 이 잠금 안에서 붙이고 바로 송신 큐에 넣어 도착 순서와 같게 한다. */
    private void emit(String userId, String type, Map<String, Object> payload) {
        payload.put("revision", revisions.incrementAndGet());
        try {
            sink.send(userId, type, payload);
        } catch (RuntimeException exception) {
            log.warn("점프맵 이벤트 전송 실패 type={} reason={}", type, exception.getMessage());
        }
    }

    /** 저장 스레드에서만 부른다. 재시도 동안 같은 사용자의 다음 작업은 순서대로 기다린다. */
    private <T> T retry(String operation, Supplier<T> work) {
        for (int attempt = 0; ; attempt++) {
            try {
                return work.get();
            } catch (RuntimeException exception) {
                if (attempt >= RETRY_MS.length) {
                    log.error("점프맵 저장 실패 operation={} reason={}", operation, exception.getMessage());
                    return null;
                }
                log.warn("점프맵 저장 재시도 operation={} attempt={} reason={}", operation, attempt + 1, exception.getMessage());
                try {
                    Thread.sleep(RETRY_MS[attempt]);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return null;
                }
            }
        }
    }

    private static double round(double value) {
        return Math.round(Math.max(0, value) * 100) / 100.0;
    }

    /** 테스트·종료용. 넣어 둔 작업이 끝날 때까지 기다린다. */
    public void drain(Duration timeout) throws InterruptedException {
        var done = new java.util.concurrent.CountDownLatch(1);
        db.execute(done::countDown);
        done.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public void close() {
        timer.shutdownNow();
        db.shutdown();
    }
}
