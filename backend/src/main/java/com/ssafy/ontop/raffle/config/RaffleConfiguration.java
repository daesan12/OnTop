package com.ssafy.ontop.raffle.config;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.raffle.enabled", havingValue = "true")
public class RaffleConfiguration {
    @Bean
    RaffleRepository raffleRepository(JdbcTemplate jdbc) {
        return new RaffleRepository(jdbc);
    }

    @Bean
    RaffleNumberGenerator raffleNumberGenerator() {
        return new RaffleNumberGenerator();
    }

    @Bean
    RaffleService raffleService(RaffleRepository raffles, WalletRepository wallets,
            WalletTransactionRepository ledger, PlatformTransactionManager transactions,
            @Qualifier("oauthClock") Clock clock, RaffleNumberGenerator numbers) {
        return new RaffleService(raffles, wallets, ledger, transactions, clock, numbers);
    }
}
