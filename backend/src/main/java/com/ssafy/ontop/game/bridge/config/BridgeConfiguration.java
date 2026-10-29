package com.ssafy.ontop.game.bridge.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import java.security.SecureRandom;
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
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.bridge.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class BridgeConfiguration {
    @Bean
    BridgeEngine bridgeEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new BridgeEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                () -> { int face=random.nextInt(6); return face<4 ? face+1 : 0; }, random::nextInt);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService bridgeTimer(BridgeEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("bridge-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
