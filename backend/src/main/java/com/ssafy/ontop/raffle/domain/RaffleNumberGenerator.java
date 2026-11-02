package com.ssafy.ontop.raffle.domain;

import java.security.SecureRandom;
import java.util.Set;

public class RaffleNumberGenerator {
    public static final int MINIMUM_NUMBER = 1;
    public static final int MAXIMUM_NUMBER = 10_000;
    private final SecureRandom random;

    public RaffleNumberGenerator() {
        this(new SecureRandom());
    }

    RaffleNumberGenerator(SecureRandom random) {
        this.random = random;
    }

    public int unusedNumber(Set<Integer> usedNumbers) {
        if (usedNumbers.size() >= MAXIMUM_NUMBER) {
            return 0;
        }
        int start = random.nextInt(MINIMUM_NUMBER, MAXIMUM_NUMBER + 1);
        for (int offset = 0; offset < MAXIMUM_NUMBER; offset++) {
            int candidate = (start - MINIMUM_NUMBER + offset) % MAXIMUM_NUMBER + MINIMUM_NUMBER;
            if (!usedNumbers.contains(candidate)) {
                return candidate;
            }
        }
        return 0;
    }
}
