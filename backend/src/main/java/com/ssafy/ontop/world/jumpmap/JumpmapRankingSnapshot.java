package com.ssafy.ontop.world.jumpmap;

import com.ssafy.ontop.world.jumpmap.JumpmapStore.Ranking;
import com.ssafy.ontop.world.jumpmap.JumpmapStore.RankingEntry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/** 현재 규칙·코스의 개인 최고 목록을 공유한다. 새 개인 최고 저장 후 무효화하고, 그 외에는 2분간 유지한다. */
final class JumpmapRankingSnapshot {
    private static final Duration TTL = Duration.ofMinutes(2);
    private final Supplier<List<RankingEntry>> loader;
    private final Clock clock;
    private Snapshot current;

    private record Snapshot(Instant until, List<RankingEntry> top, Map<String, RankingEntry> byUser) {
    }

    JumpmapRankingSnapshot(Supplier<List<RankingEntry>> loader, Clock clock) {
        this.loader = loader;
        this.clock = clock;
    }

    synchronized void invalidate() {
        current = null;
    }

    // 만료 직후 동시 요청도 DB 집계는 한 번만 한다. 정산·게임 진행의 잠금과는 독립적이다.
    synchronized Ranking ranking(long userId) {
        if (current == null || !clock.instant().isBefore(current.until())) {
            List<RankingEntry> entries = List.copyOf(loader.get());
            var byUser = new HashMap<String, RankingEntry>();
            for (RankingEntry entry : entries) {
                byUser.put(entry.userId(), entry);
            }
            current = new Snapshot(clock.instant().plus(TTL),
                    List.copyOf(entries.subList(0, Math.min(50, entries.size()))), Map.copyOf(byUser));
        }
        return new Ranking(current.top(), current.byUser().get(Long.toString(userId)));
    }
}
