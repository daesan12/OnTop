package com.ssafy.ontop.game.rpsroulette.config;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound;
import com.ssafy.ontop.game.rpsroulette.repository.RpsRouletteRepository;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteService;
import jakarta.persistence.EntityManager;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@EntityScan(basePackageClasses = RpsRouletteRound.class)
public class RpsRouletteConfiguration {
    @Bean
    RpsRouletteService rpsRouletteService(EntityManager entities, PlatformTransactionManager manager) {
        return new RpsRouletteService(new RpsRouletteRepository(entities), manager, Clock.systemUTC(),
                new SecureRandom());
    }

    /** 이탈한 회원의 판도 마감 시각에 맞춰 자동 손·자동 멈춤으로 끝낸다. */
    @Bean(destroyMethod = "shutdownNow")
    ScheduledExecutorService rpsRouletteSweeper(RpsRouletteService service) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("rps-roulette-sweeper").factory());
        timer.scheduleWithFixedDelay(service::sweep, 1, 1, TimeUnit.SECONDS);
        return timer;
    }
}
