package com.ssafy.ontop.world.fitness;

import java.time.Instant;

/** 서버가 완료를 확인한 탑승 구간만 전달한다. 같은 leaseId/구간의 재시도는 한 번만 지급한다. */
public interface FitnessRewardStore {
    void grant(long userId, String leaseId, long interval, Instant now);

    long earnedToday(long userId, Instant now);
}
