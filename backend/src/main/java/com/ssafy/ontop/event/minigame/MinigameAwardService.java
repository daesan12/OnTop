package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.Candidate;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.OutcomeCounts;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.Round;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.Slot;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** The first week's two game awards. Later weeks require their own approved prize plan. */
public final class MinigameAwardService {
    private static final Logger log = LoggerFactory.getLogger(MinigameAwardService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Duration SETTLEMENT_GRACE = Duration.ofMinutes(5);
    private static final Duration ANNOUNCEMENT_DELAY = Duration.ofHours(9);

    private final MinigameAwardRepository repository;
    private final AdminAccessPolicy administrators;
    private final TransactionTemplate writes;
    private final TransactionTemplate reads;
    private final Clock clock;
    private final LocalDate eventWeek;
    private final Set<Long> globallyExcludedUserIds;
    private final Map<String, Set<Long>> excludedUserIdsByGame;

    public MinigameAwardService(MinigameAwardRepository repository, AdminAccessPolicy administrators,
            PlatformTransactionManager transactions, Clock clock, LocalDate eventWeek) {
        this(repository, administrators, transactions, clock, eventWeek, Set.of(), Map.of());
    }

    public MinigameAwardService(MinigameAwardRepository repository, AdminAccessPolicy administrators,
            PlatformTransactionManager transactions, Clock clock, LocalDate eventWeek,
            Set<Long> globallyExcludedUserIds, Map<String, Set<Long>> excludedUserIdsByGame) {
        this.repository = repository;
        this.administrators = administrators;
        this.writes = new TransactionTemplate(transactions);
        this.writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.clock = clock;
        if (eventWeek == null || eventWeek.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("미니게임 행사 주차는 KST 월요일이어야 합니다.");
        }
        this.eventWeek = eventWeek;
        if (globallyExcludedUserIds == null
                || globallyExcludedUserIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("이벤트 제외 회원은 양수 ID여야 합니다.");
        }
        if (excludedUserIdsByGame == null || excludedUserIdsByGame.entrySet().stream().anyMatch(entry ->
                entry.getKey() == null || entry.getKey().isBlank() || entry.getValue() == null
                        || entry.getValue().stream().anyMatch(id -> id == null || id <= 0))) {
            throw new IllegalArgumentException("게임별 이벤트 제외 회원 설정을 확인하세요.");
        }
        this.globallyExcludedUserIds = Set.copyOf(globallyExcludedUserIds);
        this.excludedUserIdsByGame = excludedUserIdsByGame.entrySet().stream().collect(
                Collectors.toUnmodifiableMap(Map.Entry::getKey, entry -> Set.copyOf(entry.getValue())));
    }

    public void finalizeDueRounds() {
        if (clock.instant().isBefore(eligibleAt())) {
            return;
        }
        for (MinigameAwardType type : MinigameAwardType.values()) {
            try {
                boolean finalized = repository.round(type, eventWeek, false)
                        .map(round -> round.finalizedAt() != null).orElse(false);
                if (!finalized) {
                    finalizeRound(type, eventWeek, null);
                }
            } catch (RuntimeException exception) {
                log.error("미니게임 행사 결과 확정에 실패했습니다. type={} week={}", type, eventWeek, exception);
            }
        }
    }

    public MinigameAwardResponse finalizeRound(MinigameAwardType type, LocalDate week,
            Long administratorUserId) {
        validate(type, week);
        if (administratorUserId != null && !administrators.canOperate(administratorUserId)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 운영 권한이 없습니다.");
        }
        if (clock.instant().isBefore(eligibleAt())) {
            throw error(409, "EVENT_RECORDS_OPEN", "게임 기록 마감과 정산 대기 후 확정할 수 있습니다.");
        }
        Round prepared = Objects.requireNonNull(writes.execute(status -> prepare(type, week)));
        try {
            return Objects.requireNonNull(writes.execute(status -> decide(type, prepared, administratorUserId)));
        } catch (RuntimeException exception) {
            try {
                writes.executeWithoutResult(status -> repository.insertAttempt(prepared.id(),
                        administratorUserId, "FAILED", null, null, null, timestamp()));
            } catch (RuntimeException auditFailure) {
                exception.addSuppressed(auditFailure);
            }
            throw exception;
        }
    }

    public MinigameAwardResponse adminResult(MinigameAwardType type, LocalDate week, long administratorUserId) {
        validate(type, week);
        if (!administrators.canRead(administratorUserId)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> response(type, existingRound(type, week), false)));
    }

    public MinigameMemberAwardResponse memberResult(MinigameAwardType type, LocalDate week, long userId) {
        validate(type, week);
        if (userId <= 0) {
            throw error(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            Instant announcesAt = announcesAt();
            if (clock.instant().isBefore(announcesAt)) {
                return new MinigameMemberAwardResponse(type, week, announcesAt, "NOT_ANNOUNCED", null);
            }
            Round round = repository.round(type, week, false).orElse(null);
            if (round == null || round.finalizedAt() == null) {
                return new MinigameMemberAwardResponse(type, week, announcesAt, "PENDING", null);
            }
            var winner = repository.winner(round.id()).filter(value -> value.userId() == userId);
            return new MinigameMemberAwardResponse(type, week, announcesAt,
                    winner.isPresent() ? "SELECTED" : "NOT_SELECTED",
                    winner.map(value -> new MinigameMemberAwardResponse.Prize(value.prizeName(),
                            value.sourceValue(), value.sourceAchievedAt())).orElse(null));
        }));
    }

    private Round prepare(MinigameAwardType type, LocalDate week) {
        repository.ensureRound(type, week, startsAt(), endsAt(), announcesAt());
        Round round = existingRound(type, week);
        if (!round.startsAt().equals(startsAt()) || !round.endsAt().equals(endsAt())
                || !round.announcesAt().equals(announcesAt())) {
            throw error(503, "EVENT_ROUND_MISMATCH", "행사 회차의 기간이 설정과 다릅니다.");
        }
        if (round.finalizedAt() == null) {
            repository.ensureSlot(round.id(), type.prizeName());
            requireSlot(round.id(), type);
        }
        return round;
    }

    private MinigameAwardResponse decide(MinigameAwardType type, Round prepared, Long administratorUserId) {
        Round round = repository.round(type, prepared.weekStartDate(), true)
                .orElseThrow(() -> error(503, "EVENT_ROUND_MISSING", "행사 회차가 없습니다."));
        Instant now = timestamp();
        if (round.finalizedAt() != null) {
            repository.insertAttempt(round.id(), administratorUserId, "ALREADY_FINALIZED",
                    null, null, null, now);
            return response(type, round, true);
        }
        Slot slot = requireSlot(round.id(), type);
        List<Candidate> candidates = repository.candidates(type, round.startsAt(), round.endsAt());
        int excludedGmCount = 0;
        Candidate selected = null;
        for (Candidate candidate : candidates) {
            if (excluded(type.name(), candidate.userId())) {
                excludedGmCount++;
            } else if (selected == null) {
                selected = candidate;
            }
        }
        if (selected != null) {
            repository.insertWinner(round.id(), slot.id(), selected, now);
        }
        repository.finalizeRound(round.id(), now, administratorUserId);
        repository.insertAttempt(round.id(), administratorUserId, "SUCCEEDED",
                candidates.size(), excludedGmCount, selected == null ? 0 : 1, now);
        return response(type, round, false);
    }

    private boolean excluded(String gameCode, long userId) {
        return administrators.canRead(userId) || globallyExcludedUserIds.contains(userId)
                || excludedUserIdsByGame.getOrDefault(gameCode, Set.of()).contains(userId);
    }

    private Slot requireSlot(long roundId, MinigameAwardType type) {
        List<Slot> slots = repository.slots(roundId);
        if (slots.size() != 1 || slots.getFirst().place() != 1
                || slots.getFirst().slotNumber() != 1
                || !slots.getFirst().prizeName().equals(type.prizeName())) {
            throw error(503, "EVENT_PRIZE_MISMATCH", "게임상 상품 슬롯 구성이 다릅니다.");
        }
        return slots.getFirst();
    }

    private MinigameAwardResponse response(MinigameAwardType type, Round round, boolean alreadyFinalized) {
        OutcomeCounts counts = repository.successfulCounts(round.id()).orElse(new OutcomeCounts(0, 0));
        var winner = repository.winner(round.id()).orElse(null);
        boolean finalized = repository.round(type, round.weekStartDate(), false)
                .map(value -> value.finalizedAt() != null).orElse(false);
        return new MinigameAwardResponse(type, round.weekStartDate(), round.startsAt(),
                round.endsAt(), round.announcesAt(), finalized,
                alreadyFinalized, counts.candidateCount(), counts.excludedGmCount(), winner == null, winner);
    }

    private Round existingRound(MinigameAwardType type, LocalDate week) {
        return repository.round(type, week, false)
                .orElseThrow(() -> error(404, "EVENT_ROUND_NOT_FOUND", "해당 주차 게임상 회차가 없습니다."));
    }

    private void validate(MinigameAwardType type, LocalDate week) {
        if (type == null || week == null || week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw error(400, "EVENT_INVALID_WEEK", "게임상 종류와 KST 월요일 주차를 확인해 주세요.");
        }
        if (!week.equals(eventWeek)) {
            throw error(404, "EVENT_ROUND_NOT_FOUND", "이번 행사 주차만 확정할 수 있습니다.");
        }
    }

    private Instant startsAt() {
        return eventWeek.atTime(9, 0).atZone(KST).toInstant();
    }

    private Instant endsAt() {
        return eventWeek.plusWeeks(1).atStartOfDay(KST).toInstant();
    }

    private Instant announcesAt() {
        return endsAt().plus(ANNOUNCEMENT_DELAY);
    }

    private Instant eligibleAt() {
        return endsAt().plus(SETTLEMENT_GRACE);
    }

    private Instant timestamp() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private MinigameAwardException error(int status, String code, String message) {
        return new MinigameAwardException(status, code, message);
    }
}
