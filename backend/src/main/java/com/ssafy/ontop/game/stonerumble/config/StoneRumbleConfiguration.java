package com.ssafy.ontop.game.stonerumble.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.stonerumble.service.StoneRumbleEngine;
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

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "ontop.games.stone-rumble.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class StoneRumbleConfiguration {
    @Bean
    StoneRumbleEngine stoneRumbleEngine(ObjectMapper mapper, Optional<Clock> clock,
            ApplicationEventPublisher events, GameEngineRouter router) {
        return new StoneRumbleEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService stoneRumbleTimer(StoneRumbleEngine engine) {
        var timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("stone-rumble-physics").factory());
        timer.scheduleAtFixedRate(engine::tick, 0, 20, TimeUnit.MILLISECONDS);
        return timer;
    }
}
