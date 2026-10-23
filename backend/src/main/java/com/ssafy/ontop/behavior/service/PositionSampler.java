package com.ssafy.ontop.behavior.service;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * 위치 좌표를 언제 남길지 정한다. docs/behavior-log.md 3장 "위치 좌표"의 규칙이다.
 * 처음 본 위치(스폰)는 남기고, 움직이는 동안은 간격마다, 멈추면 한 번만 남긴다. 움직이기 시작하면 바로 남긴다.
 * 호출한 쪽(TableHub)의 잠금 안에서만 쓰므로 동기화하지 않는다.
 */
public final class PositionSampler {

    private final long intervalNanos;
    private final Map<String, Sampled> last = new HashMap<>();

    public PositionSampler(Duration interval) {
        if (interval.isNegative() || interval.isZero()) {
            throw new IllegalArgumentException("위치 기록 간격은 0보다 커야 합니다.");
        }
        this.intervalNanos = interval.toNanos();
    }

    public boolean shouldSample(String userId, boolean moving, long nowNanos) {
        Sampled previous = last.get(userId);
        boolean sample = previous == null
                || moving && (!previous.moving() || nowNanos - previous.atNanos() >= intervalNanos)
                || !moving && previous.moving();
        if (sample) {
            last.put(userId, new Sampled(moving, nowNanos));
        }
        return sample;
    }

    /** 채널 퇴장·연결 종료 시 호출한다. 다시 입장하면 스폰 위치부터 남긴다. */
    public void forget(String userId) {
        last.remove(userId);
    }

    private record Sampled(boolean moving, long atNanos) {
    }
}
