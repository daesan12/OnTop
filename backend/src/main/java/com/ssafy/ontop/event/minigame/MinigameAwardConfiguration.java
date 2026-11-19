package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.event.EventAwardExclusions;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.beans.factory.annotation.Value;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.event.minigame.enabled", havingValue = "true")
public class MinigameAwardConfiguration {
    @Bean
    MinigameAwardRepository minigameAwardRepository(JdbcTemplate jdbc) {
        return new MinigameAwardRepository(jdbc);
    }

    @Bean
    WeeklyMinigameRepository weeklyMinigameRepository(JdbcTemplate jdbc) {
        return new WeeklyMinigameRepository(jdbc);
    }

    @Bean
    WeeklyMinigameAwardService weeklyMinigameAwardService(WeeklyMinigameRepository configurations,
            MinigameAwardRepository records, AdminAccessPolicy administrators,
            PlatformTransactionManager transactions, @Qualifier("oauthClock") Clock clock,
            @Value("${EVENT_AWARD_EXCLUDED_USER_IDS:}") String excludedUserIds,
            @Value("${MINIGAME_AWARD_EXCLUDED_USER_IDS:}") String excludedUserIdsByGame) {
        return new WeeklyMinigameAwardService(configurations, records, administrators, transactions, clock,
                EventAwardExclusions.parse(excludedUserIds),
                EventAwardExclusions.parseByGame(excludedUserIdsByGame));
    }

    @Bean
    MinigameAwardService minigameAwardService(MinigameAwardRepository repository,
            AdminAccessPolicy administrators, PlatformTransactionManager transactions,
            @Qualifier("oauthClock") Clock clock,
            @Value("${EVENT_AWARD_EXCLUDED_USER_IDS:}") String excludedUserIds,
            @Value("${MINIGAME_AWARD_EXCLUDED_USER_IDS:}") String excludedUserIdsByGame) {
        return new MinigameAwardService(repository, administrators, transactions,
                clock, LocalDate.of(2026, 11, 2), EventAwardExclusions.parse(excludedUserIds),
                EventAwardExclusions.parseByGame(excludedUserIdsByGame));
    }

    @Bean
    @ConditionalOnProperty(name = "ontop.event.minigame.auto-enabled", havingValue = "true")
    MinigameAwardScheduler minigameAwardScheduler(MinigameAwardService awards) {
        return new MinigameAwardScheduler(awards);
    }
}
