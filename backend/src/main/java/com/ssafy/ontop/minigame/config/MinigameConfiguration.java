package com.ssafy.ontop.minigame.config;

import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@Profile("(local | dev) & db & !prod & !production")
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@EntityScan(basePackageClasses = {MinigameSession.class, Wallet.class})
public class MinigameConfiguration {
    @Bean
    MinigameService minigameService(MinigameRepository repository, PlatformTransactionManager manager,
            @Value("${ontop.minigames.starts-per-minute:10}") int startsPerMinute,
            // 통합 검증(V5-5) 전까지 기본 비활성. 켜지 않으면 v5 요청은 기존처럼 RULES_VERSION_MISMATCH다.
            @Value("${ontop.minigames.bungeoppang-v5-enabled:false}") boolean v5Enabled) {
        return new MinigameService(repository, manager, Clock.systemUTC(), startsPerMinute, v5Enabled);
    }
}
