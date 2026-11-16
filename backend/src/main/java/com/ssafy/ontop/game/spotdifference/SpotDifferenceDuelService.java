package com.ssafy.ontop.game.spotdifference;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Action;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difference;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difficulty;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Phase;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Puzzle;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.TapResult;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.View;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
class SpotDifferenceDuelService {
    private static final Duration INTRO_TIME = Duration.ofSeconds(1);
    private static final Duration REVIEW_TIME = Duration.ofSeconds(4);
    private static final Duration DISCONNECT_TIME = Duration.ofSeconds(45);
    private static final Duration CLEANUP_INTERVAL = Duration.ofMinutes(1);
    private static final int REPLAY_WINDOW = 64;

    private final Map<UUID, Duel> duels = new HashMap<>();
    private final Map<Long, Duel> active = new HashMap<>();
    private final SpotDifferenceService games;
    private final Clock clock;
    private Instant nextCleanup = Instant.MIN;

    @Autowired
    SpotDifferenceDuelService(SpotDifferenceService games) {
        this(games, Clock.systemUTC());
    }

    SpotDifferenceDuelService(SpotDifferenceService games, Clock clock) {
        this.games = games;
        this.clock = clock;
    }

    synchronized DuelView create(long userId, Difficulty difficulty) {
        if (difficulty == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "난이도를 다시 선택해 주세요.");
        }
        var now = clock.instant();
        removeExpired(now);
        var previous = active.get(userId);
        if (previous != null && now.isBefore(previous.expires)) {
            advance(previous, now);
            if (previous.end == null) {
                return observe(previous, userId, now);
            }
        }
        var duel = new Duel(difficulty, games.selectScenes(difficulty), now);
        addPlayer(duel, userId, now);
        duels.put(duel.id, duel);
        return view(duel, userId, now, null);
    }

    synchronized DuelView join(long userId, UUID code) {
        var now = clock.instant();
        removeExpired(now);
        var duel = required(code, now);
        advance(duel, now);
        if (duel.players.containsKey(userId)) {
            return observe(duel, userId, now);
        }
        if (duel.end != null || duel.players.size() == 2) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 시작했거나 종료된 방이에요.");
        }
        var previous = active.get(userId);
        if (previous != null && now.isBefore(previous.expires)) {
            advance(previous, now);
            if (previous.end == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "참가 중인 대결에서 먼저 나가 주세요.");
            }
        }
        addPlayer(duel, userId, now);
        return view(duel, userId, now, null);
    }

    synchronized Current current(long userId) {
        var now = clock.instant();
        removeExpired(now);
        var duel = active.get(userId);
        return new Current(duel == null || !now.isBefore(duel.expires) ? null : observe(duel, userId, now));
    }

    synchronized DuelView act(long userId, UUID id, DuelAction action) {
        var now = clock.instant();
        removeExpired(now);
        var duel = required(id, now);
        var player = duel.players.get(userId);
        if (player == null) {
            throw new ResponseStatusException(HttpStatus.GONE, "참가 중인 대결을 찾을 수 없어요.");
        }
        if (action.type() == null || action.round() < 1 || action.round() > SpotDifferenceService.ROUND_COUNT
                || (action.type() == Command.TAP && (action.actionId() == null
                || !SpotDifferenceService.validTap(new Action(null, action.round(), action.x(), action.y()))))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력 위치를 확인해 주세요.");
        }
        advance(duel, now);
        player.lastSeen = now;
        TapResult tap = null;
        if (action.type() == Command.LEAVE) {
            if (duel.end == null) {
                end(duel, End.LEFT, opponent(duel, userId));
            }
            active.remove(userId, duel);
        } else if (duel.end == null && duel.players.size() == 2 && duel.round + 1 == action.round()) {
            switch (action.type()) {
                case READY -> {
                    if (duel.phase == Phase.WAITING) {
                        player.ready = true;
                        if (duel.startsAt == null && duel.players.values().stream().allMatch(p -> p.ready)) {
                            duel.startsAt = now.plus(INTRO_TIME);
                        }
                    }
                }
                case TAP -> {
                    tap = player.actions.get(action.actionId());
                    if (tap == null && duel.phase == Phase.PLAYING) {
                        tap = tap(duel, player, userId, action, now);
                        player.actions.put(action.actionId(), tap);
                        if (player.actions.size() > REPLAY_WINDOW) {
                            player.actions.pollFirstEntry();
                        }
                    }
                }
                case SYNC, LEAVE -> { }
            }
        }
        return view(duel, userId, now, tap);
    }

    private static TapResult tap(Duel duel, Player player, long userId, DuelAction action, Instant now) {
        if (now.isBefore(player.nextTap)) {
            return TapResult.WAIT;
        }
        var answers = duel.answers();
        for (int index = 0; index < answers.size(); index++) {
            if (!answers.get(index).contains(action.x(), action.y())) {
                continue;
            }
            if (duel.claims.putIfAbsent(index, userId) != null) {
                return TapResult.ALREADY_FOUND;
            }
            player.total++;
            player.lastPoint = ++duel.pointSequence;
            if (duel.claims.size() == answers.size()) {
                review(duel, now);
            }
            return TapResult.HIT;
        }
        player.nextTap = now.plus(SpotDifferenceService.MISS_COOLDOWN);
        return TapResult.MISS;
    }

    private static void advance(Duel duel, Instant now) {
        if (duel.end != null || duel.players.size() < 2) {
            return;
        }
        var disconnected = duel.players.entrySet().stream()
                .filter(entry -> !now.isBefore(entry.getValue().lastSeen.plus(DISCONNECT_TIME)))
                .map(Map.Entry::getKey).toList();
        if (!disconnected.isEmpty()) {
            end(duel, End.DISCONNECTED, disconnected.size() == 1 ? opponent(duel, disconnected.getFirst()) : null);
            return;
        }
        if (duel.phase == Phase.WAITING && duel.startsAt != null && !now.isBefore(duel.startsAt)) {
            duel.phase = Phase.PLAYING;
            duel.deadline = duel.startsAt.plus(SpotDifferenceService.ROUND_TIME);
        }
        if (duel.phase == Phase.PLAYING && !now.isBefore(duel.deadline)) {
            review(duel, now);
        }
        if (duel.end == null && duel.phase == Phase.REVIEW && !now.isBefore(duel.deadline)) {
            duel.round++;
            duel.claims.clear();
            duel.startsAt = null;
            duel.phase = Phase.WAITING;
            duel.players.values().forEach(player -> {
                player.ready = false;
                player.actions.clear();
            });
        }
    }

    private static void review(Duel duel, Instant now) {
        duel.phase = Phase.REVIEW;
        duel.deadline = now.plus(REVIEW_TIME);
        if (duel.round + 1 < SpotDifferenceService.ROUND_COUNT) {
            return;
        }
        // 동점이면 마지막 득점을 먼저 한 쪽이 같은 점수에 먼저 도달했다.
        var winner = duel.players.entrySet().stream().filter(entry -> entry.getValue().total > 0)
                .min((left, right) -> {
                    int byScore = Integer.compare(right.getValue().total, left.getValue().total);
                    return byScore != 0 ? byScore : Integer.compare(left.getValue().lastPoint, right.getValue().lastPoint);
                }).map(Map.Entry::getKey).orElse(null);
        end(duel, End.COMPLETED, winner);
    }

    private static void end(Duel duel, End reason, Long winner) {
        duel.end = reason;
        duel.winner = winner;
    }

    private static Long opponent(Duel duel, long userId) {
        return duel.players.keySet().stream().filter(id -> id != userId).findFirst().orElse(null);
    }

    private void addPlayer(Duel duel, long userId, Instant now) {
        // 방장이 대기 중이던 시간은 2인 대결에서 이탈 시간으로 세지 않는다.
        duel.players.values().forEach(player -> player.lastSeen = now);
        duel.players.put(userId, new Player(now));
        active.put(userId, duel);
    }

    private DuelView observe(Duel duel, long userId, Instant now) {
        advance(duel, now);
        duel.players.get(userId).lastSeen = now;
        return view(duel, userId, now, null);
    }

    private Duel required(UUID id, Instant now) {
        var duel = duels.get(id);
        if (duel == null || !now.isBefore(duel.expires)) {
            throw new ResponseStatusException(HttpStatus.GONE, "대결 방을 찾을 수 없어요.");
        }
        return duel;
    }

    private void removeExpired(Instant now) {
        if (now.isBefore(nextCleanup)) {
            return;
        }
        nextCleanup = now.plus(CLEANUP_INTERVAL);
        duels.values().removeIf(duel -> {
            if (now.isBefore(duel.expires)) {
                return false;
            }
            duel.players.keySet().forEach(id -> active.remove(id, duel));
            return true;
        });
    }

    private static DuelView view(Duel duel, long userId, Instant now, TapResult tap) {
        var scene = duel.scenes.get(duel.round);
        var player = duel.players.get(userId);
        var opponent = duel.players.get(opponent(duel, userId));
        var answers = duel.answers();
        var matched = duel.claims.keySet().stream().sorted().map(answers::get).toList();
        var opponentMatches = duel.claims.entrySet().stream().filter(entry -> entry.getValue() != userId)
                .map(entry -> answers.get(entry.getKey())).toList();
        boolean canShowAnswers = duel.phase == Phase.REVIEW;
        long remaining = duel.phase == Phase.PLAYING && duel.end == null
                ? SpotDifferenceService.remainingMs(now, duel.deadline) : 0;
        var board = new View(duel.id, duel.difficulty, duel.round + 1, scene.id(), scene.name(), duel.phase,
                remaining, player.total, matched, canShowAnswers ? answers : List.of(), tap, null,
                SpotDifferenceService.remainingMs(now, player.nextTap));
        var outcome = duel.end == null ? null : duel.winner == null ? Outcome.DRAW
                : duel.winner == userId ? Outcome.WIN : Outcome.LOSS;
        Long startInMs = duel.phase == Phase.WAITING && duel.startsAt != null && duel.end == null
                ? SpotDifferenceService.remainingMs(now, duel.startsAt) : null;
        return new DuelView(board, new Score(opponent != null, player.ready, startInMs,
                opponent == null ? 0 : opponent.total, opponentMatches, outcome, duel.end));
    }

    enum Command { READY, TAP, SYNC, LEAVE }
    enum End { COMPLETED, LEFT, DISCONNECTED }
    enum Outcome { WIN, LOSS, DRAW }

    record DuelAction(Command type, int round, Integer x, Integer y, UUID actionId) { }
    record Current(DuelView match) { }
    record DuelView(View board, Score duel) { }
    record Score(boolean joined, boolean ready, Long startInMs, int opponentTotal, List<Difference> opponentMatches,
                 Outcome outcome, End end) { }

    private static final class Duel {
        final UUID id = UUID.randomUUID();
        final Difficulty difficulty;
        final List<Puzzle> scenes;
        final Instant expires;
        final Map<Long, Player> players = new LinkedHashMap<>();
        final Map<Integer, Long> claims = new LinkedHashMap<>();
        Phase phase = Phase.WAITING;
        int round;
        int pointSequence;
        Instant startsAt;
        Instant deadline;
        End end;
        Long winner;

        Duel(Difficulty difficulty, List<Puzzle> scenes, Instant now) {
            this.difficulty = difficulty;
            this.scenes = scenes;
            this.expires = now.plus(SpotDifferenceService.RUN_LIFETIME);
        }

        List<Difference> answers() {
            return scenes.get(round).answers(difficulty);
        }
    }

    private static final class Player {
        final LinkedHashMap<UUID, TapResult> actions = new LinkedHashMap<>();
        Instant lastSeen;
        Instant nextTap = Instant.EPOCH;
        boolean ready;
        int total;
        int lastPoint;

        Player(Instant now) {
            this.lastSeen = now;
        }
    }
}
