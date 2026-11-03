package com.ssafy.ontop.game.plusminus.config;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.plusminus.domain.PlusMinusRound;
import com.ssafy.ontop.game.plusminus.repository.PlusMinusRepository;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
import jakarta.persistence.EntityManager;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@EntityScan(basePackageClasses = PlusMinusRound.class)
public class PlusMinusConfiguration {
    @Bean
    PlusMinusService plusMinusService(EntityManager entities, PlatformTransactionManager manager) {
        return new PlusMinusService(new PlusMinusRepository(entities), manager, Clock.systemUTC(), new SecureRandom());
    }
}
