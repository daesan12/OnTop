package com.ssafy.ontop.minigame.config;

import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.VerifiedMinigameResultSource;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@Profile("local & db")
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@EntityScan(basePackageClasses = {MinigameSession.class, Wallet.class})
public class MinigameConfiguration {
    @Bean
    MinigameService minigameService(MinigameRepository repository, PlatformTransactionManager manager,
            ObjectProvider<VerifiedMinigameResultSource> results) {
        return new MinigameService(repository, manager, results, Clock.systemUTC());
    }
}
