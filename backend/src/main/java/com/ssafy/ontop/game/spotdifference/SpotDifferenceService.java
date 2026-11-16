package com.ssafy.ontop.game.spotdifference;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
class SpotDifferenceService {
    static final int ROUND_COUNT = 5;
    static final Duration ROUND_TIME = Duration.ofSeconds(60);
    static final Duration RUN_LIFETIME = Duration.ofMinutes(15);
    static final Duration MISS_COOLDOWN = Duration.ofSeconds(1);
    private static final int WIDTH = 1448;
    private static final int HEIGHT = 1086;
    private final ConcurrentHashMap<Long, Run> runs = new ConcurrentHashMap<>();
    private final List<Puzzle> puzzles;
    private final List<Puzzle> hardPuzzles;
    private final SpotDifferenceRewards rewards;
    private final Clock clock;
    private final BehaviorLog behaviorLog;

    SpotDifferenceService(ObjectMapper mapper, SpotDifferenceRewards rewards) throws IOException {
        this(mapper, rewards, BehaviorLog.disabled());
    }

    @Autowired
    SpotDifferenceService(ObjectMapper mapper, SpotDifferenceRewards rewards, BehaviorLog behaviorLog)
            throws IOException {
        this(readPuzzles(mapper), rewards, Clock.systemUTC(), behaviorLog);
    }

    SpotDifferenceService(List<Puzzle> puzzles, SpotDifferenceRewards rewards, Clock clock) {
        this(puzzles, rewards, clock, BehaviorLog.disabled());
    }

    SpotDifferenceService(List<Puzzle> puzzles, SpotDifferenceRewards rewards, Clock clock, BehaviorLog behaviorLog) {
        this.puzzles = List.copyOf(puzzles);
        this.rewards = rewards;
        this.clock = clock;
        this.behaviorLog = behaviorLog;
        if (puzzles.size() < ROUND_COUNT || puzzles.stream().map(Puzzle::id).distinct().count() != puzzles.size()
                || puzzles.stream().anyMatch(puzzle -> !valid(puzzle.normal())
                        || puzzle.hard() == null || (!puzzle.hard().isEmpty() && !valid(puzzle.hard())))) {
            throw new IllegalArgumentException("Invalid shooting pavilion puzzle catalog");
        }
        this.hardPuzzles = puzzles.stream().filter(puzzle -> !puzzle.hard().isEmpty()).toList();
        if (hardPuzzles.size() < ROUND_COUNT) {
            throw new IllegalArgumentException(
                    "Shooting pavilion puzzle catalog requires at least " + ROUND_COUNT + " HARD scenes");
        }
    }

    private static boolean valid(List<Difference> differences) {
        return differences != null && differences.size() == 6 && differences.stream().allMatch(difference -> {
            var box = difference.box();
            return box.size() == 4 && box.get(0) >= 0 && box.get(1) >= 0
                    && box.get(2) <= WIDTH && box.get(3) <= HEIGHT
                    && box.get(0) < box.get(2) && box.get(1) < box.get(3);
        });
    }

    private static List<Puzzle> readPuzzles(ObjectMapper mapper) throws IOException {
        try (var stream = new ClassPathResource("spot-difference/puzzles.json").getInputStream()) {
            return mapper.readValue(stream, new TypeReference<List<Puzzle>>() { });
        }
    }

    SpotDifferenceRewards.Budget status(long userId) {
        return rewards.status(userId);
    }

    View start(long userId, Start input) {
        if (input.difficulty() == null || input.requestId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "난이도를 다시 선택해 주세요.");
        }
        var now = clock.instant();
        // Remove expired sessions when the game is used. Each account has at most one live run.
        runs.entrySet().removeIf(entry -> {
            if (now.isBefore(entry.getValue().expires)) return false;
            record(entry.getKey(), entry.getValue(), "EXPIRED", entry.getValue().lastAt);
            return true;
        });
        var response = new View[1];
        runs.compute(userId, (owner, previous) -> {
            boolean same = previous != null && previous.requestId.equals(input.requestId());
            if (previous != null && !same) record(userId, previous, "RESTARTED", now);
            var run = same ? previous : newRun(input, now);
            response[0] = view(run, now, null);
            return run;
        });
        return response[0];
    }

    View act(long userId, UUID id, Action action) {
        if (action.type() == null || action.round() < 1 || action.round() > ROUND_COUNT
                || (action.type() == ActionType.TAP && !validTap(action))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력 위치를 확인해 주세요.");
        }
        var response = new View[1];
        runs.compute(userId, (owner, run) -> {
            var now = clock.instant();
            if (run == null || !run.id.equals(id) || !now.isBefore(run.expires)) {
                throw new ResponseStatusException(HttpStatus.GONE, "종료된 판이에요. 새로 시작해 주세요.");
            }
            if (run.phase == Phase.PLAYING && !now.isBefore(run.deadline)) run.phase = Phase.REVIEW;
            run.lastAt = now;
            TapResult tap = null;
            if (action.round() == run.round + 1) {
                switch (action.type()) {
                    case READY -> {
                        if (run.phase == Phase.WAITING) {
                            run.deadline = now.plus(ROUND_TIME);
                            run.phase = Phase.PLAYING;
                            run.readyAt = now;
                            run.roundsStarted++;
                        }
                    }
                    case TAP -> {
                        if (run.phase == Phase.PLAYING) tap = tap(run, action, now);
                    }
                    case NEXT -> {
                        if (run.phase == Phase.REVIEW && run.round + 1 < ROUND_COUNT) {
                            run.round++;
                            run.matched.clear();
                            run.phase = Phase.WAITING;
                        }
                    }
                    case SYNC -> { }
                }
            }
            if (run.phase == Phase.REVIEW && run.round + 1 == ROUND_COUNT && run.receipt == null) {
                run.receipt = rewards.settle(userId, id, run.total * run.difficulty.coinPerHit);
                record(userId, run, "COMPLETED", now);
            }
            response[0] = view(run, now, tap);
            return run;
        });
        return response[0];
    }

    private Run newRun(Start input, Instant now) {
        return new Run(input, selectScenes(input.difficulty()), now, now.plus(RUN_LIFETIME));
    }

    List<Puzzle> selectScenes(Difficulty difficulty) {
        var shuffled = new ArrayList<>(difficulty == Difficulty.HARD ? hardPuzzles : puzzles);
        Collections.shuffle(shuffled);
        return List.copyOf(shuffled.subList(0, ROUND_COUNT));
    }

    // 판마다 끝날 때 한 번 남긴다(완주·새 판으로 교체·만료). 판 진행은 메모리에만 있어 이 기록이 판 수의 원본이다.
    // 만료는 다음 시작 요청 때 정리되므로 기록 시각은 마지막으로 행동한 시각이다.
    private void record(long userId, Run run, String endReason, Instant at) {
        if (run.logged) return;
        run.logged = true;
        behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.GAME_PLAY_STATS, at)
                .userId(userId)
                .gameId(run.id.toString())
                .prop("gameCode", "SPOT_DIFFERENCE")
                .prop("difficulty", run.difficulty.name())
                .prop("endReason", endReason)
                .prop("roundsStarted", run.roundsStarted)
                .prop("roundsCleared", run.roundsCleared)
                .prop("found", run.total)
                .prop("misses", run.misses)
                .prop("fastestClearMs", run.fastestClearMs)
                .prop("reward", run.receipt == null ? null : run.receipt.granted())
                .prop("durationMs", Math.max(0, Duration.between(run.startedAt, at).toMillis()))
                .build());
    }

    static boolean validTap(Action action) {
        return action.x() != null && action.y() != null && action.x() >= 0 && action.x() < WIDTH
                && action.y() >= 0 && action.y() < HEIGHT;
    }

    private static TapResult tap(Run run, Action action, Instant now) {
        if (now.isBefore(run.nextTap)) return TapResult.WAIT;
        var answers = run.answers();
        for (int index = 0; index < answers.size(); index++) {
            if (!answers.get(index).contains(action.x(), action.y())) continue;
            if (!run.matched.add(index)) return TapResult.ALREADY_FOUND;
            run.total++;
            run.nextTap = now.plusMillis(120);
            if (run.matched.size() == answers.size()) {
                run.phase = Phase.REVIEW;
                run.roundsCleared++;
                long cleared = Duration.between(run.readyAt, now).toMillis();
                if (run.fastestClearMs == null || cleared < run.fastestClearMs) run.fastestClearMs = cleared;
            }
            return TapResult.HIT;
        }
        run.nextTap = now.plus(MISS_COOLDOWN);
        run.misses++;
        return TapResult.MISS;
    }

    private static View view(Run run, Instant now, TapResult tap) {
        var scene = run.scenes.get(run.round);
        var answers = run.answers();
        var matched = run.matched.stream().sorted().map(answers::get).toList();
        var remaining = run.phase == Phase.PLAYING ? Duration.between(now, run.deadline).toMillis() : 0;
        return new View(run.id, run.difficulty, run.round + 1, scene.id(), scene.name(), run.phase,
                Math.max(0, remaining), run.total, matched, run.phase == Phase.REVIEW ? answers : List.of(),
                tap, run.receipt, remainingMs(now, run.nextTap));
    }

    static long remainingMs(Instant now, Instant until) {
        return Math.max(0, Duration.between(now, until).toMillis());
    }

    enum Difficulty {
        NORMAL(2), HARD(3);
        final int coinPerHit;

        Difficulty(int coinPerHit) {
            this.coinPerHit = coinPerHit;
        }
    }

    enum Phase { WAITING, PLAYING, REVIEW }
    enum ActionType { READY, TAP, NEXT, SYNC }
    enum TapResult { HIT, MISS, WAIT, ALREADY_FOUND }

    record Start(Difficulty difficulty, UUID requestId) { }
    record Action(ActionType type, int round, Integer x, Integer y) { }
    record Difference(String label, List<Integer> box) {
        boolean contains(int x, int y) {
            return x >= box.get(0) && x < box.get(2) && y >= box.get(1) && y < box.get(3);
        }
    }
    record Puzzle(String id, String name, List<Difference> normal, List<Difference> hard) {
        List<Difference> answers(Difficulty difficulty) {
            return difficulty == Difficulty.NORMAL ? normal : hard;
        }
    }
    record View(UUID id, Difficulty difficulty, int round, String scene, String name, Phase phase,
                long remainingMs, int total, List<Difference> matched, List<Difference> answers,
                TapResult tap, SpotDifferenceRewards.Receipt receipt, long cooldownMs) { }

    private static final class Run {
        final UUID id = UUID.randomUUID();
        final UUID requestId;
        final Difficulty difficulty;
        final List<Puzzle> scenes;
        final Instant startedAt;
        final Instant expires;
        final Set<Integer> matched = new HashSet<>();
        int round;
        int total;
        Phase phase = Phase.WAITING;
        Instant deadline;
        Instant nextTap = Instant.EPOCH;
        SpotDifferenceRewards.Receipt receipt;
        // 행동 로그용 집계. 진행·판정에는 쓰지 않는다.
        Instant lastAt;
        Instant readyAt;
        int roundsStarted;
        int roundsCleared;
        int misses;
        Long fastestClearMs;
        boolean logged;

        Run(Start input, List<Puzzle> scenes, Instant startedAt, Instant expires) {
            this.requestId = input.requestId();
            this.difficulty = input.difficulty();
            this.scenes = scenes;
            this.startedAt = startedAt;
            this.lastAt = startedAt;
            this.expires = expires;
        }

        List<Difference> answers() {
            return scenes.get(round).answers(difficulty);
        }
    }
}
