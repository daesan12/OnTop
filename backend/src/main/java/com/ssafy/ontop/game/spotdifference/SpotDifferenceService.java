package com.ssafy.ontop.game.spotdifference;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    static final int ROUND_COUNT = 6;
    private static final Duration RUN_LIFETIME = Duration.ofMinutes(15);
    private static final int WIDTH = 1448;
    private static final int HEIGHT = 1086;
    private final ConcurrentHashMap<Long, Run> runs = new ConcurrentHashMap<>();
    private final List<Puzzle> puzzles;
    private final SpotDifferenceRewards rewards;
    private final Clock clock;

    @Autowired
    SpotDifferenceService(ObjectMapper mapper, SpotDifferenceRewards rewards) throws IOException {
        this(readPuzzles(mapper), rewards, Clock.systemUTC());
    }

    SpotDifferenceService(List<Puzzle> puzzles, SpotDifferenceRewards rewards, Clock clock) {
        this.puzzles = List.copyOf(puzzles);
        this.rewards = rewards;
        this.clock = clock;
        if (puzzles.size() < ROUND_COUNT || puzzles.stream().map(Puzzle::id).distinct().count() != puzzles.size()
                || puzzles.stream().anyMatch(puzzle -> !valid(puzzle.normal()) || !valid(puzzle.hard()))) {
            throw new IllegalArgumentException("Invalid shooting pavilion puzzle catalog");
        }
    }

    private static boolean valid(List<Difference> differences) {
        return differences.size() == 6 && differences.stream().allMatch(difference -> {
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
        runs.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expires));
        var response = new View[1];
        runs.compute(userId, (owner, previous) -> {
            var run = previous != null && previous.requestId.equals(input.requestId())
                    ? previous : newRun(input, now);
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
            TapResult tap = null;
            if (action.round() == run.round + 1) {
                switch (action.type()) {
                    case READY -> {
                        if (run.phase == Phase.WAITING) {
                            run.deadline = now.plusSeconds(run.difficulty.seconds);
                            run.phase = Phase.PLAYING;
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
                            run.nextTap = Instant.EPOCH;
                        }
                    }
                    case SYNC -> { }
                }
            }
            if (run.phase == Phase.REVIEW && run.round + 1 == ROUND_COUNT && run.receipt == null) {
                run.receipt = rewards.settle(userId, id, run.total * run.difficulty.coinPerHit);
            }
            response[0] = view(run, now, tap);
            return run;
        });
        return response[0];
    }

    private Run newRun(Start input, Instant now) {
        var shuffled = new ArrayList<>(puzzles);
        Collections.shuffle(shuffled);
        return new Run(input, List.copyOf(shuffled.subList(0, ROUND_COUNT)), now.plus(RUN_LIFETIME));
    }

    private static boolean validTap(Action action) {
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
            if (run.matched.size() == answers.size()) run.phase = Phase.REVIEW;
            return TapResult.HIT;
        }
        run.nextTap = now.plusMillis(650);
        return TapResult.MISS;
    }

    private static View view(Run run, Instant now, TapResult tap) {
        var scene = run.scenes.get(run.round);
        var answers = run.answers();
        var matched = run.matched.stream().sorted().map(answers::get).toList();
        var remaining = run.phase == Phase.PLAYING ? Duration.between(now, run.deadline).toMillis() : 0;
        return new View(run.id, run.difficulty, run.round + 1, scene.id(), scene.name(), run.phase,
                Math.max(0, remaining), run.total, matched, run.phase == Phase.REVIEW ? answers : List.of(),
                tap, run.receipt);
    }

    enum Difficulty {
        NORMAL(30, 2), HARD(30, 3);
        final int seconds;
        final int coinPerHit;

        Difficulty(int seconds, int coinPerHit) {
            this.seconds = seconds;
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
    record Puzzle(String id, String name, List<Difference> normal, List<Difference> hard) { }
    record View(UUID id, Difficulty difficulty, int round, String scene, String name, Phase phase,
                long remainingMs, int total, List<Difference> matched, List<Difference> answers,
                TapResult tap, SpotDifferenceRewards.Receipt receipt) { }

    private static final class Run {
        final UUID id = UUID.randomUUID();
        final UUID requestId;
        final Difficulty difficulty;
        final List<Puzzle> scenes;
        final Instant expires;
        final Set<Integer> matched = new HashSet<>();
        int round;
        int total;
        Phase phase = Phase.WAITING;
        Instant deadline;
        Instant nextTap = Instant.EPOCH;
        SpotDifferenceRewards.Receipt receipt;

        Run(Start input, List<Puzzle> scenes, Instant expires) {
            this.requestId = input.requestId();
            this.difficulty = input.difficulty();
            this.scenes = scenes;
            this.expires = expires;
        }

        List<Difference> answers() {
            var scene = scenes.get(round);
            return difficulty == Difficulty.NORMAL ? scene.normal() : scene.hard();
        }
    }
}
