package com.ssafy.ontop.game.skewer.coop.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopRankingResponse;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import com.ssafy.ontop.game.skewer.coop.repository.SkewerCoopResultJournal;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

/** 종료 결과를 영속 저널에 인계한 뒤 정산하며, 완료 응답은 반드시 DB 영수증에서 읽는다. */
@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.skewer-coop.enabled", havingValue = "true")
public class SkewerCoopSettlementService {
    private static final Logger log = LoggerFactory.getLogger(SkewerCoopSettlementService.class);
    private final SkewerCoopResultStore store;
    private final Clock clock;
    private final SkewerCoopResultJournal journal;
    private final Map<String, SkewerCoopFinished> pending = new ConcurrentHashMap<>();
    private final Map<String, Long> retryAt = new ConcurrentHashMap<>();

    @Autowired
    public SkewerCoopSettlementService(ObjectProvider<SkewerCoopResultStore> stores, ObjectMapper mapper,
            Environment environment) throws IOException {
        this(stores.getIfAvailable(), Clock.systemUTC(), stores.getIfAvailable() == null ? null
                : new SkewerCoopResultJournal(Path.of(environment.getRequiredProperty(
                        "ontop.games.skewer-coop.journal-path")), mapper));
    }

    public SkewerCoopSettlementService(SkewerCoopResultStore store, Clock clock) {
        this(store, clock, null);
    }

    public SkewerCoopSettlementService(SkewerCoopResultStore store, Clock clock, SkewerCoopResultJournal journal) {
        this.store = store;
        this.clock = clock;
        this.journal = journal;
        if (journal != null) {
            try {
                journal.load().forEach(result -> pending.put(result.result().gameId(), result));
            } catch (RuntimeException exception) {
                try {
                    journal.close();
                } catch (IOException closeFailure) {
                    exception.addSuppressed(closeFailure);
                }
                throw exception;
            }
        }
    }

    // 전용 저널 작업자가 종료 알림/점유 해제 전에 호출한다. 실패하면 같은 불변 결과로 재시도한다.
    public synchronized void finished(SkewerCoopFinished result) {
        if (journal != null) {
            journal.append(result);
        }
        SkewerCoopFinished previous = pending.putIfAbsent(result.result().gameId(), result);
        if (previous != null && !previous.equals(result)) {
            throw new IllegalStateException("같은 경기의 정산 결과가 다릅니다.");
        }
    }

    @PreDestroy
    public void close() throws IOException {
        if (journal != null) {
            journal.close();
        }
    }

    public void retry() {
        if (store == null) {
            return;
        }
        pending.forEach((id, result) -> {
            if (clock.millis() < retryAt.getOrDefault(id, 0L)) {
                return;
            }
            try {
                store.settle(result, clock.instant());
                if (journal != null) {
                    journal.acknowledged(id);
                }
                pending.remove(id, result);
                retryAt.remove(id);
            } catch (RuntimeException exception) {
                // 한 건의 디스크/DB/결과 충돌이 정산 타이머와 다른 경기의 재시도를 멈추면 안 된다.
                retryAt.put(id, clock.millis() + 5000);
                log.warn("꼬치왕 정산을 재시도합니다: gameId={}", id, exception);
            }
        });
    }

    public SkewerCoopResultResponse result(long user, String id) {
        requireId(id);
        if (store != null) {
            try {
                var saved = store.find(user, id, clock.instant());
                if (saved.isPresent()) {
                    return saved.get();
                }
            } catch (DataAccessException | TransactionException exception) {
                if (!pending.containsKey(id)) {
                    throw exception;
                }
            }
        }
        SkewerCoopFinished result = pending.get(id);
        if (result == null || !result.users().contains(user)) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        return new SkewerCoopResultResponse(id, store == null ? "UNAVAILABLE" : "PENDING", result.teamScore(),
                result.served(), result.result().endReason(), "ELIGIBLE".equals(result.rankingReason())
                        ? "PENDING" : "EXCLUDED", result.rankingReason(), result.teamScore() / 20, null, null,
                MinigameRewardBudget.DAILY_CAP, null, null, null, null);
    }

    public SkewerCoopRankingResponse ranking(long user) {
        return ranking(user, "VR");
    }

    public SkewerCoopRankingResponse ranking(long user, String mode) {
        if (!java.util.Set.of("PC", "VR", "ALL").contains(mode)) {
            throw new IllegalArgumentException("랭킹 플레이 방식을 확인해주세요.");
        }
        if (store == null) {
            throw new IllegalStateException("랭킹 저장소가 연결되지 않았습니다.");
        }
        return store.ranking(user, clock.instant(), mode);
    }

    private static void requireId(String id) {
        if (id == null || !id.matches("skewer-coop-[a-f0-9-]{36}")) {
            throw new IllegalArgumentException("경기 번호를 확인해주세요.");
        }
    }
}
