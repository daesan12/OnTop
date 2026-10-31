package com.ssafy.ontop.game.alkkagi.domain;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.random.RandomGenerator;

/** 서버 확정 손실 이정표마다 비공개 후보를 만든다. 선택/만료도 같은 경기 소유자가 처리한다. */
final class AlkkagiCardAwards {
    private final int[] processed = new int[2];
    private final Offer[] offers = new Offer[2];
    private final List<ArrayDeque<Integer>> queues = List.of(new ArrayDeque<>(), new ArrayDeque<>());
    private final List<List<Attempt>> attempts = List.of(new ArrayList<>(), new ArrayList<>());
    private final RandomGenerator random;
    private final AlkkagiCardRules rules;
    private long lastResolvedAt;

    AlkkagiCardAwards(RandomGenerator random) { this(random, AlkkagiCardRules.localPreview()); }
    AlkkagiCardAwards(RandomGenerator random, AlkkagiCardRules rules) { this.random = random; this.rules = rules; }

    void resolve(int remaining0, int remaining1, int walls0, int walls1, AlkkagiInventory inventory, long now) {
        int[] remaining = {remaining0, remaining1}, walls = {walls0, walls1};
        for (int actor = 0; actor < 2; actor++) {
            while (processed[actor] < (16 - remaining[actor]) / 3) queues.get(actor).addLast(++processed[actor] * 3);
            openNext(actor, walls[actor], inventory, now);
        }
    }

    private void openNext(int actor, int walls, AlkkagiInventory inventory, long now) {
        while (offers[actor] == null && !queues.get(actor).isEmpty()) {
            int loss = queues.get(actor).removeFirst();
            if (inventory.cards(actor).size() >= 2) { record(actor, loss, "HAND_FULL"); continue; }
            var pool = new ArrayList<>(List.of(AlkkagiInventory.Type.values()));
            if (rules.excludeExhaustedWalls() && walls >= 3) pool.remove(AlkkagiInventory.Type.WALL);
            if (!rules.allowDuplicates()) for (var held : inventory.cards(actor)) pool.remove(held.type());
            pool.removeIf(type -> rules.weights().get(type.ordinal()) == 0);
            if (pool.isEmpty()) { record(actor, loss, "NO_AVAILABLE_CARD"); continue; }
            var options = new ArrayList<Option>(); var unused = new ArrayList<>(pool);
            for (int i = 0; i < 3; i++) {
                if (unused.isEmpty()) unused.addAll(pool);
                int roll = random.nextInt(unused.stream().mapToInt(t -> rules.weights().get(t.ordinal())).sum());
                for (var type : List.copyOf(unused)) {
                    roll -= rules.weights().get(type.ordinal());
                    if (roll < 0) { options.add(new Option(UUID.randomUUID().toString(), type)); unused.remove(type); break; }
                }
            }
            offers[actor] = new Offer(UUID.randomUUID().toString(), loss, now + 10_000, List.copyOf(options));
        }
    }

    void choose(int actor, String choiceId, String optionId, long now, int walls, AlkkagiInventory inventory) {
        var offer = offers[actor];
        if (offer == null || !offer.id().equals(choiceId)) throw new IllegalArgumentException("CHOICE_NOT_ACTIVE");
        if (now >= offer.deadline()) throw new IllegalArgumentException("CHOICE_EXPIRED");
        var selected = offer.options().stream().filter(o -> o.id().equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("CHOICE_OPTION_INVALID"));
        complete(actor, selected, now, walls, inventory);
    }

    boolean expire(long now, int walls0, int walls1, AlkkagiInventory inventory) {
        boolean changed = false; int[] walls = {walls0, walls1};
        for (int actor = 0; actor < 2; actor++) {
            while (offers[actor] != null && now >= offers[actor].deadline()) {
                var offer = offers[actor];
                complete(actor, offer.options().get(random.nextInt(offer.options().size())), offer.deadline(), walls[actor], inventory);
                changed = true;
            }
        }
        return changed;
    }

    private void complete(int actor, Option selected, long at, int walls, AlkkagiInventory inventory) {
        var offer = offers[actor]; inventory.grant(actor, selected.type());
        record(actor, offer.losses(), "AWARDED"); offers[actor] = null;
        lastResolvedAt = Math.max(lastResolvedAt, at);
        openNext(actor, walls, inventory, at);
    }

    void clear() { offers[0] = null; offers[1] = null; queues.forEach(ArrayDeque::clear); }
    boolean hasPending() { return offers[0] != null || offers[1] != null; }
    Offer offer(int actor) { return offers[actor]; }
    long lastResolvedAt() { return lastResolvedAt; }
    private void record(int actor, int losses, String result) { attempts.get(actor).add(new Attempt(losses, result)); }
    List<Attempt> view(int actor) { return List.copyOf(attempts.get(actor)); }
    record Attempt(int losses, String result) { }
    record Option(String id, AlkkagiInventory.Type type) { }
    record Offer(String id, int losses, long deadline, List<Option> options) { }
}
