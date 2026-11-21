package com.ssafy.ontop.game.davinci.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
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
@ConditionalOnProperty(name = "ontop.games.davinci.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class DavinciConfiguration {
    @Bean
    DavinciEngine davinciEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new DavinciEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                tiles -> Collections.shuffle(tiles, random));
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService davinciTimer(DavinciEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("davinci-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 250, 250, TimeUnit.MILLISECONDS);
        return timer;
    }
}
