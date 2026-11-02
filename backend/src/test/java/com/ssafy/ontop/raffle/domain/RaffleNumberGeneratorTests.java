package com.ssafy.ontop.raffle.domain;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RaffleNumberGeneratorTests {
    private final RaffleNumberGenerator generator = new RaffleNumberGenerator();

    @Test
    void 한_번호만_남으면_그_번호를_반환한다() {
        Set<Integer> used = IntStream.rangeClosed(1, 10_000).boxed().collect(Collectors.toCollection(HashSet::new));
        used.remove(3140);

        assertThat(generator.unusedNumber(used)).isEqualTo(3140);
    }

    @Test
    void 모든_번호를_사용하면_영을_반환한다() {
        Set<Integer> used = IntStream.rangeClosed(1, 10_000).boxed().collect(Collectors.toSet());

        assertThat(generator.unusedNumber(used)).isZero();
    }
}
