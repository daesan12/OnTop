package com.ssafy.ontop.game.omok.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import java.time.Clock;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("local")
@ConditionalOnProperty(name = "ontop.games.omok.enabled", havingValue = "true")
public class OmokConfiguration {
    @Bean
    OmokEngine omokEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events) {
        return new OmokEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService omokTimer(OmokEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("omok-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
