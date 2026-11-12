package com.ssafy.ontop.world.jumpmap;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** DB 없는 소켓 테스트용 저장소. 금액·상한의 실제 트랜잭션은 {@code JumpmapMySqlTests}가 검증한다. */
public class InMemoryJumpmapStore implements JumpmapStore {
    private record Run(long userId, int gates, int coins, boolean ended) {}
    private final Map<String, Run> runs = new HashMap<>();
    private final Map<String, Integer> rewards = new HashMap<>();
    private final Map<String, Integer> daily = new HashMap<>();
    private final List<String> tips = new ArrayList<>();
    private boolean started;

    @Override public synchronized Started start(String runId, long userId, String channelId, Instant at) {
        boolean first = !started;
        started = true;
        runs.put(runId, new Run(userId, 0, 0, false));
        return new Started(first, daily.getOrDefault(userId + JumpmapStore.kstDate(at).toString(), 0), JumpmapStore.kstDate(at));
    }

    @Override public synchronized boolean passGate(String runId, long userId, int gate, int coins, long elapsedMs, Instant at) {
        var run = runs.get(runId);
        if (run == null || run.ended() || run.gates() != gate - 1) return rewards.containsKey(runId + gate);
        runs.put(runId, new Run(userId, gate, run.coins(), false));
        rewards.put(runId + gate, coins);
        return true;
    }

    @Override public synchronized Optional<Settled> settle(String runId, int gate, Instant now) {
        var run = runs.get(runId);
        Integer calculated = rewards.get(runId + gate);
        if (run == null || calculated == null) return Optional.empty();
        String key = run.userId() + JumpmapStore.kstDate(now).toString();
        int granted = Math.min(calculated, com.ssafy.ontop.minigame.service.MinigameRewardBudget.DAILY_CAP - daily.getOrDefault(key, 0));
        daily.merge(key, granted, Integer::sum);
        runs.put(runId, new Run(run.userId(), run.gates(), run.coins() + granted, run.ended()));
        return Optional.of(new Settled(runId, run.userId(), gate, calculated, granted, run.coins() + granted,
                daily.get(key), JumpmapStore.kstDate(now)));
    }

    @Override public synchronized Ended end(String runId, RunEnd end) {
        var run = runs.get(runId);
        runs.put(runId, new Run(run.userId(), run.gates(), run.coins(), true));
        return new Ended(run.coins(), daily.getOrDefault(run.userId() + JumpmapStore.kstDate(end.endedAt()).toString(), 0),
                JumpmapStore.kstDate(end.endedAt()), null, false);
    }

    @Override public synchronized Status status(long userId, Instant now) {
        return new Status(!started, List.copyOf(tips), null, daily.getOrDefault(userId + JumpmapStore.kstDate(now).toString(), 0),
                JumpmapStore.kstDate(now));
    }

    @Override public synchronized void seeTips(long userId, Set<String> keys, Instant now) {
        keys.stream().filter(TIPS::contains).filter(key -> !tips.contains(key)).forEach(tips::add);
    }

    @Override public int abandonOpenRuns(Instant now) { return 0; }

    @Override public List<RewardKey> pendingRewards(Instant before, int limit) { return List.of(); }

    public synchronized boolean ended(String runId) { return runs.containsKey(runId) && runs.get(runId).ended(); }

    public synchronized LocalDate today() { return JumpmapStore.kstDate(Instant.now()); }
}
