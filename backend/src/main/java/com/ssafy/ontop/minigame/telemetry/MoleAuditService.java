package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.minigame.service.MoleTargets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
class MoleAuditService {
    private static final int MAX_BATCH = 64;
    private static final int MAX_TRACKED_USERS = 4096;
    private static final int BATCHES_PER_SECOND = 8;
    private static final int SEARCH_LIMIT = 40;
    private static final int MEMBER_LIMIT = 12;
    private static final int REFERENCE_LIMIT = 40;
    private static final int DETECTION_DAYS = 30;
    private static final int DETECTION_LIMIT = 100;
    private static final int DETECTION_CACHE_SECONDS = 30;

    private final MoleAuditStore store;
    private final BehaviorLog log;
    private final BehaviorLogProperties properties;
    private final ConcurrentHashMap<MoleAuditGame, MoleAuditDtos.Detections> detectionCache = new ConcurrentHashMap<>();
    // 접근 순서가 바뀌는 get을 포함해 모든 접근을 synchronized takeQuota에서 처리한다.
    private final LinkedHashMap<Long, BatchQuota> quotas = new LinkedHashMap<>(16, 0.75f, true);

    MoleAuditService(MoleAuditStore store, BehaviorLog log, BehaviorLogProperties properties) {
        this.store = store;
        this.log = log;
        this.properties = properties;
    }

    void receive(MoleAuditGame game, long roundId, long userId, List<MoleAuditDtos.Tap> taps, Instant receivedAt) {
        if (!properties.enabled() || roundId <= 0 || taps == null || taps.isEmpty() || taps.size() > MAX_BATCH
                || !takeQuota(userId, receivedAt.getEpochSecond()) || taps.stream().anyMatch(tap -> !valid(game, tap))) {
            return;
        }
        var round = store.findOwnedRound(game, roundId, userId);
        if (round == null || round.status().equals("EXPIRED") || receivedAt.isBefore(round.startedAt())
                || receivedAt.isAfter(round.startedAt().plusMillis(game.durationMs + 30_000L))) {
            return;
        }
        log.record(() -> {
            var hidden = new MoleTargets(game.path, roundId, round.seed()).hiddenIds(game.holes);
            var captured = taps.stream().map(tap -> encode(tap, hidden.contains(tap.targetId()))).toList();
            return BehaviorEvent.builder(BehaviorEventType.MOLE_TAP_BATCH, receivedAt)
                    .gameId(game.key(roundId)).userId(userId).prop("taps", captured).build();
        });
    }

    List<MoleAuditDtos.Round> search(MoleAuditGame game, Long user, Long id, LocalDate day) {
        Instant from = day == null ? null : start(day);
        Instant until = day == null ? null : start(day.plusDays(1));
        var rounds = store.list(game, user, id, from, until, null, null, SEARCH_LIMIT);
        return captures(game, rounds).stream().map(Capture::summary).toList();
    }

    MoleAuditDtos.Detections detections(MoleAuditGame game, Instant until) {
        // 같은 게임에 대한 동시 요청은 한 번의 집계를 공유한다.
        return detectionCache.compute(game, (key, cached) -> {
            if (cached != null && until.isBefore(cached.until().plusSeconds(DETECTION_CACHE_SECONDS))) {
                return cached;
            }
            Instant from = until.minus(DETECTION_DAYS, ChronoUnit.DAYS);
            var items = List.copyOf(store.detections(key, from, until, DETECTION_LIMIT));
            return new MoleAuditDtos.Detections(items, from, until, DETECTION_LIMIT);
        });
    }

    MoleAuditDtos.Detail detail(MoleAuditGame game, long id, MoleAuditDtos.Input input) {
        var roundWithMember = store.findRoundWithMember(game, id);
        if (roundWithMember == null) {
            return null;
        }
        var selected = roundWithMember.round();
        var day = selected.startedAt().atZone(MinigameRewardBudget.KST).toLocalDate();
        Instant from = start(day);
        Instant until = start(day.plusDays(1));
        var recent = new ArrayList<>(store.list(game, selected.userId(), null, from, until,
                selected.version(), null, MEMBER_LIMIT));
        if (recent.stream().noneMatch(round -> round.id() == id)) {
            recent.addFirst(selected);
        }
        var member = captures(game, recent);
        var reference = captures(game, store.list(game, null, null, from, until, selected.version(),
                selected.userId(), REFERENCE_LIMIT * 2)).stream()
                .filter(round -> round.summary().honeypotTaps() == 0 && round.summary().completionHoneypotTaps() == 0)
                .filter(round -> round.hasOnlyInput(input))
                .limit(REFERENCE_LIMIT).toList();
        var target = member.stream().filter(round -> round.summary().roundId().equals(Long.toString(id)))
                .findFirst().orElseThrow();
        var timeline = target.timeline().stream().sorted(Comparator.comparing(MoleAuditDtos.Entry::receivedAt)
                .thenComparingInt(MoleAuditDtos.Entry::sequence)).toList();
        return new MoleAuditDtos.Detail(target.summary(), roundWithMember.nickname(), roundWithMember.withdrawn(),
                timeline, member.stream().map(Capture::summary).toList(), compare(member, input),
                compare(reference, input));
    }

    private List<Capture> captures(MoleAuditGame game, List<MoleAuditStore.RoundData> rounds) {
        var events = store.events(game, rounds);
        return rounds.stream().map(round -> capture(round, events.getOrDefault(round.id(), List.of()))).toList();
    }

    private synchronized boolean takeQuota(long userId, long second) {
        var previous = quotas.get(userId);
        int used = previous != null && previous.second() == second ? previous.count() : 0;
        if (used >= BATCHES_PER_SECOND) {
            return false;
        }
        quotas.put(userId, new BatchQuota(second, used + 1));
        if (quotas.size() > MAX_TRACKED_USERS) {
            quotas.pollFirstEntry();
        }
        return true;
    }

    private static boolean valid(MoleAuditGame game, MoleAuditDtos.Tap tap) {
        return tap != null && tap.sequence() > 0 && tap.sequence() <= game.maxTaps
                && tap.hole() >= 0 && tap.hole() < game.holes
                && tap.clientAtMs() >= 0 && tap.clientAtMs() <= game.durationMs
                && tap.input() != null && tap.outcome() != null && tap.outcome() != MoleAuditDtos.Outcome.HONEYPOT
                && (tap.targetId() == null || tap.targetId().length() <= 64)
                && ((tap.spawnId() == null && tap.appearedAtMs() == null)
                    || (tap.spawnId() != null && tap.spawnId() >= 0 && tap.spawnId() <= game.maxTaps + game.holes
                        && tap.appearedAtMs() != null && tap.appearedAtMs() >= 0
                        && tap.appearedAtMs() <= tap.clientAtMs()));
    }

    // 행동 로그의 단일 배열 속성에 고정 길이 행을 보관한다. targetId 원문은 저장하지 않는다.
    private static String encode(MoleAuditDtos.Tap tap, boolean hidden) {
        return tap.sequence() + ":" + tap.clientAtMs() + ":" + tap.hole() + ":" + tap.input() + ":"
                + (hidden ? MoleAuditDtos.Outcome.HONEYPOT : tap.outcome()) + ":" + tap.spawnId() + ":"
                + tap.appearedAtMs();
    }

    private static Capture capture(MoleAuditStore.RoundData round, List<MoleAuditStore.Event> events) {
        var bySequence = new TreeMap<Integer, MoleAuditDtos.Entry>();
        int settledHits = 0;
        for (var event : events) {
            if (event.settlement()) {
                settledHits = Math.max(settledHits, event.props().path("hits").asInt());
                continue;
            }
            for (var row : event.props().path("taps")) {
                String[] parts = row.asText().split(":", -1);
                var entry = new MoleAuditDtos.Entry(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]),
                        Integer.parseInt(parts[2]), MoleAuditDtos.Input.valueOf(parts[3]),
                        MoleAuditDtos.Outcome.valueOf(parts[4]), integer(parts[5]), integer(parts[6]), event.receivedAt());
                bySequence.merge(entry.sequence(), entry, (first, next) ->
                        first.outcome() != MoleAuditDtos.Outcome.HONEYPOT
                            && next.outcome() == MoleAuditDtos.Outcome.HONEYPOT ? next : first);
            }
        }
        var timeline = List.copyOf(bySequence.values());
        int streamedHits = (int) timeline.stream().filter(entry -> entry.outcome() == MoleAuditDtos.Outcome.HONEYPOT).count();
        var summary = new MoleAuditDtos.Round(Long.toString(round.id()), Long.toString(round.userId()), round.startedAt(),
                round.status(), timeline.size(), streamedHits, settledHits);
        return new Capture(summary, timeline);
    }

    static MoleAuditDtos.Comparison compare(List<Capture> rounds, MoleAuditDtos.Input input) {
        var first = new ArrayList<Integer>();
        var rapid = new ArrayList<Integer>();
        int comparableRounds = 0;
        int honeypot = 0;
        int completionHoneypot = 0;
        for (var round : rounds) {
            honeypot += round.summary().honeypotTaps();
            completionHoneypot += round.summary().completionHoneypotTaps();
            if (!round.hasOnlyInput(input)) {
                continue;
            }
            comparableRounds++;
            var lastHit = new HashMap<Integer, MoleAuditDtos.Entry>();
            for (var tap : round.timeline()) {
                if (tap.spawnId() == null || tap.appearedAtMs() == null
                        || (tap.outcome() != MoleAuditDtos.Outcome.HIT && tap.outcome() != MoleAuditDtos.Outcome.RAPID)) {
                    continue;
                }
                var previous = lastHit.put(tap.spawnId(), tap);
                if (previous == null) {
                    first.add(tap.clientAtMs() - tap.appearedAtMs());
                } else if (previous.outcome() == MoleAuditDtos.Outcome.RAPID
                        && previous.hole() == tap.hole() && tap.clientAtMs() >= previous.clientAtMs()) {
                    rapid.add(tap.clientAtMs() - previous.clientAtMs());
                }
            }
        }
        return new MoleAuditDtos.Comparison(comparableRounds, honeypot, completionHoneypot,
                distribution(first), distribution(rapid));
    }

    private static MoleAuditDtos.Distribution distribution(List<Integer> values) {
        if (values.isEmpty()) {
            return new MoleAuditDtos.Distribution(0, null, null, null);
        }
        values.sort(Comparator.naturalOrder());
        return new MoleAuditDtos.Distribution(values.size(), percentile(values, 50), percentile(values, 10),
                percentile(values, 90));
    }

    private static int percentile(List<Integer> values, int percent) {
        double index = (values.size() - 1) * percent / 100.0;
        int lower = (int) index;
        return (int) Math.round(values.get(lower)
                + (values.get((int) Math.ceil(index)) - values.get(lower)) * (index - lower));
    }

    private static Integer integer(String value) {
        return "null".equals(value) ? null : Integer.valueOf(value);
    }

    private static Instant start(LocalDate day) {
        return day.atStartOfDay(MinigameRewardBudget.KST).toInstant();
    }

    record Capture(MoleAuditDtos.Round summary, List<MoleAuditDtos.Entry> timeline) {
        boolean hasOnlyInput(MoleAuditDtos.Input input) {
            return !timeline.isEmpty() && timeline.stream().allMatch(tap -> tap.input() == input);
        }
    }

    private record BatchQuota(long second, int count) {
    }
}
