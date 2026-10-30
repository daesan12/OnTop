package com.ssafy.ontop.game.alkkagi.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.random.RandomGenerator;

/** 물리 안정화 후 확정 손실 수만 받는다. 동일 이정표는 다시 추첨하지 않는다. */
final class AlkkagiCardAwards {
    private final int[] processed = new int[2];
    private final List<List<Attempt>> attempts = List.of(new ArrayList<>(), new ArrayList<>());
    private final RandomGenerator random;
    private final AlkkagiCardRules rules;

    AlkkagiCardAwards(RandomGenerator random) { this(random, AlkkagiCardRules.localPreview()); }
    AlkkagiCardAwards(RandomGenerator random, AlkkagiCardRules rules) { this.random = random; this.rules = rules; }

    void resolve(int remaining0, int remaining1, int walls0, int walls1, AlkkagiInventory inventory) {
        int[] remaining = {remaining0, remaining1}, walls = {walls0, walls1};
        for (int actor = 0; actor < 2; actor++) {
            int milestones = (16 - remaining[actor]) / 3;
            while (processed[actor] < milestones) {
                int loss = ++processed[actor] * 3;
                if (remaining[actor] >= remaining[1 - actor]) { record(actor, loss, "NOT_BEHIND"); continue; }
                if (inventory.cards(actor).size() >= 2) { record(actor, loss, "HAND_FULL"); continue; }
                var candidates = new ArrayList<>(List.of(AlkkagiInventory.Type.values()));
                if (rules.excludeExhaustedWalls() && walls[actor] >= 3) candidates.remove(AlkkagiInventory.Type.WALL);
                if (!rules.allowDuplicates()) for (var held : inventory.cards(actor)) candidates.remove(held.type());
                candidates.removeIf(type -> rules.weights().get(type.ordinal()) == 0);
                int total = candidates.stream().mapToInt(type -> rules.weights().get(type.ordinal())).sum();
                if (total == 0) { record(actor, loss, "NO_AVAILABLE_CARD"); continue; }
                int roll = random.nextInt(total);
                for (var type : candidates) {
                    roll -= rules.weights().get(type.ordinal());
                    if (roll < 0) { inventory.grant(actor, type); break; }
                }
                record(actor, loss, "AWARDED");
            }
        }
    }

    private void record(int actor, int losses, String result) { attempts.get(actor).add(new Attempt(losses, result)); }
    List<Attempt> view(int actor) { return List.copyOf(attempts.get(actor)); }
    record Attempt(int losses, String result) { }
}
