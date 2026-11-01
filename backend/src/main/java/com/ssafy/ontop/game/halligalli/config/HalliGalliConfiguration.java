package com.ssafy.ontop.game.halligalli.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Collections;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

// 게임 등록 전까지는 플래그를 켜지 않으므로 빈이 만들어지지 않는다. 결과 연출 시간만 설정으로 바꿀 수 있다.
@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.halligalli.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class HalliGalliConfiguration {
    @Bean
    HalliGalliEngine halliGalliEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router, @Value("${ontop.games.halligalli.result-pause-ms:1000}") long resultPauseMs) {
        SecureRandom random = new SecureRandom();
        HalliGalliTiming timing = new HalliGalliTiming(HalliGalliTiming.DEFAULT.turnLimit(),
                Duration.ofMillis(resultPauseMs));
        return new HalliGalliEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                cards -> Collections.shuffle(cards, random), random, timing);
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService halliGalliTimer(HalliGalliEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("halligalli-turn-timer").factory());
        timer.scheduleWithFixedDelay(engine::tick, 200, 200, TimeUnit.MILLISECONDS);
        return timer;
    }
}
