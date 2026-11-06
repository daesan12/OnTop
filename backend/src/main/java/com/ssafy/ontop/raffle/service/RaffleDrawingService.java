package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse.Winner;
import com.ssafy.ontop.raffle.dto.RaffleMemberResultResponse;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.EventRound;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.PrizeSlot;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class RaffleDrawingService {
    private static final Logger log = LoggerFactory.getLogger(RaffleDrawingService.class);
    private static final int PRIZE_COUNT = 8;
    private static final Duration ANNOUNCEMENT_DELAY = Duration.ofHours(9);
    private static final List<PrizePlan> PRIZES = List.of(
            new PrizePlan(1, 1, "황올+크리스피+콜라"),
            new PrizePlan(2, 1, "싸이버거 세트"),
            new PrizePlan(2, 2, "싸이버거 세트"),
            new PrizePlan(3, 1, "메가커피 아메리카노"),
            new PrizePlan(3, 2, "메가커피 아메리카노"),
            new PrizePlan(3, 3, "메가커피 아메리카노"),
            new PrizePlan(3, 4, "메가커피 아메리카노"),
            new PrizePlan(3, 5, "메가커피 아메리카노"));

    private final RaffleRepository raffles;
    private final RaffleDrawingRepository drawings;
    private final AdminAccessPolicy administrators;
    private final RaffleDrawSelector selector;
    private final TransactionTemplate writes;
    private final TransactionTemplate reads;
    private final Clock clock;
    private final LocalDate firstWeek;

    public RaffleDrawingService(RaffleRepository raffles, RaffleDrawingRepository drawings,
            AdminAccessPolicy administrators, RaffleDrawSelector selector,
            PlatformTransactionManager manager, Clock clock, LocalDate firstWeek) {
        this.raffles = raffles;
        this.drawings = drawings;
        this.administrators = administrators;
        this.selector = selector;
        this.writes = new TransactionTemplate(manager);
        this.writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.reads = new TransactionTemplate(manager);
        this.reads.setReadOnly(true);
        this.clock = clock;
        if (firstWeek == null || firstWeek.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("첫 추첨 주차는 KST 월요일이어야 합니다.");
        }
        this.firstWeek = firstWeek;
    }

    public void finalizeDueRounds() {
        Instant now = clock.instant();
        for (LocalDate week : drawings.dueWeeks(now, firstWeek)) {
            try {
                finalizeRound(week, null);
            } catch (RuntimeException exception) {
                log.error("응모권 회차 자동 추첨에 실패했습니다. week={}", week, exception);
            }
        }
    }

    public RaffleDrawResponse finalizeRound(LocalDate week, Long administratorUserId) {
        validateWeek(week);
        if (administratorUserId != null && !administrators.canOperate(administratorUserId)) {
            throw error(403, "RAFFLE_ADMIN_FORBIDDEN", "이벤트 운영 권한이 없습니다.");
        }
        EventRound prepared = Objects.requireNonNull(writes.execute(status -> prepare(week)));
        try {
            return Objects.requireNonNull(writes.execute(status -> draw(prepared, administratorUserId)));
        } catch (RuntimeException exception) {
            // The draw transaction rolls back; the failure record uses a separate transaction.
            try {
                writes.executeWithoutResult(status -> drawings.insertFailedAttempt(
                        prepared.id(), administratorUserId, timestamp()));
            } catch (RuntimeException auditFailure) {
                exception.addSuppressed(auditFailure);
            }
            throw exception;
        }
    }

    public RaffleDrawResponse adminResult(LocalDate week, long administratorUserId) {
        validateWeek(week);
        if (!administrators.canRead(administratorUserId)) {
            throw error(403, "RAFFLE_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            EventRound round = eventRound(week);
            return response(round, false);
        }));
    }

    public RaffleMemberResultResponse memberResult(LocalDate week, long userId) {
        validateWeek(week);
        if (userId <= 0) {
            throw error(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            var raffle = raffles.round(week).orElseThrow(() -> missingRound());
            Instant announcesAt = raffle.salesEndsAt().plus(ANNOUNCEMENT_DELAY);
            if (clock.instant().isBefore(announcesAt)) {
                return new RaffleMemberResultResponse(week, announcesAt, "NOT_ANNOUNCED", List.of());
            }
            EventRound round = drawings.round(week, false).orElse(null);
            if (round == null || round.finalizedAt() == null) {
                return new RaffleMemberResultResponse(week, announcesAt, "PENDING", List.of());
            }
            List<RaffleMemberResultResponse.Prize> prizes = drawings.winners(round.id()).stream()
                    .filter(winner -> winner.userId() == userId)
                    .map(winner -> new RaffleMemberResultResponse.Prize(
                            winner.place(), winner.prizeName(), winner.ticketNumber()))
                    .toList();
            return new RaffleMemberResultResponse(week, announcesAt,
                    prizes.isEmpty() ? "NOT_SELECTED" : "SELECTED", prizes);
        }));
    }

    private EventRound prepare(LocalDate week) {
        var raffle = raffles.lockRound(week).orElseThrow(() -> missingRound());
        Instant now = timestamp();
        if (now.isBefore(raffle.salesEndsAt())) {
            throw error(409, "RAFFLE_SALES_OPEN", "응모권 판매가 끝난 뒤 추첨할 수 있습니다.");
        }
        drawings.closeSales(raffle.id(), now);
        Instant announcesAt = raffle.salesEndsAt().plus(ANNOUNCEMENT_DELAY);
        drawings.ensureEventRound(raffle.id(), week, raffle.salesStartsAt(), raffle.salesEndsAt(), announcesAt);
        EventRound round = eventRound(week);
        if (round.raffleRoundId() != raffle.id() || !round.startsAt().equals(raffle.salesStartsAt())
                || !round.endsAt().equals(raffle.salesEndsAt())
                || !round.announcesAt().equals(announcesAt)) {
            throw error(503, "RAFFLE_ROUND_MISMATCH", "이벤트 회차와 응모권 판매 회차가 다릅니다.");
        }
        if (round.finalizedAt() == null) {
            for (PrizePlan prize : PRIZES) {
                drawings.ensurePrizeSlot(round.id(), prize.place(), prize.slotNumber(), prize.name());
            }
            List<PrizeSlot> slots = drawings.prizeSlots(round.id());
            if (slots.size() != PRIZE_COUNT) {
                throw error(503, "RAFFLE_PRIZE_MISMATCH", "상품 구성이 예상과 다릅니다.");
            }
        }
        return round;
    }

    private RaffleDrawResponse draw(EventRound prepared, Long administratorUserId) {
        EventRound round = drawings.round(prepared.weekStartDate(), true).orElseThrow(
                () -> error(503, "RAFFLE_ROUND_MISSING", "이벤트 회차가 없습니다."));
        Instant now = timestamp();
        if (round.finalizedAt() != null) {
            drawings.insertAttempt(round.id(), administratorUserId, now, "ALREADY_FINALIZED", now);
            return response(round, true);
        }
        List<PrizeSlot> slots = drawings.prizeSlots(round.id());
        if (slots.size() != PRIZE_COUNT) {
            throw error(503, "RAFFLE_PRIZE_MISMATCH", "상품 구성이 예상과 다릅니다.");
        }
        long attemptId = drawings.insertAttempt(round.id(), administratorUserId, now, "STARTED", null);
        var selected = selector.select(
                drawings.purchasedTickets(round.raffleRoundId(), round.startsAt(), round.endsAt()),
                slots.size(), administrators::canRead);
        for (int index = 0; index < selected.winners().size(); index++) {
            drawings.insertWinner(round.id(), slots.get(index).id(), selected.winners().get(index), now);
        }
        drawings.finalizeRound(round.id(), now, administratorUserId);
        drawings.completeAttempt(attemptId, selected.candidateCount(),
                selected.excludedTicketCount(), selected.winners().size(), now);
        return response(round, false);
    }

    private RaffleDrawResponse response(EventRound round, boolean alreadyFinalized) {
        List<Winner> winners = drawings.winners(round.id());
        boolean finalized = round.finalizedAt() != null || !winners.isEmpty();
        // A zero-winner draw is also final: re-read the persisted finalization marker.
        if (!finalized) {
            finalized = drawings.round(round.weekStartDate(), false)
                    .map(current -> current.finalizedAt() != null).orElse(false);
        }
        return new RaffleDrawResponse(round.weekStartDate(), round.announcesAt(),
                finalized, alreadyFinalized, PRIZE_COUNT, winners.size(),
                PRIZE_COUNT - winners.size(), winners);
    }

    private EventRound eventRound(LocalDate week) {
        return drawings.round(week, false).orElseThrow(() -> missingRound());
    }

    private RaffleException missingRound() {
        return error(404, "RAFFLE_ROUND_NOT_FOUND", "해당 주차 응모권 회차가 없습니다.");
    }

    private void validateWeek(LocalDate week) {
        if (week == null || week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw error(400, "RAFFLE_INVALID_WEEK", "주차는 KST 월요일 날짜여야 합니다.");
        }
        if (week.isBefore(firstWeek)) {
            throw missingRound();
        }
    }

    private Instant timestamp() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private RaffleException error(int status, String code, String message) {
        return new RaffleException(status, code, message);
    }

    private record PrizePlan(int place, int slotNumber, String name) {}
}
