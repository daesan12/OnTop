package com.ssafy.ontop.game.davinci.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Collections;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(DavinciConfiguration.class);

    @Bean
    DavinciEngine davinciEngine(ObjectMapper mapper, Optional<Clock> clock, ApplicationEventPublisher events,
            GameEngineRouter router) {
        SecureRandom random = new SecureRandom();
        return new DavinciEngine(mapper, clock.orElseGet(Clock::systemUTC), events::publishEvent, router,
                tiles -> Collections.shuffle(tiles, random));
    }

    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService davinciTimer(DavinciEngine engine, Optional<WorldChannelRegistry> world) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("davinci-turn-timer").factory());
        timer.scheduleWithFixedDelay(() -> {
            try {
                engine.tick();
                // 엔진 잠금에서 빠져나온 공개 복사본만 월드에 전달한다.
                var views = engine.tablePresentations();
                world.ifPresent(channels -> channels.secretTilePresentations(views));
            } catch (RuntimeException exception) {
                // 고정 지연 작업 밖으로 예외가 나가면 이후 실행이 모두 취소된다.
                log.error("흑백수사 타이머 처리 실패. 다음 주기에 다시 실행합니다.", exception);
            }
        }, 0, 250, TimeUnit.MILLISECONDS);
        return timer;
    }
}
