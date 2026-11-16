package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse.Winner;
import com.ssafy.ontop.raffle.dto.RaffleMemberResultResponse;
import com.ssafy.ontop.raffle.dto.RaffleReviewResponse;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.EventRound;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.PrizeSlot;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.ReviewDraw;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.ReviewPick;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class RaffleDrawingService {
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

    public RaffleReviewResponse createReview(LocalDate week, long administratorUserId) {
        validateWeek(week);
        requireOperator(administratorUserId);
        EventRound prepared = Objects.requireNonNull(writes.execute(status -> prepare(week)));
        try {
            return Objects.requireNonNull(writes.execute(status -> createReview(prepared, administratorUserId)));
        } catch (RuntimeException exception) {
            // Validation conflicts do not constitute a failed random draw.
            if (!(exception instanceof RaffleException)) {
                try {
                    writes.executeWithoutResult(status -> drawings.insertFailedAttempt(
                            prepared.id(), administratorUserId, timestamp()));
                } catch (RuntimeException auditFailure) {
                    exception.addSuppressed(auditFailure);
                }
            }
            throw exception;
        }
    }

    public RaffleReviewResponse currentReview(LocalDate week, long administratorUserId) {
        validateWeek(week);
        requireReader(administratorUserId);
        return Objects.requireNonNull(reads.execute(status -> {
            EventRound round = eventRound(week);
            if (round.finalizedAt() != null) {
                throw error(409, "RAFFLE_ALREADY_FINALIZED", "이미 확정된 회차입니다.");
            }
            ReviewDraw review = drawings.currentReview(round.id())
                    .orElseThrow(() -> error(404, "RAFFLE_REVIEW_NOT_FOUND", "검토 중인 추첨이 없습니다."));
            return reviewResponse(round, review);
        }));
    }

    public RaffleReviewResponse reroll(LocalDate week, long administratorUserId,
            long expectedDrawId, String reason) {
        validateWeek(week);
        requireOperator(administratorUserId);
        if (expectedDrawId <= 0) {
            throw error(400, "RAFFLE_INVALID_DRAW_ID", "검토한 추첨 ID가 필요합니다.");
        }
        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.isEmpty() || trimmedReason.length() > 500) {
            throw error(400, "RAFFLE_REROLL_REASON_REQUIRED", "재추첨 사유를 1~500자로 입력해 주세요.");
        }
        return Objects.requireNonNull(writes.execute(status -> {
            EventRound round = lockedRound(week);
            requireUnfinalized(round);
            ReviewDraw previous = drawings.currentReview(round.id())
                    .orElseThrow(() -> error(404, "RAFFLE_REVIEW_NOT_FOUND", "검토 중인 추첨이 없습니다."));
            if (previous.id() != expectedDrawId) {
                throw staleReview();
            }
            List<PrizeSlot> slots = requiredSlots(round);
            var selected = select(round, slots.size());
            Instant now = timestamp();
            if (drawings.supersedeReview(previous.id(), now) != 1) {
                throw staleReview();
            }
            return saveReview(round, slots, selected, previous.attemptNumber() + 1,
                    administratorUserId, trimmedReason, now);
        }));
    }

    /** 관리자 화면의 직접 확정. 공개 추첨 행사 대상 회차는 Feature Flag와 관계없이 항상 거부한다. */
    public RaffleDrawResponse confirmReview(LocalDate week, long administratorUserId, long drawId) {
        return confirm(week, administratorUserId, drawId, false);
    }

    /**
     * 공개 추첨 행사를 마칠 때 행사 서비스만 호출하는 내부 확정 경로다. HTTP 요청으로 노출하지 않는다.
     * 관리자 운영 권한, 검토 중인 drawId 일치, 후보 변경 검사는 직접 확정과 똑같이 적용한다.
     */
    public RaffleDrawResponse confirmLiveEventReview(LocalDate week, long administratorUserId, long drawId) {
        return confirm(week, administratorUserId, drawId, true);
    }

    private RaffleDrawResponse confirm(LocalDate week, long administratorUserId, long drawId,
            boolean liveEventPath) {
        validateWeek(week);
        requireOperator(administratorUserId);
        if (drawId <= 0) {
            throw error(400, "RAFFLE_INVALID_DRAW_ID", "확정할 추첨 ID가 필요합니다.");
        }
        return Objects.requireNonNull(writes.execute(status -> {
            boolean liveEvent = drawings.liveEventRegistered(week);
            if (liveEvent && !liveEventPath) {
                throw error(409, "RAFFLE_LIVE_EVENT_LOCKED",
                        "공개 추첨 행사 대상 회차는 행사를 마칠 때만 확정할 수 있습니다.");
            }
            if (!liveEvent && liveEventPath) {
                throw error(409, "RAFFLE_LIVE_EVENT_NOT_REGISTERED", "공개 추첨 행사 대상 회차가 아닙니다.");
            }
            EventRound round = lockedRound(week);
            if (round.finalizedAt() != null) {
                if (drawings.confirmedReview(round.id()).map(review -> review.id() == drawId).orElse(false)) {
                    return response(round, true);
                }
                throw error(409, "RAFFLE_ALREADY_FINALIZED", "이미 확정된 회차입니다.");
            }
            ReviewDraw review = drawings.currentReview(round.id())
                    .orElseThrow(() -> error(409, "RAFFLE_REVIEW_REQUIRED", "먼저 추첨 결과를 검토해 주세요."));
            if (review.id() != drawId) {
                throw staleReview();
            }
            List<ReviewPick> picks = drawings.reviewPicks(review.id());
            if (picks.size() != review.pickedCount()) {
                throw error(503, "RAFFLE_REVIEW_MISMATCH", "저장된 추첨 후보가 일치하지 않습니다.");
            }
            requireCandidatesUnchanged(round, review, picks);
            Instant now = timestamp();
            long attemptId = drawings.insertAttempt(round.id(), administratorUserId, now,
                    "STARTED", null);
            for (ReviewPick pick : picks) {
                drawings.insertWinner(round.id(), pick.slotId(), pick.ticket(), now);
            }
            drawings.finalizeRound(round.id(), now, administratorUserId);
            if (drawings.confirmReview(drawId, now) != 1) {
                throw staleReview();
            }
            drawings.completeAttempt(attemptId, review.candidateCount(),
                    review.excludedGmCount(), picks.size(), now);
            return response(round, false);
        }));
    }

    public RaffleDrawResponse adminResult(LocalDate week, long administratorUserId) {
        validateWeek(week);
        requireReader(administratorUserId);
        return Objects.requireNonNull(reads.execute(status -> {
            EventRound round = drawings.round(week, false).orElse(null);
            if (round != null) {
                return response(round, false);
            }
            var raffle = raffles.round(week).orElseThrow(() -> missingRound());
            return new RaffleDrawResponse(week,
                    raffle.salesEndsAt().plus(ANNOUNCEMENT_DELAY), false, false,
                    null, null, PRIZE_COUNT, 0, PRIZE_COUNT, List.of());
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
        EventRound existing = drawings.round(week, false).orElse(null);
        if (existing != null && existing.finalizedAt() != null) {
            throw error(409, "RAFFLE_ALREADY_FINALIZED", "이미 확정된 회차입니다.");
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

    private RaffleReviewResponse createReview(EventRound prepared, long administratorUserId) {
        EventRound round = lockedRound(prepared.weekStartDate());
        requireUnfinalized(round);
        ReviewDraw current = drawings.currentReview(round.id()).orElse(null);
        if (current != null) {
            return reviewResponse(round, current);
        }
        if (drawings.lastReviewNumber(round.id()) != 0) {
            throw error(503, "RAFFLE_REVIEW_MISMATCH", "현재 유효한 추첨 시도를 찾을 수 없습니다.");
        }
        List<PrizeSlot> slots = requiredSlots(round);
        var selected = select(round, slots.size());
        return saveReview(round, slots, selected, 1, administratorUserId, null, timestamp());
    }

    private RaffleReviewResponse saveReview(EventRound round, List<PrizeSlot> slots,
            RaffleDrawSelector.Selection selected, int attemptNumber, long administratorUserId,
            String reason, Instant now) {
        long drawId = drawings.insertReview(round.id(), round.raffleRoundId(), attemptNumber,
                administratorUserId, reason, selected.candidateCount(),
                selected.excludedTicketCount(), selected.winners().size(), now);
        for (int index = 0; index < selected.winners().size(); index++) {
            drawings.insertReviewPick(drawId, round.id(), round.raffleRoundId(),
                    slots.get(index).id(), selected.winners().get(index));
        }
        return reviewResponse(round, drawings.currentReview(round.id()).orElseThrow());
    }

    private RaffleDrawSelector.Selection select(EventRound round, int slotCount) {
        return selector.select(
                drawings.purchasedTickets(round.raffleRoundId(), round.startsAt(), round.endsAt()),
                slotCount, administrators::canRead);
    }

    private RaffleReviewResponse reviewResponse(EventRound round, ReviewDraw review) {
        List<Winner> picks = drawings.reviewPicks(review.id()).stream()
                .map(ReviewPick::winner).toList();
        if (picks.size() != review.pickedCount()) {
            throw error(503, "RAFFLE_REVIEW_MISMATCH", "저장된 추첨 후보가 일치하지 않습니다.");
        }
        return new RaffleReviewResponse(review.id(), round.weekStartDate(), round.announcesAt(),
                review.attemptNumber(), review.status(), review.requestedByUserId(),
                review.rerollReason(), review.createdAt(), review.candidateCount(),
                review.excludedGmCount(), PRIZE_COUNT, picks.size(), PRIZE_COUNT - picks.size(), picks);
    }

    private void requireCandidatesUnchanged(EventRound round, ReviewDraw review,
            List<ReviewPick> picks) {
        var candidates = drawings.purchasedTickets(round.raffleRoundId(),
                round.startsAt(), round.endsAt());
        int excluded = (int) candidates.stream().filter(ticket -> administrators.canRead(ticket.userId())).count();
        if (candidates.size() != review.candidateCount() || excluded != review.excludedGmCount()) {
            throw error(409, "RAFFLE_CANDIDATES_CHANGED", "추첨 후보가 변경됐습니다. 결과를 다시 확인해 주세요.");
        }
        Set<Long> eligibleTicketIds = candidates.stream()
                .filter(ticket -> !administrators.canRead(ticket.userId()))
                .map(RaffleDrawSelector.Ticket::id).collect(Collectors.toSet());
        if (picks.stream().anyMatch(pick -> !eligibleTicketIds.contains(pick.ticket().id()))) {
            throw error(409, "RAFFLE_CANDIDATES_CHANGED", "추첨 후보가 변경됐습니다. 결과를 다시 확인해 주세요.");
        }
    }

    private List<PrizeSlot> requiredSlots(EventRound round) {
        List<PrizeSlot> slots = drawings.prizeSlots(round.id());
        if (slots.size() != PRIZE_COUNT) {
            throw error(503, "RAFFLE_PRIZE_MISMATCH", "상품 구성이 예상과 다릅니다.");
        }
        return slots;
    }

    private EventRound lockedRound(LocalDate week) {
        return drawings.round(week, true).orElseThrow(() -> missingRound());
    }

    private void requireUnfinalized(EventRound round) {
        if (round.finalizedAt() != null) {
            throw error(409, "RAFFLE_ALREADY_FINALIZED", "이미 확정된 회차입니다.");
        }
    }

    private void requireReader(long administratorUserId) {
        if (!administrators.canRead(administratorUserId)) {
            throw error(403, "RAFFLE_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
    }

    private void requireOperator(long administratorUserId) {
        if (!administrators.canOperate(administratorUserId)) {
            throw error(403, "RAFFLE_ADMIN_FORBIDDEN", "이벤트 운영 권한이 없습니다.");
        }
    }

    private RaffleException staleReview() {
        return error(409, "RAFFLE_REVIEW_STALE", "다른 추첨 시도가 진행됐습니다. 최신 결과를 다시 확인해 주세요.");
    }

    private RaffleDrawResponse response(EventRound round, boolean alreadyFinalized) {
        List<Winner> winners = drawings.winners(round.id());
        var counts = drawings.successfulCounts(round.id()).orElse(null);
        boolean finalized = round.finalizedAt() != null || !winners.isEmpty();
        // A zero-winner draw is also final: re-read the persisted finalization marker.
        if (!finalized) {
            finalized = drawings.round(round.weekStartDate(), false)
                    .map(current -> current.finalizedAt() != null).orElse(false);
        }
        return new RaffleDrawResponse(round.weekStartDate(), round.announcesAt(),
                finalized, alreadyFinalized,
                counts == null ? null : counts.candidateCount(),
                counts == null ? null : counts.excludedGmCount(),
                PRIZE_COUNT, winners.size(),
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
