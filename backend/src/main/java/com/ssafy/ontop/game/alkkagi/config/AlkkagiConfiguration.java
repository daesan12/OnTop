package com.ssafy.ontop.game.alkkagi.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.alkkagi.service.AlkkagiEngine;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import java.time.Clock;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** 환경별 설정에서 명시적으로 켠 알까기 엔진만 등록한다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "ontop.games.alkkagi.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class AlkkagiConfiguration {
    @Bean
    AlkkagiEngine alkkagiEngine(ObjectMapper mapper, Optional<Clock> clock,
            ApplicationEventPublisher events, GameEngineRouter router) {
        return new AlkkagiEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService alkkagiTimer(AlkkagiEngine engine) {
        var timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("alkkagi-physics").factory());
        timer.scheduleAtFixedRate(engine::tick, 0, 8_333_333, TimeUnit.NANOSECONDS);
        return timer;
    }
}
