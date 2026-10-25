package com.ssafy.ontop.game.farkle.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
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
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("(local | dev) & !prod & !production")
@ConditionalOnProperty(name = "ontop.games.farkle.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class FarkleConfiguration {
    @Bean
    FarkleEngine farkleEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new FarkleEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                () -> random.nextInt(6) + 1, () -> random.nextInt(2));
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService farkleTimer(FarkleEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("farkle-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
