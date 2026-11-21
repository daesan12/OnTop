package com.ssafy.ontop.game.rummikub.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Collections;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.rummikub.enabled", havingValue = "true", matchIfMissing = true)
@Import(GameEngineGateways.class)
public class RummikubConfiguration {
    @Bean
    RummikubEngine rummikubEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new RummikubEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                tiles -> Collections.shuffle(tiles, random), random::nextInt);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService rummikubTimer(RummikubEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("rummikub-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
