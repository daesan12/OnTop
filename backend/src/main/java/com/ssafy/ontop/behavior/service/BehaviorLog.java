package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.util.function.Supplier;

/**
 * 행동 로그 기록 진입점. 호출한 쪽은 결과를 기다리지 않으며 어떤 예외도 받지 않는다.
 * 기록할 값은 Supplier 안에서 만든다. 꺼져 있으면 Supplier를 실행하지 않고, 만드는 중 오류가 나도 호출한 쪽은 계속 진행한다.
 */
public interface BehaviorLog extends AutoCloseable {

    void record(Supplier<BehaviorEvent> event);

    void recordPosition(Supplier<PositionSample> sample);

    /** 남은 기록을 정리한다. 기록이 꺼져 있으면 아무 일도 하지 않는다. */
    @Override
    default void close() {
    }

    static BehaviorLog disabled() {
        return DisabledBehaviorLog.INSTANCE;
    }
}
