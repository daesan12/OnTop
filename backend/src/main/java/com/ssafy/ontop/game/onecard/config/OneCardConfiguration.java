package com.ssafy.ontop.game.onecard.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
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
@ConditionalOnProperty(name = "ontop.games.onecard.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class OneCardConfiguration {
    @Bean
    OneCardEngine onecardEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new OneCardEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                cards -> java.util.Collections.shuffle(cards, random), random::nextInt, ForfeitHandPolicy.REMOVE);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService onecardTimer(OneCardEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("onecard-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
