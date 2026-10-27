package com.ssafy.ontop.world.service;

import java.time.Clock;
import org.springframework.stereotype.Component;

/** 낮밤은 접속 시점이나 JVM 시작 시점이 아닌 고정 KST 기준을 사용한다. */
@Component
public final class WorldClock {
    private final Clock clock;

    public WorldClock() { this(Clock.systemUTC()); }
    public WorldClock(Clock clock) { this.clock = java.util.Objects.requireNonNull(clock); }

    public Sample sample() {
        return new Sample(clock.millis(), 1_767_193_200_000L, 1_800_000L, "Asia/Seoul");
    }

    public record Sample(long serverNow, long cycleEpochMs, long cycleDurationMs, String timeZone) {}
}
