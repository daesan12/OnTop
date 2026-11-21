package com.ssafy.ontop.game.chess.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.chess.service.ChessEngine;
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
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.chess.enabled", havingValue = "true", matchIfMissing = true)
@Import(GameEngineGateways.class)
public class ChessConfiguration {
    @Bean
    ChessEngine chessEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        return new ChessEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService chessTimer(ChessEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("chess-clock").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
