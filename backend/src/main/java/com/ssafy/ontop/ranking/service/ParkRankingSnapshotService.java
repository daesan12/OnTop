package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.repository.ParkJumpmapRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkBungeoppangRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkSkewerRankingRepository;
import com.ssafy.ontop.game.jumprope.JumpRopeRankingWindow;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BalanceItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.JumpRopeItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.MoleItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.SpeedMoleItem;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkJumpRopeRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkMoleRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkSpeedMoleRankingRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongPredicate;
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
    private final ParkMoleRankingRepository mole;
    private final ParkSpeedMoleRankingRepository speedMole;
    private final ParkJumpRopeRankingRepository jumpRope;
    private final MeterRegistry meters;
    private final Clock clock;
    private final LongPredicate gameMasters;
    private final Instant startedAt;
    private final AtomicBoolean refreshing = new AtomicBoolean();
    private final AtomicReference<ParkRankingResponse> snapshot = new AtomicReference<>();

    private ParkJumpmapRankingRepository jumpmap;
    private ParkBungeoppangRankingRepository bungeoppang;
    private ParkSkewerRankingRepository skewer;

    @Autowired
    public ParkRankingSnapshotService(ParkBalanceRankingRepository balances,
            ParkMoleRankingRepository mole, ParkSpeedMoleRankingRepository speedMole,
            ParkJumpRopeRankingRepository jumpRope,
            ParkJumpmapRankingRepository jumpmap, ParkBungeoppangRankingRepository bungeoppang,
            ParkSkewerRankingRepository skewer, MeterRegistry meters, AdminAccessPolicy administrators,
            @Value("${ontop.rankings.park.started-at:}") String startedAt) {
        this(balances, mole, speedMole, jumpRope, meters, startedAt, Clock.systemUTC(), administrators::canRead);
        this.jumpmap = jumpmap; this.bungeoppang = bungeoppang; this.skewer = skewer;
    }

    ParkRankingSnapshotService(ParkBalanceRankingRepository balances,
            ParkMoleRankingRepository mole, ParkSpeedMoleRankingRepository speedMole,
            ParkJumpRopeRankingRepository jumpRope,
            MeterRegistry meters, String startedAt, Clock clock) {
        this(balances, mole, speedMole, jumpRope, meters, startedAt, clock, ignored -> false);
    }

    ParkRankingSnapshotService(ParkBalanceRankingRepository balances,
            ParkMoleRankingRepository mole, ParkSpeedMoleRankingRepository speedMole,
            ParkJumpRopeRankingRepository jumpRope,
            MeterRegistry meters, String startedAt, Clock clock, LongPredicate gameMasters) {
        this.balances = balances;
        this.mole = mole;
        this.speedMole = speedMole;
        this.jumpRope = jumpRope;
        this.meters = meters;
        this.clock = clock;
        this.gameMasters = gameMasters;
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
            // 모든 조회가 성공한 뒤 한 번에 교체한다. 실패한 회차는 직전 정상 응답을 유지한다.
            List<BalanceItem> balanceItems = balances.findTopTen().stream()
                    .map(row -> new BalanceItem(row.rank(), Long.toString(row.userId()),
                            row.nickname(), row.coinBalance(), gameMasters.test(row.userId()), row.equipmentValue(), row.totalAssets())).toList();
            List<MoleItem> moleItems = mole.findTopTen(startedAt).stream()
                    .map(row -> new MoleItem(row.rank(), Long.toString(row.userId()), row.nickname(),
                            row.score(), row.maxCombo(), row.completedAt(), gameMasters.test(row.userId()))).toList();
            List<SpeedMoleItem> speedMoleItems = speedMole.findTopTen(startedAt).stream()
                    .map(row -> new SpeedMoleItem(row.rank(), Long.toString(row.userId()), row.nickname(),
                            row.score(), row.misses(), row.completedAt(), gameMasters.test(row.userId()))).toList();
            List<JumpRopeItem> jumpRopeItems = jumpRope.findTopTen(startedAt).stream()
                    .map(row -> new JumpRopeItem(row.rank(), Long.toString(row.userId()), row.nickname(),
                            row.score(), row.misses(), row.completedAt(), gameMasters.test(row.userId()))).toList();
            List<ParkRankingResponse.JumpmapItem> jumpmapItems = jumpmap == null ? List.of() : jumpmap.findTopTen(startedAt).stream().map(r ->
                        new ParkRankingResponse.JumpmapItem(r.rank(), Long.toString(r.userId()), r.nickname(),
                            r.finishMs(), r.completedAt(), gameMasters.test(r.userId()))).toList();
            List<MoleItem> bungeoppangItems = bungeoppang == null ? List.of() : bungeoppang.findTopTen(startedAt).stream().map(r ->
                        new MoleItem(r.rank(), Long.toString(r.userId()), r.nickname(), r.score(), r.maxCombo(),
                            r.completedAt(), gameMasters.test(r.userId()))).toList();
            List<ParkRankingResponse.SkewerItem> skewerItems = skewer == null ? List.of() : skewer.findTopTen(startedAt).stream().map(r ->
                        new ParkRankingResponse.SkewerItem(r.rank(), r.gameId(), Long.toString(r.chefUserId()),
                            r.chefNickname(), Long.toString(r.serverUserId()), r.serverNickname(), r.score(),
                            r.playMode(), r.completedAt(), gameMasters.test(r.chefUserId()), gameMasters.test(r.serverUserId()))).toList();
            snapshot.set(new ParkRankingResponse(balanceItems, moleItems, speedMoleItems, jumpRopeItems,
                    clock.instant(), jumpmapItems, bungeoppangItems, skewerItems,
                    JumpRopeRankingWindow.START, JumpRopeRankingWindow.END_EXCLUSIVE));
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
