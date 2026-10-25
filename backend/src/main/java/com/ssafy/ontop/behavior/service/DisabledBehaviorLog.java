package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.util.function.Supplier;

/** ontop.behavior-log.enabled=false일 때 쓰는 기록기. Supplier를 실행하지 않아 비용이 없다. */
enum DisabledBehaviorLog implements BehaviorLog {
    INSTANCE;

    @Override
    public void record(Supplier<BehaviorEvent> event) {
    }

    @Override
    public void recordPosition(Supplier<PositionSample> sample) {
    }
}
