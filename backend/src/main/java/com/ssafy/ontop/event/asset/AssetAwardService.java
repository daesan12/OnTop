package com.ssafy.ontop.event.asset;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.event.asset.AssetAwardRepository.Counts;
import com.ssafy.ontop.event.asset.AssetAwardRepository.Round;
import com.ssafy.ontop.event.asset.AssetAwardRepository.SnapshotEntry;
import com.ssafy.ontop.event.asset.AssetAwardRepository.Slot;
import com.ssafy.ontop.event.asset.AssetAwardResponse.AssetWinner;
import com.ssafy.ontop.event.asset.AssetAwardPreviewResponse.AssetRank;
import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Snapshot;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** The approved asset award currently values coins only; clothing is deferred. */
final class AssetAwardService {
    private static final Logger log = LoggerFactory.getLogger(AssetAwardService.class);
    private static final LocalDate APPROVED_WEEK = LocalDate.of(2026, 11, 9);
    private static final Duration SETTLEMENT_GRACE = Duration.ofMinutes(5);
    private static final Instant APPROVED_START = Instant.parse("2026-11-09T00:00:00Z");
    private static final Instant APPROVED_END = Instant.parse("2026-11-18T15:00:00Z");
    private static final Instant APPROVED_ANNOUNCEMENT = Instant.parse("2026-11-19T00:00:00Z");
    private static final String[] PRIZES = {
            "황올+크리스피+콜라", "스타벅스 세트", "싸이버거 세트"
    };
    private static final Comparator<Snapshot> RANKING = Comparator
            .comparingLong(Snapshot::coinBalance).reversed()
            .thenComparing(Snapshot::firstReachedAt).thenComparingLong(Snapshot::userId);

    private final AssetAwardRepository repository;
    private final AdminAccessPolicy administrators;
    private final TransactionTemplate writes;
    private final TransactionTemplate decisions;
    private final TransactionTemplate reads;
    private final Clock clock;
    private final LocalDate eventWeek;
    private final Set<Long> reviewedExcludedUserIds;

    AssetAwardService(AssetAwardRepository repository, AdminAccessPolicy administrators,
            PlatformTransactionManager transactions, Clock clock, LocalDate eventWeek) {
        this(repository, administrators, transactions, clock, eventWeek, Set.of());
    }

    AssetAwardService(AssetAwardRepository repository, AdminAccessPolicy administrators,
            PlatformTransactionManager transactions, Clock clock, LocalDate eventWeek,
            Set<Long> reviewedExcludedUserIds) {
        this.repository = repository;
        this.administrators = administrators;
        this.writes = new TransactionTemplate(transactions);
        this.writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.decisions = new TransactionTemplate(transactions);
        this.decisions.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.clock = clock;
        if (!APPROVED_WEEK.equals(eventWeek)) {
            throw new IllegalArgumentException("승인된 엽전 보유량 행사 주차는 2026-11-09입니다.");
        }
        this.eventWeek = eventWeek;
        if (reviewedExcludedUserIds == null
                || reviewedExcludedUserIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("이벤트 제외 회원은 양수 ID여야 합니다.");
        }
        this.reviewedExcludedUserIds = Set.copyOf(reviewedExcludedUserIds);
    }

    void finalizeDueRound() {
        if (clock.instant().isBefore(eligibleAt())) {
            return;
        }
        try {
            boolean finalized = repository.round(eventWeek, false)
                    .map(round -> round.finalizedAt() != null).orElse(false);
            if (!finalized) {
                finalizeRound(eventWeek, null, null);
            }
        } catch (RuntimeException exception) {
            log.error("자산 행사 결과 확정에 실패했습니다. week={}", eventWeek, exception);
        }
    }

    AssetAwardResponse finalizeRound(LocalDate week, Long administratorId,
            AssetAwardFinalizeRequest expected) {
        validate(week);
        if (administratorId != null && !administrators.canOperate(administratorId)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 운영 권한이 없습니다.");
        }
        if (administratorId != null) {
            requireExpected(expected);
        }
        if (clock.instant().isBefore(eligibleAt())) {
            throw error(409, "EVENT_RECORDS_OPEN", "엽전 집계 마감과 정산 대기 후 확정할 수 있습니다.");
        }
        Round prepared = Objects.requireNonNull(writes.execute(status -> prepare(week)));
        try {
            return Objects.requireNonNull(decisions.execute(status -> decide(prepared, administratorId, expected)));
        } catch (RuntimeException exception) {
            try {
                writes.executeWithoutResult(status -> repository.insertAttempt(prepared.id(),
                        administratorId, "FAILED", null, null, null, timestamp()));
            } catch (RuntimeException auditFailure) {
                exception.addSuppressed(auditFailure);
            }
            throw exception;
        }
    }

    AssetAwardResponse adminResult(LocalDate week, long administratorId) {
        validate(week);
        if (!administrators.canRead(administratorId)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> response(existingRound(week), false)));
    }

    AssetAwardPreviewResponse preview(LocalDate week, long administratorId) {
        validate(week);
        if (!administrators.canRead(administratorId)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
        if (clock.instant().isBefore(eligibleAt())) {
            throw error(409, "EVENT_RECORDS_OPEN", "엽전 집계 마감과 정산 대기 후 미리볼 수 있습니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            Round round = repository.round(week, false).orElse(null);
            if (round != null && round.finalizedAt() != null) {
                throw error(409, "EVENT_ALREADY_FINALIZED", "이미 확정된 회차입니다.");
            }
            Ranking ranking = ranking(startsAt(), endsAt());
            return new AssetAwardPreviewResponse("ASSET_VALUE", "COIN_BALANCE", week,
                    startsAt(), endsAt(), announcesAt(), "READY", ranking.candidateCount(),
                    ranking.excludedCount(), ranks(ranking.ranked()));
        }));
    }

    AssetMemberAwardResponse memberResult(LocalDate week, long userId) {
        validate(week);
        if (userId <= 0) {
            throw error(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            if (clock.instant().isBefore(announcesAt())) {
                return new AssetMemberAwardResponse("ASSET_VALUE", "COIN_BALANCE", week,
                        announcesAt(), "NOT_ANNOUNCED", null);
            }
            Round round = repository.round(week, false).orElse(null);
            if (round == null || round.finalizedAt() == null) {
                return new AssetMemberAwardResponse("ASSET_VALUE", "COIN_BALANCE", week,
                        announcesAt(), "PENDING", null);
            }
            AssetWinner winner = repository.winners(round.id()).stream()
                    .filter(value -> value.userId() == userId).findFirst().orElse(null);
            return new AssetMemberAwardResponse("ASSET_VALUE", "COIN_BALANCE", week,
                    announcesAt(), winner == null ? "NOT_SELECTED" : "SELECTED",
                    winner == null ? null : new AssetMemberAwardResponse.AssetPrize(winner.place(),
                            winner.prizeName(), winner.sourceValue(), winner.sourceAchievedAt()));
        }));
    }

    private Round prepare(LocalDate week) {
        repository.ensureRound(week, startsAt(), endsAt(), announcesAt());
        Round round = existingRound(week);
        if (!round.startsAt().equals(startsAt()) || !round.endsAt().equals(endsAt())
                || !round.announcesAt().equals(announcesAt())) {
            throw error(503, "EVENT_ROUND_MISMATCH", "행사 회차의 기간이 설정과 다릅니다.");
        }
        if (round.finalizedAt() == null) {
            for (int place = 1; place <= PRIZES.length; place++) {
                repository.ensureSlot(round.id(), place, PRIZES[place - 1]);
            }
            requireSlots(round.id());
        }
        return round;
    }

    private AssetAwardResponse decide(Round prepared, Long administratorId,
            AssetAwardFinalizeRequest expected) {
        Round round = repository.round(prepared.week(), true)
                .orElseThrow(() -> error(503, "EVENT_ROUND_MISSING", "행사 회차가 없습니다."));
        Instant now = timestamp();
        if (round.finalizedAt() != null) {
            repository.insertAttempt(round.id(), administratorId, "ALREADY_FINALIZED",
                    null, null, null, now);
            return response(round, true);
        }
        List<Slot> slots = requireSlots(round.id());
        Ranking ranking = ranking(round.startsAt(), round.endsAt());
        List<Snapshot> snapshots = ranking.snapshots();
        List<SnapshotEntry> entries = new ArrayList<>(snapshots.size());
        for (Snapshot snapshot : snapshots) {
            entries.add(new SnapshotEntry(snapshot, excluded(snapshot.userId())));
        }
        List<Snapshot> ranked = ranking.ranked();
        if (administratorId != null) {
            List<String> actual = ranked.stream().map(this::sourceRecordId).toList();
            if (ranking.candidateCount() != expected.candidateCount()
                    || ranking.excludedCount() != expected.excludedGmCount()
                    || !actual.equals(expected.expectedSourceRecordIds())) {
                throw error(409, "EVENT_RANKING_CHANGED", "순위가 변경되었습니다. 다시 미리본 뒤 확정해 주세요.");
            }
        }
        repository.insertSnapshots(round.id(), entries, now);
        for (int index = 0; index < ranked.size(); index++) {
            repository.insertWinner(round.id(), slots.get(index), ranked.get(index), now);
        }
        repository.finalizeRound(round.id(), now, administratorId);
        repository.insertAttempt(round.id(), administratorId, "SUCCEEDED",
                ranking.candidateCount(), ranking.excludedCount(), ranked.size(), now);
        return response(round, false);
    }

    private List<Slot> requireSlots(long roundId) {
        List<Slot> slots = repository.slots(roundId);
        if (slots.size() != PRIZES.length) {
            throw error(503, "EVENT_PRIZE_MISMATCH", "자산상 상품 슬롯 구성이 다릅니다.");
        }
        for (int index = 0; index < slots.size(); index++) {
            Slot slot = slots.get(index);
            if (slot.place() != index + 1 || slot.slotNumber() != 1
                    || !slot.prizeName().equals(PRIZES[index])) {
                throw error(503, "EVENT_PRIZE_MISMATCH", "자산상 상품 슬롯 구성이 다릅니다.");
            }
        }
        return slots;
    }

    private AssetAwardResponse response(Round round, boolean alreadyFinalized) {
        Counts counts = repository.successfulCounts(round.id()).orElse(new Counts(0, 0));
        boolean finalized = repository.round(round.week(), false)
                .map(value -> value.finalizedAt() != null).orElse(false);
        return new AssetAwardResponse("ASSET_VALUE", "COIN_BALANCE", round.week(),
                round.startsAt(), round.endsAt(), round.announcesAt(), finalized,
                alreadyFinalized, counts.candidateCount(), counts.excludedGmCount(),
                repository.winners(round.id()));
    }

    private Round existingRound(LocalDate week) {
        return repository.round(week, false)
                .orElseThrow(() -> error(404, "EVENT_ROUND_NOT_FOUND", "해당 주차 자산상 회차가 없습니다."));
    }

    private void validate(LocalDate week) {
        if (week == null || week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw error(400, "EVENT_INVALID_WEEK", "KST 월요일 주차를 확인해 주세요.");
        }
        if (!week.equals(eventWeek)) {
            throw error(404, "EVENT_ROUND_NOT_FOUND", "이번 행사 주차만 조회할 수 있습니다.");
        }
    }

    private Instant startsAt() {
        return APPROVED_START;
    }

    private Instant endsAt() {
        return APPROVED_END;
    }

    private Instant announcesAt() {
        return APPROVED_ANNOUNCEMENT;
    }

    private Instant eligibleAt() {
        return endsAt().plus(SETTLEMENT_GRACE);
    }

    private Instant timestamp() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private Ranking ranking(Instant start, Instant end) {
        List<Snapshot> snapshots = AssetBalanceReconstruction.reconstruct(
                repository.wallets(end), repository.changes(start, end), start, end);
        int excludedCount = Math.toIntExact(snapshots.stream()
                .filter(snapshot -> excluded(snapshot.userId())).count());
        List<Snapshot> ranked = snapshots.stream().filter(snapshot -> !excluded(snapshot.userId()))
                .sorted(RANKING).limit(PRIZES.length).toList();
        return new Ranking(List.copyOf(snapshots), snapshots.size(), excludedCount, ranked);
    }

    private List<AssetRank> ranks(List<Snapshot> snapshots) {
        List<AssetRank> result = new ArrayList<>();
        for (int index = 0; index < snapshots.size(); index++) {
            Snapshot snapshot = snapshots.get(index);
            result.add(new AssetRank(index + 1, snapshot.userId(), repository.nickname(snapshot.userId()),
                    sourceRecordId(snapshot), snapshot.coinBalance(), snapshot.firstReachedAt()));
        }
        return List.copyOf(result);
    }

    private String sourceRecordId(Snapshot snapshot) {
        return snapshot.firstReachedTransactionId() == null
                ? "wallet:" + snapshot.walletId() + ":opening"
                : "wallet_transaction:" + snapshot.firstReachedTransactionId();
    }

    private boolean excluded(long userId) {
        return administrators.canRead(userId) || reviewedExcludedUserIds.contains(userId);
    }

    private void requireExpected(AssetAwardFinalizeRequest expected) {
        if (expected == null || expected.candidateCount() == null || expected.excludedGmCount() == null
                || expected.candidateCount() < 0 || expected.excludedGmCount() < 0
                || expected.excludedGmCount() > expected.candidateCount()
                || expected.expectedSourceRecordIds() == null
                || expected.expectedSourceRecordIds().size() > PRIZES.length
                || expected.expectedSourceRecordIds().stream()
                        .anyMatch(value -> value == null || value.isBlank())) {
            throw error(400, "EVENT_INVALID_PREVIEW", "확정 전 미리보기 결과를 확인해 주세요.");
        }
    }

    private record Ranking(List<Snapshot> snapshots, int candidateCount,
            int excludedCount, List<Snapshot> ranked) {}

    private AssetAwardException error(int status, String code, String message) {
        return new AssetAwardException(status, code, message);
    }
}
