package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.Candidate;
import com.ssafy.ontop.event.minigame.MinigameAwardResponse.Winner;
import com.ssafy.ontop.event.minigame.WeeklyMinigameRepository.ConfiguredGame;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit weekly configuration and manual finalization. The original week remains on its legacy API. */
public final class WeeklyMinigameAwardService {
    private static final LocalDate LEGACY_WEEK = LocalDate.of(2026, 11, 2);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Duration SETTLEMENT_GRACE = Duration.ofMinutes(5);
    private static final int PREVIEW_LIMIT = 100;
    private static final LocalDate BACKFILL_WEEK = LocalDate.of(2026, 11, 9);
    private static final Instant BACKFILL_END = Instant.parse("2026-11-18T15:00:00Z");
    private static final Instant BACKFILL_ANNOUNCEMENT = Instant.parse("2026-11-19T00:00:00Z");
    private static final List<AwardSpec> SUPPORTED = List.of(
            new AwardSpec("BUNGEOPPANG", "붕어빵", bungeoRule(), null, null, null, null),
            new AwardSpec("JUMPMAP", "점프맵", jumpRule(), null, null, null, null),
            new AwardSpec("MG_MOLE", "두더지 잡기", "mole-v3", BACKFILL_WEEK,
                    Instant.parse("2026-11-09T00:00:00Z"), BACKFILL_END, BACKFILL_ANNOUNCEMENT),
            new AwardSpec("MG_SPEED_MOLE", "스피드 두더지 잡기", "speed-mole-v1", BACKFILL_WEEK,
                    Instant.parse("2026-11-09T00:00:00Z"), BACKFILL_END, BACKFILL_ANNOUNCEMENT),
            new AwardSpec("MG_JUMP_ROPE", "구구구 줄넘기", "jump-rope-v2", LocalDate.of(2026, 11, 16),
                    Instant.parse("2026-11-16T05:00:00Z"), BACKFILL_END, BACKFILL_ANNOUNCEMENT),
            new AwardSpec("MG_JUMPMAP_220", "점프맵", "v4-park220-jump10-v1", LocalDate.of(2026, 11, 16),
                    Instant.parse("2026-11-16T07:00:00Z"), BACKFILL_END, BACKFILL_ANNOUNCEMENT));
    private static final String BACKFILL_PRIZE = "미니게임 1등상";

    private final WeeklyMinigameRepository configurations;
    private final MinigameAwardRepository records;
    private final AdminAccessPolicy admins;
    private final TransactionTemplate writes;
    private final TransactionTemplate reads;
    private final Clock clock;
    private final Set<Long> reviewedExcludedUserIds;

    public WeeklyMinigameAwardService(WeeklyMinigameRepository configurations,
            MinigameAwardRepository records, AdminAccessPolicy admins,
            PlatformTransactionManager transactions, Clock clock) {
        this(configurations, records, admins, transactions, clock, Set.of());
    }

    public WeeklyMinigameAwardService(WeeklyMinigameRepository configurations,
            MinigameAwardRepository records, AdminAccessPolicy admins,
            PlatformTransactionManager transactions, Clock clock, Set<Long> reviewedExcludedUserIds) {
        this.configurations = configurations;
        this.records = records;
        this.admins = admins;
        this.writes = new TransactionTemplate(transactions);
        this.writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.clock = clock;
        if (reviewedExcludedUserIds == null
                || reviewedExcludedUserIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("이벤트 제외 회원은 양수 ID여야 합니다.");
        }
        this.reviewedExcludedUserIds = Set.copyOf(reviewedExcludedUserIds);
    }

    public List<Game> games(LocalDate week, long adminId) {
        requireWeek(week);
        requireRead(adminId);
        return Objects.requireNonNull(reads.execute(status -> configurations.games(week).stream()
                .filter(game -> supported(game.gameCode(), game.rankingRuleVersion()))
                .map(this::game).toList()));
    }

    public List<SupportedGame> supportedGames(long adminId) {
        requireRead(adminId);
        return SUPPORTED.stream().map(spec -> new SupportedGame(
                spec.code(), spec.displayName(), spec.rule())).toList();
    }

    /** Creates only the four approved, already-closed November event rounds. */
    public List<Game> prepareBackfill(LocalDate eventWeek, long adminId) {
        if (!BACKFILL_WEEK.equals(eventWeek)) {
            throw error(404, "EVENT_BACKFILL_NOT_FOUND", "지원하는 소급 정산 회차가 아닙니다.");
        }
        requireOperate(adminId);
        return Objects.requireNonNull(writes.execute(status -> {
            List<Game> result = new ArrayList<>();
            for (AwardSpec spec : SUPPORTED.stream().filter(AwardSpec::backfill).toList()) {
                ConfiguredGame current = configurations.game(spec.code(), spec.week(), true).orElse(null);
                if (current == null) {
                    if (configurations.roundExists(spec.code(), spec.week())) {
                        throw error(409, "EVENT_ROUND_CONFLICT", "기존 회차 데이터와 소급 정산 설정이 충돌합니다.");
                    }
                    configurations.create(spec.code(), spec.week(), spec.startsAt(), spec.endsAt(),
                            spec.announcesAt(), spec.displayName(), spec.rule(), true,
                            BACKFILL_PRIZE, adminId, now());
                    current = configurations.game(spec.code(), spec.week(), true)
                            .orElseThrow(() -> error(503, "EVENT_ROUND_MISSING", "소급 정산 회차를 생성하지 못했습니다."));
                }
                requireBackfillMatch(spec, current);
                result.add(game(current));
            }
            return List.copyOf(result);
        }));
    }

    public Game configure(LocalDate week, String code, Configuration input, long adminId) {
        requireWeek(week);
        requireOperate(adminId);
        AwardSpec spec = requireSupported(code, input == null ? null : input.rankingRuleVersion());
        validateConfiguration(week, input);
        return Objects.requireNonNull(writes.execute(status -> {
            // A preexisting round without a configuration belongs to the legacy flow.
            ConfiguredGame current = configurations.game(spec.code(), week, true).orElse(null);
            if (current == null) {
                if (!clock.instant().isBefore(input.endsAt())) {
                    throw error(409, "EVENT_CONFIG_CLOSED", "기록 마감 이후에는 회차를 새로 등록할 수 없습니다.");
                }
                if (configurations.roundExists(spec.code(), week)) {
                    throw error(409, "EVENT_LEGACY_ROUND", "기존 회차는 주차별 설정으로 변경할 수 없습니다.");
                }
                configurations.create(spec.code(), week, input.startsAt(), input.endsAt(),
                        input.announcesAt(), input.displayName().trim(), input.rankingRuleVersion(),
                        input.enabled(), input.prizeName().trim(), adminId, now());
            } else {
                if (current.finalizedAt() != null) {
                    throw error(409, "EVENT_ALREADY_FINALIZED", "확정된 게임상 설정은 변경할 수 없습니다.");
                }
                if (configurations.slotCount(current.id()) != 1) {
                    throw error(409, "EVENT_PRIZE_MISMATCH", "상품 슬롯 구성을 확인해 주세요.");
                }
                boolean same = current.startsAt().equals(input.startsAt())
                        && current.endsAt().equals(input.endsAt())
                        && current.announcesAt().equals(input.announcesAt())
                        && current.displayName().equals(input.displayName().trim())
                        && current.rankingRuleVersion().equals(input.rankingRuleVersion())
                        && current.enabled() == input.enabled()
                        && current.prizeName().equals(input.prizeName().trim());
                if (!same && !clock.instant().isBefore(current.startsAt())) {
                    throw error(409, "EVENT_CONFIG_LOCKED", "행사 시작 후 기존 게임 설정은 변경할 수 없습니다.");
                }
                if (!same) {
                    configurations.update(current, input.startsAt(), input.endsAt(), input.announcesAt(),
                            input.displayName().trim(), input.rankingRuleVersion(), input.enabled(),
                            input.prizeName().trim(), adminId, now());
                }
            }
            return game(requireGame(spec.code(), week, false));
        }));
    }

    public Ranking ranking(LocalDate week, String code, long adminId) {
        requireWeek(week);
        requireRead(adminId);
        return Objects.requireNonNull(reads.execute(status -> {
            ConfiguredGame game = requireGame(code, week, false);
            requireEnabledSupported(game);
            if (game.finalizedAt() != null) {
                var counts = records.successfulCounts(game.id())
                        .orElse(new MinigameAwardRepository.OutcomeCounts(0, 0));
                return new Ranking(game(game), "FINALIZED", counts.candidateCount(),
                        counts.excludedGmCount(), List.of(), records.winner(game.id()).orElse(null));
            }
            List<Candidate> candidates = candidates(game);
            int excluded = 0;
            List<Rank> ranks = new ArrayList<>();
            for (Candidate candidate : candidates) {
                if (excluded(candidate.userId())) {
                    excluded++;
                } else if (ranks.size() < PREVIEW_LIMIT) {
                    ranks.add(new Rank(ranks.size() + 1, candidate.userId(), candidate.nickname(), candidate.recordId(),
                            candidate.sourceValue(), candidate.secondaryValue(), candidate.achievedAt()));
                }
            }
            return new Ranking(game(game), clock.instant().isBefore(game.endsAt().plus(SETTLEMENT_GRACE))
                    ? "PROVISIONAL" : "READY", candidates.size(), excluded, ranks, null);
        }));
    }

    public Ranking finalizeRound(LocalDate week, String code, FinalizeRequest expected, long adminId) {
        requireWeek(week);
        requireOperate(adminId);
        if (expected == null || expected.candidateCount() == null || expected.excludedGmCount() == null
                || expected.candidateCount() < 0 || expected.excludedGmCount() < 0
                || expected.excludedGmCount() > expected.candidateCount()) {
            throw error(400, "EVENT_INVALID_PREVIEW", "확정 전 순위 조회 결과를 확인해 주세요.");
        }
        return Objects.requireNonNull(writes.execute(status -> {
            ConfiguredGame game = requireGame(code, week, true);
            requireEnabledSupported(game);
            if (game.finalizedAt() != null) {
                records.insertAttempt(game.id(), adminId, "ALREADY_FINALIZED", null, null, null, now());
                var counts = records.successfulCounts(game.id())
                        .orElse(new MinigameAwardRepository.OutcomeCounts(0, 0));
                return new Ranking(game(game), "FINALIZED", counts.candidateCount(),
                        counts.excludedGmCount(), List.of(), records.winner(game.id()).orElse(null));
            }
            if (clock.instant().isBefore(game.endsAt().plus(SETTLEMENT_GRACE))) {
                throw error(409, "EVENT_RECORDS_OPEN", "기록 마감과 정산 대기 후 확정할 수 있습니다.");
            }
            if (configurations.slotCount(game.id()) != 1) {
                throw error(409, "EVENT_PRIZE_MISMATCH", "상품 슬롯 구성을 확인해 주세요.");
            }
            List<Candidate> candidates = candidates(game);
            int excluded = 0;
            Candidate winner = null;
            for (Candidate candidate : candidates) {
                if (excluded(candidate.userId())) {
                    excluded++;
                } else if (winner == null) {
                    winner = candidate;
                }
            }
            String recordId = winner == null ? null : winner.recordId();
            if (candidates.size() != expected.candidateCount() || excluded != expected.excludedGmCount()
                    || !Objects.equals(recordId, expected.expectedSourceRecordId())) {
                throw error(409, "EVENT_RANKING_CHANGED", "순위가 변경되었습니다. 다시 조회한 뒤 확정해 주세요.");
            }
            Instant finalizedAt = now();
            if (winner != null) {
                records.insertWinner(game.id(), game.slotId(), winner, finalizedAt);
            }
            records.finalizeRound(game.id(), finalizedAt, adminId);
            records.insertAttempt(game.id(), adminId, "SUCCEEDED", candidates.size(), excluded,
                    winner == null ? 0 : 1, finalizedAt);
            ConfiguredGame saved = requireGame(code, week, false);
            return new Ranking(game(saved), "FINALIZED", candidates.size(), excluded,
                    List.of(), records.winner(game.id()).orElse(null));
        }));
    }

    public MemberResult memberResult(LocalDate week, String code, long userId) {
        requireWeek(week);
        if (userId <= 0) {
            throw error(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            ConfiguredGame game = requireGame(code, week, false);
            requireEnabledSupported(game);
            if (clock.instant().isBefore(game.announcesAt())) {
                return new MemberResult(code, week, game.announcesAt(), "NOT_ANNOUNCED", null);
            }
            if (game.finalizedAt() == null) {
                return new MemberResult(code, week, game.announcesAt(), "PENDING", null);
            }
            Winner winner = records.winner(game.id()).filter(value -> value.userId() == userId).orElse(null);
            return new MemberResult(code, week, game.announcesAt(),
                    winner == null ? "NOT_SELECTED" : "SELECTED", winner == null ? null
                            : new Prize(winner.prizeName(), winner.sourceValue(), winner.sourceAchievedAt()));
        }));
    }

    private List<Candidate> candidates(ConfiguredGame game) {
        requireSupported(game.gameCode(), game.rankingRuleVersion());
        return records.weeklyCandidates(game.gameCode(),
                game.startsAt(), game.endsAt());
    }

    private ConfiguredGame requireGame(String code, LocalDate week, boolean locked) {
        requireCode(code);
        return configurations.game(code, week, locked)
                .orElseThrow(() -> error(404, "EVENT_ROUND_NOT_FOUND", "설정된 게임상 회차가 없습니다."));
    }

    private void requireEnabledSupported(ConfiguredGame game) {
        if (!game.enabled() || !supported(game.gameCode(), game.rankingRuleVersion())) {
            throw error(409, "EVENT_GAME_NOT_READY", "검증된 랭킹 규칙이 활성화된 게임만 조회·확정할 수 있습니다.");
        }
    }

    private static boolean supported(String code, String rule) {
        return SUPPORTED.stream().anyMatch(spec -> spec.code().equals(code) && spec.rule().equals(rule));
    }

    private static String bungeoRule() {
        return BungeoppangV5Spec.RULES_VERSION + "-" + BungeoppangV5Spec.DURATION_MS + "ms";
    }

    private static String jumpRule() {
        return JumpCourse.RULES_VERSION + "-" + JumpCourse.COURSE_VERSION;
    }

    private AwardSpec requireSupported(String code, String rule) {
        requireCode(code);
        return SUPPORTED.stream().filter(spec -> spec.code().equals(code) && spec.rule().equals(rule))
                .findFirst().orElseThrow(() -> error(400, "EVENT_RANKING_UNSUPPORTED",
                        "이 게임과 규칙의 서버 검증 랭킹이 아직 없습니다."));
    }

    private void requireCode(String code) {
        if (code == null || !code.matches("(?:BUNGEOPPANG|JUMPMAP|MG_[A-Z0-9_]{1,21})")) {
            throw error(400, "EVENT_INVALID_TYPE", "게임 코드를 확인해 주세요.");
        }
    }

    private void requireWeek(LocalDate week) {
        if (week == null || week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw error(400, "EVENT_INVALID_WEEK", "KST 월요일 주차를 선택해 주세요.");
        }
        if (!week.isAfter(LEGACY_WEEK)) {
            throw error(409, "EVENT_LEGACY_ROUND", "11월 2일 및 이전 회차는 기존 결과 API를 이용해 주세요.");
        }
    }

    private void validateConfiguration(LocalDate week, Configuration input) {
        if (input == null || input.startsAt() == null || input.endsAt() == null
                || input.announcesAt() == null || input.displayName() == null
                || input.prizeName() == null || input.rankingRuleVersion() == null
                || input.displayName().trim().isEmpty() || input.displayName().trim().length() > 100
                || input.prizeName().trim().isEmpty() || input.prizeName().trim().length() > 120
                || !input.startsAt().isBefore(input.endsAt())
                || input.announcesAt().isBefore(input.endsAt())
                || input.startsAt().isBefore(week.atStartOfDay(KST).toInstant())
                || input.endsAt().isAfter(week.plusWeeks(1).atStartOfDay(KST).toInstant())) {
            throw error(400, "EVENT_INVALID_CONFIGURATION", "게임상 기간과 상품 설정을 확인해 주세요.");
        }
    }

    private Game game(ConfiguredGame row) {
        return new Game(row.gameCode(), row.displayName(), row.rankingRuleVersion(), row.week(),
                row.startsAt(), row.endsAt(), row.announcesAt(), row.prizeName(), row.enabled(),
                row.finalizedAt());
    }

    private void requireRead(long id) {
        if (!admins.canRead(id)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
    }

    private void requireOperate(long id) {
        if (!admins.canOperate(id)) {
            throw error(403, "EVENT_ADMIN_FORBIDDEN", "이벤트 운영 권한이 없습니다.");
        }
    }

    private boolean excluded(long userId) {
        return admins.canRead(userId) || reviewedExcludedUserIds.contains(userId);
    }

    private void requireBackfillMatch(AwardSpec spec, ConfiguredGame game) {
        if (!game.week().equals(spec.week()) || !game.startsAt().equals(spec.startsAt())
                || !game.endsAt().equals(spec.endsAt()) || !game.announcesAt().equals(spec.announcesAt())
                || !game.gameCode().equals(spec.code()) || !game.displayName().equals(spec.displayName())
                || !game.rankingRuleVersion().equals(spec.rule()) || !game.enabled()
                || !game.prizeName().equals(BACKFILL_PRIZE)) {
            throw error(409, "EVENT_BACKFILL_MISMATCH", "소급 정산 회차가 승인된 기간·규칙과 다릅니다.");
        }
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private MinigameAwardException error(int status, String code, String message) {
        return new MinigameAwardException(status, code, message);
    }

    @Schema(name = "WeeklyMinigameConfiguration")
    public record Configuration(Instant startsAt, Instant endsAt, Instant announcesAt,
            String displayName, String rankingRuleVersion, boolean enabled, String prizeName) {}
    @Schema(name = "WeeklyMinigameFinalizeRequest")
    public record FinalizeRequest(Integer candidateCount, Integer excludedGmCount,
            String expectedSourceRecordId) {}
    @Schema(name = "WeeklyMinigameGameConfig")
    public record Game(String gameCode, String displayName, String rankingRuleVersion,
            LocalDate weekStartDate, Instant startsAt, Instant endsAt, Instant announcesAt,
            String prizeName, boolean enabled, Instant finalizedAt) {}
    @Schema(name = "WeeklyMinigameSupportedGame")
    public record SupportedGame(String gameCode, String displayName, String rankingRuleVersion) {}
    @Schema(name = "WeeklyMinigameRank")
    public record Rank(int place, long userId, String nickname, String sourceRecordId, long sourceValue,
            long secondaryValue, Instant achievedAt) {}
    @Schema(name = "WeeklyMinigameRanking")
    public record Ranking(Game game, String status, int candidateCount, int excludedGmCount,
            List<Rank> ranks, Winner winner) {}
    @Schema(name = "WeeklyMinigameMemberResult")
    public record MemberResult(String gameCode, LocalDate weekStartDate, Instant announcesAt,
            String status, Prize prize) {}
    @Schema(name = "WeeklyMinigamePrize")
    public record Prize(String prizeName, long sourceValue, Instant sourceAchievedAt) {}

    private record AwardSpec(String code, String displayName, String rule, LocalDate week,
            Instant startsAt, Instant endsAt, Instant announcesAt) {
        boolean backfill() {
            return week != null;
        }
    }
}
