package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BalanceItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BungeoppangChampion;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.JumpmapChampion;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkBungeoppangChampionRepository;
import com.ssafy.ontop.ranking.repository.ParkJumpmapChampionRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@Profile("db")
public class ParkRankingSnapshotService {
    private static final Logger LOG = LoggerFactory.getLogger(ParkRankingSnapshotService.class);

    private final ParkBalanceRankingRepository balances;
    private final ParkBungeoppangChampionRepository bungeoppang;
    private final ParkJumpmapChampionRepository jumpmap;
    private final MeterRegistry meters;
    private final Clock clock;
    private final Instant startedAt;
    private final AtomicBoolean refreshing = new AtomicBoolean();
    private final AtomicReference<ParkRankingResponse> snapshot = new AtomicReference<>();

    @Autowired
    public ParkRankingSnapshotService(ParkBalanceRankingRepository balances,
            ParkBungeoppangChampionRepository bungeoppang, ParkJumpmapChampionRepository jumpmap,
            MeterRegistry meters, @Value("${ontop.rankings.park.started-at:}") String startedAt) {
        this(balances, bungeoppang, jumpmap, meters, startedAt, Clock.systemUTC());
    }

    ParkRankingSnapshotService(ParkBalanceRankingRepository balances,
            ParkBungeoppangChampionRepository bungeoppang, ParkJumpmapChampionRepository jumpmap,
            MeterRegistry meters, String startedAt, Clock clock) {
        this.balances = balances;
        this.bungeoppang = bungeoppang;
        this.jumpmap = jumpmap;
        this.meters = meters;
        this.clock = clock;
        // DEV는 최초 배포 시각을 운영자가 고정해 넣는다. 비어 있으면 기존 앱은 계속 기동하되 새 API는 503이다.
        this.startedAt = startedAt.isBlank() ? null : Instant.parse(startedAt);
    }

    public ParkRankingResponse current() {
        ParkRankingResponse current = snapshot.get();
        if (current == null) {
            throw new RankingException(RankingException.Error.STORAGE);
        }
        return current;
    }

    @Scheduled(fixedRate = 60_000, initialDelay = 0)
    public void refresh() {
        if (startedAt == null || !refreshing.compareAndSet(false, true)) {
            return;
        }
        long startedNanos = System.nanoTime();
        try {
            // 세 조회가 모두 성공한 뒤 한 번에 교체한다. 실패한 회차는 직전 정상 응답을 유지한다.
            List<BalanceItem> balanceItems = balances.findTopTen().stream()
                    .map(row -> new BalanceItem(row.rank(), Long.toString(row.userId()),
                            row.nickname(), row.coinBalance())).toList();
            BungeoppangChampion bungeoppangChampion = bungeoppang.findChampion(startedAt)
                    .map(row -> new BungeoppangChampion(Long.toString(row.userId()), row.nickname(),
                            row.score(), row.maxCombo(), row.completedAt()))
                    .orElse(null);
            JumpmapChampion jumpmapChampion = jumpmap.findChampion(startedAt)
                    .map(row -> new JumpmapChampion(Long.toString(row.userId()), row.nickname(),
                            row.finishMs(), row.completedAt()))
                    .orElse(null);
            snapshot.set(new ParkRankingResponse(balanceItems, bungeoppangChampion, jumpmapChampion,
                    clock.instant()));
            meters.counter("ontop.ranking.park.refresh", "result", "success").increment();
        } catch (RuntimeException failure) {
            meters.counter("ontop.ranking.park.refresh", "result", "failure").increment();
            LOG.warn("공원 랭킹 스냅샷 갱신 실패; 이전 정상 결과 유지", failure);
        } finally {
            Timer.builder("ontop.ranking.park.refresh.duration").register(meters)
                    .record(System.nanoTime() - startedNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
            refreshing.set(false);
        }
    }
}
