package com.ssafy.ontop.behavior.domain;

import java.time.Instant;
import java.util.Objects;

/** 서버 물리 계산이 확정한 광장 위치 한 점. 클라이언트 입력값이 아니다. */
public record PositionSample(Long userId, String channelId, Instant sampledAt, double x, double y, double z,
        boolean moving, boolean running, boolean swimming, String mapVersion) implements BehaviorRecord {

    private static final int MAX_ID_LENGTH = 64;

    public PositionSample {
        Objects.requireNonNull(channelId, "channelId");
        Objects.requireNonNull(sampledAt, "sampledAt");
        Objects.requireNonNull(mapVersion, "mapVersion");
        if (channelId.length() > MAX_ID_LENGTH || mapVersion.length() > MAX_ID_LENGTH) {
            throw new IllegalArgumentException("channelId·mapVersion은 64자를 넘을 수 없습니다.");
        }
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new IllegalArgumentException("좌표는 유한한 숫자여야 합니다.");
        }
    }
}
