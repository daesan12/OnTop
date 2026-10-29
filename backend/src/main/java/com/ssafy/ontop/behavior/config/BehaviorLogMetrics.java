package com.ssafy.ontop.behavior.config;

import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.BufferedBehaviorLog;
import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.stereotype.Component;

/** 분석할 때 유실 구간을 알 수 있도록 저장·버림 건수를 노출한다. 기록이 꺼져 있으면 등록하지 않는다. */
@Component
public class BehaviorLogMetrics implements MeterBinder {

    private final BehaviorLog behaviorLog;

    public BehaviorLogMetrics(BehaviorLog behaviorLog) {
        this.behaviorLog = behaviorLog;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        if (!(behaviorLog instanceof BufferedBehaviorLog buffered)) {
            return;
        }
        Gauge.builder("ontop.behavior.queued", buffered, BufferedBehaviorLog::queued)
                .description("Behavior log records waiting in memory to be written")
                .register(registry);
        FunctionCounter.builder("ontop.behavior.written", buffered, BufferedBehaviorLog::written)
                .description("Behavior log records written to the database")
                .register(registry);
        for (DropReason reason : DropReason.values()) {
            FunctionCounter.builder("ontop.behavior.dropped", buffered, value -> value.dropped(reason))
                    .tag("reason", reason.name())
                    .description("Behavior log records discarded without being written")
                    .register(registry);
        }
    }
}
