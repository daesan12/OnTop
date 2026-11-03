package com.ssafy.ontop.game.skewer.coop.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.SecureRandom;
import java.time.Clock;
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
@ConditionalOnProperty(name = "ontop.games.skewer-coop.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class SkewerCoopConfiguration {
    @Bean
    SkewerCoopEngine skewerCoopEngine(ObjectMapper mapper, GameEngineRouter router,
            ApplicationEventPublisher events, GameReconnectService recovery, WorldChannelRegistry channels,
            SkewerCoopSettlementService settlements) {
        return new SkewerCoopEngine(mapper, Clock.systemUTC(), router, events::publishEvent,
                recovery::startResolved, (user, channel) -> channel.equals(channels.channelOf(Long.toString(user))),
                new SecureRandom(), 240, settlements::finished);
    }

    @Bean(destroyMethod = "close")
    AutoCloseable skewerCoopTimer(SkewerCoopEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("skewer-coop-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 100, 100, TimeUnit.MILLISECONDS);
        return () -> timer.shutdownNow();
    }

    @Bean(destroyMethod = "close")
    AutoCloseable skewerCoopSettlementTimer(SkewerCoopSettlementService settlements) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("skewer-coop-settlement").factory());
        timer.scheduleWithFixedDelay(settlements::retry, 1, 2, TimeUnit.SECONDS);
        return () -> timer.shutdownNow();
    }
}
