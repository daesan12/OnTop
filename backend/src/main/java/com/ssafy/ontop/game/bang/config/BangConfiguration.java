package com.ssafy.ontop.game.bang.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.bang.service.BangEngine;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Import(GameEngineGateways.class)
public class BangConfiguration {
    @Bean
    BangEngine bangEngine(ObjectMapper mapper, ApplicationEventPublisher events, GameEngineRouter router) {
        return new BangEngine(mapper, Clock.systemUTC(), events::publishEvent, router, new SecureRandom());
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService bangTimer(BangEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("bang-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
