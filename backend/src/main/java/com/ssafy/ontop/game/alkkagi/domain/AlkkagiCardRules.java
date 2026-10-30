package com.ssafy.ontop.game.alkkagi.domain;

import java.util.List;

/** 순서: WALL/RELOCATE/POWER_UP/GROW/SHRINK/EXTRA_SHOT/SWAP/DEFEND. RNG 시드는 별도 비공개다. */
public record AlkkagiCardRules(List<Integer> weights, boolean allowDuplicates, boolean excludeExhaustedWalls) {
    public AlkkagiCardRules {
        if (weights == null || weights.size() != 8 || weights.stream().anyMatch(w -> w == null || w < 0 || w > 1000)
                || weights.stream().noneMatch(w -> w > 0)) throw new IllegalArgumentException("INVALID_CARD_RULES");
        weights = List.copyOf(weights);
    }
    public static AlkkagiCardRules localPreview() {
        return new AlkkagiCardRules(List.of(1, 1, 1, 1, 1, 1, 1, 1), true, true);
    }
}
