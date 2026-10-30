package com.ssafy.ontop.game.onecard.service;

import com.ssafy.ontop.game.onecard.domain.OneCardMatch.Snapshot;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiPredicate;

/** 일회성 표현 상태만 보관한다. 호출자는 Hub→OneCardEngine 잠금 순서를 유지한다. */
public final class OneCardPranks {
    public static final long REACH_MS = 3200;
    public static final long BLOCK_MS = 3000;
    public static final long IMMUNE_MS = 2500;
    private static final long RETAIN_MS = 120_000;
    private final Map<String, Round> rounds = new HashMap<>();

    public record Notice(String type, Map<String, Object> payload) { }
    public record Reply(Notice acknowledgement, List<Notice> notices) { }
    private record Pair(long actor, long target) { }
    private record Key(long user, String event) { }
    private record Receipt(String fingerprint, Notice notice) { }
    private record Attempt(String id, String event, Pair pair, long turn, long resolveAt, Integer cardIndex, Long handVersion) { }
    private record Effect(String id, long target, long turn, long expiresAt) { }
    private static final class Round {
        long turn = -1;
        long touched;
        final Set<Pair> used = new HashSet<>();
        final Map<String, Attempt> pending = new LinkedHashMap<>();
        final Map<Long, Effect> effects = new HashMap<>();
        final Map<Pair, Long> blocked = new HashMap<>();
        final Map<Long, Long> immune = new HashMap<>();
        final Map<Key, Receipt> receipts = new LinkedHashMap<>();
        final Map<Long, ArrayDeque<Long>> rates = new HashMap<>();
    }

    public Set<String> games() { return Set.copyOf(rounds.keySet()); }
    public void clear() { rounds.clear(); }

    public Reply reach(Snapshot state, long actor, String event, long target, long turn, long now, boolean immediate) {
        return reach(state, actor, event, target, turn, now, immediate, null, null);
    }

    public Reply reach(Snapshot state, long actor, String event, long target, long turn, long now, boolean immediate,
                       Integer cardIndex, Long handVersion) {
        require(state != null, "GAME_NOT_PLAYING");
        Round round = round(state, now);
        String fingerprint = (immediate ? "FLIP:" : "REACH:") + target + ":" + turn + ":" + cardIndex + ":" + handVersion;
        Notice old = previous(round, actor, event, fingerprint, now);
        if (old != null) { return new Reply(old, List.of()); }
        require(playing(state, now), "GAME_NOT_PLAYING");
        require(state.turnCount() == turn && state.turnUserId() != null && state.turnUserId() == target,
                "STALE_TURN");
        require(!state.players().contains(actor) && state.players().contains(target), "ACCESS_DENIED");
        require((cardIndex == null) == (handVersion == null), "INVALID_CARD");
        require(cardIndex == null || handVersion == state.version() && cardIndex >= 0 && cardIndex < publicCount(state, target), "STALE_HAND");
        Pair pair = new Pair(actor, target);
        require(round.blocked.getOrDefault(pair, 0L) <= now, "BLOCKED");
        require(!round.used.contains(pair), "ALREADY_USED");
        require(!round.effects.containsKey(target), "EFFECT_ACTIVE");
        require(round.immune.getOrDefault(target, 0L) <= now, "IMMUNE");
        require(round.pending.size() < 4 && round.pending.values().stream().noneMatch(a -> a.pair.actor == actor),
                "TOO_MANY_ATTEMPTS");
        // 최대 4개 대기 시도와 활성 효과의 방어·복구 영수증 공간은 남겨 둔다.
        require(round.receipts.size() < 2000, "TOO_FREQUENT");
        rate(round, actor, now);
        round.used.add(pair);
        Notice notice;
        if (immediate) {
            round.effects.put(target, new Effect(event, target, turn, now + 30_000));
            notice = flipped(state, event, target, turn, now, cardIndex, handVersion);
        } else {
            var attempt = new Attempt(UUID.randomUUID().toString(), event, pair, turn, now + REACH_MS, cardIndex, handVersion);
            round.pending.put(attempt.id, attempt);
            var payload = attemptPayload(state.gameId(), event, attempt, now);
            payload.put("resolveAt", attempt.resolveAt);
            notice = new Notice("ONECARD_PRANK_REACH_STARTED", Map.copyOf(payload));
        }
        remember(round, actor, event, fingerprint, notice);
        return new Reply(notice, List.of(notice));
    }

    public Reply hit(Snapshot state, long user, String event, String attemptId, long now) {
        require(state != null, "ACCESS_DENIED");
        Round round = round(state, now);
        String fingerprint = "HIT:" + attemptId;
        Notice old = previous(round, user, event, fingerprint, now);
        if (old != null) { return new Reply(old, List.of()); }
        Attempt attempt = round.pending.get(attemptId);
        require(attempt != null && attempt.pair.target == user, "TOO_LATE");
        require(playing(state, now) && state.turnCount() == attempt.turn && now < attempt.resolveAt, "TOO_LATE");
        require(round.receipts.size() < 2048, "TOO_FREQUENT");
        rate(round, user, now);
        round.pending.remove(attemptId);
        round.blocked.put(attempt.pair, now + BLOCK_MS);
        var payload = attemptPayload(state.gameId(), event, attempt, now);
        payload.put("blockedUntil", now + BLOCK_MS);
        Notice blocked = new Notice("ONECARD_PRANK_BLOCKED", Map.copyOf(payload));
        remember(round, user, event, fingerprint, blocked);
        return new Reply(blocked, List.of(blocked, resolved(state.gameId(), attempt, now, "BLOCKED")));
    }

    public Reply restore(Snapshot state, long user, String event, String effectId, long now) {
        require(state != null, "ACCESS_DENIED");
        Round round = round(state, now);
        String fingerprint = "RESTORE:" + effectId;
        Notice old = previous(round, user, event, fingerprint, now);
        if (old != null) { return new Reply(old, List.of()); }
        Effect effect = round.effects.get(user);
        require(effect != null && effect.id.equals(effectId), "ACCESS_DENIED");
        require(round.receipts.size() < 2048, "TOO_FREQUENT");
        rate(round, user, now);
        round.effects.remove(user);
        round.immune.put(user, now + IMMUNE_MS);
        Notice notice = restored(state.gameId(), event, effect, now, now + IMMUNE_MS);
        remember(round, user, event, fingerprint, notice);
        return new Reply(notice, List.of(notice));
    }

    /** 매번 실제 권한과 현재 턴을 검사한다. 클라이언트 창/타이머에 최종 판정을 맡기지 않는다. */
    public List<Notice> advance(String gameId, Snapshot state, long now, BiPredicate<Long, Long> authorized) {
        Round round = rounds.get(gameId);
        if (round == null) { return List.of(); }
        var notices = new ArrayList<Notice>();
        for (Attempt attempt : new ArrayList<>(round.pending.values())) {
            boolean valid = playing(state, now) && state.turnCount() == attempt.turn
                    && state.turnUserId() != null && state.turnUserId() == attempt.pair.target
                    && (attempt.cardIndex == null || state.version() == attempt.handVersion && attempt.cardIndex < publicCount(state, attempt.pair.target))
                    && authorized.test(attempt.pair.actor, attempt.pair.target);
            if (!valid || now >= attempt.resolveAt) {
                round.pending.remove(attempt.id);
                boolean flip = valid && !round.effects.containsKey(attempt.pair.target)
                        && round.immune.getOrDefault(attempt.pair.target, 0L) <= now;
                if (flip) {
                    round.effects.put(attempt.pair.target,
                            new Effect(attempt.event, attempt.pair.target, attempt.turn, now + 30_000));
                    notices.add(flipped(state, attempt.event, attempt.pair.target, attempt.turn, now, attempt.cardIndex, attempt.handVersion));
                }
                notices.add(resolved(gameId, attempt, now, flip ? "FLIPPED" : "CANCELLED"));
            }
        }
        for (Effect effect : new ArrayList<>(round.effects.values())) {
            if (!playing(state, now) || effect.turn != state.turnCount() || now >= effect.expiresAt
                    || !authorized.test(0L, effect.target)) {
                round.effects.remove(effect.target);
                long immuneUntil = now + IMMUNE_MS;
                round.immune.put(effect.target, immuneUntil);
                notices.add(restored(gameId, UUID.randomUUID().toString(), effect, now, immuneUntil));
            }
        }
        round.blocked.values().removeIf(until -> until <= now);
        round.immune.values().removeIf(until -> until <= now);
        round.rates.values().removeIf(times -> times.isEmpty() || times.getLast() <= now - 1000);
        if (state != null && round.turn != state.turnCount()) { round.turn = state.turnCount(); round.used.clear(); }
        if (round.pending.isEmpty() && round.effects.isEmpty() && now - round.touched >= RETAIN_MS) {
            rounds.remove(gameId);
        }
        return List.copyOf(notices);
    }

    private Round round(Snapshot state, long now) {
        require(rounds.containsKey(state.gameId()) || playing(state, now), "GAME_NOT_PLAYING");
        Round round = rounds.computeIfAbsent(state.gameId(), ignored -> new Round());
        if (round.turn != state.turnCount()) { round.turn = state.turnCount(); round.used.clear(); }
        round.touched = now;
        return round;
    }

    private static void rate(Round round, long user, long now) {
        var times = round.rates.computeIfAbsent(user, ignored -> new ArrayDeque<>());
        while (!times.isEmpty() && times.getFirst() <= now - 1000) { times.removeFirst(); }
        require(times.size() < 5, "TOO_FREQUENT");
        times.addLast(now);
    }

    private static boolean playing(Snapshot state, long now) {
        return state != null && state.endedAt() == null && "PLAYING".equals(state.stage())
                && state.turnDeadline() != null && now < state.turnDeadline().toEpochMilli();
    }

    private static Notice previous(Round round, long user, String event, String fingerprint, long now) {
        Receipt old = round.receipts.get(new Key(user, event));
        if (old == null) { return null; }
        require(old.fingerprint.equals(fingerprint), "EVENT_CONFLICT");
        // 마감/차단 시각은 고정하고 서버 현재 시각만 갱신해 재확인으로 연출 시간이 늘지 않게 한다.
        var payload = new HashMap<>(old.notice.payload);
        payload.put("serverNow", now);
        return new Notice(old.notice.type, Map.copyOf(payload));
    }

    private static void remember(Round round, long user, String event, String fingerprint, Notice notice) {
        round.receipts.put(new Key(user, event), new Receipt(fingerprint, notice));
    }

    private static int publicCount(Snapshot state, long target) {
        return state.publicPlayers().stream().filter(p -> p.userId() == target).mapToInt(p -> p.cardCount()).findFirst().orElse(0);
    }

    private static Notice flipped(Snapshot state, String event, long target, long turn, long now, Integer cardIndex, Long handVersion) {
        int count = cardIndex == null ? Math.min(2, publicCount(state, target)) : 1;
        require(count > 0, "GAME_NOT_PLAYING");
        var payload = new HashMap<String, Object>(Map.of("gameId", state.gameId(), "eventId", event,
                "targetUserId", Long.toString(target), "turnCount", turn, "count", count, "serverNow", now));
        if (cardIndex != null) { payload.put("cardIndex", cardIndex); payload.put("handVersion", handVersion); }
        return new Notice("ONECARD_HAND_FLIPPED", Map.copyOf(payload));
    }

    private static Map<String, Object> attemptPayload(String game, String event, Attempt attempt, long now) {
        var payload = new HashMap<String, Object>();
        payload.put("gameId", game); payload.put("eventId", event); payload.put("attemptId", attempt.id);
        payload.put("actorUserId", Long.toString(attempt.pair.actor));
        payload.put("targetUserId", Long.toString(attempt.pair.target));
        payload.put("turnCount", attempt.turn); payload.put("serverNow", now);
        if (attempt.cardIndex != null) { payload.put("cardIndex", attempt.cardIndex); payload.put("handVersion", attempt.handVersion); }
        return payload;
    }

    private static Notice resolved(String game, Attempt attempt, long now, String outcome) {
        var payload = attemptPayload(game, UUID.randomUUID().toString(), attempt, now);
        payload.put("outcome", outcome);
        return new Notice("ONECARD_PRANK_REACH_RESOLVED", Map.copyOf(payload));
    }

    private static Notice restored(String game, String event, Effect effect, long now, long immuneUntil) {
        return new Notice("ONECARD_HAND_RESTORED", Map.of("gameId", game, "eventId", event,
                "effectId", effect.id, "targetUserId", Long.toString(effect.target), "turnCount", effect.turn,
                "immuneUntil", immuneUntil, "serverNow", now));
    }

    private static void require(boolean valid, String code) { if (!valid) { throw new Rejected(code); } }
    public static final class Rejected extends RuntimeException {
        private final String code;
        Rejected(String code) { super("원카드 장난 요청을 처리할 수 없습니다."); this.code = "ONECARD_PRANK_" + code; }
        public String code() { return code; }
    }
}
