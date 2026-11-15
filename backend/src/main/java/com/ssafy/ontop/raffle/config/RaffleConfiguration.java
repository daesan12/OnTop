package com.ssafy.ontop.raffle.config;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.domain.RaffleSaleWindowPolicy;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import com.ssafy.ontop.raffle.service.RaffleService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.security.SecureRandom;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
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
    RaffleSaleWindowPolicy raffleSaleWindowPolicy(
            @Value("${RAFFLE_SALES_OVERRIDE_WEEK_START:}") String weekStart,
            @Value("${RAFFLE_SALES_OVERRIDE_STARTS_AT:}") String startsAt,
            @Value("${RAFFLE_SALES_OVERRIDE_ENDS_AT:}") String endsAt) {
        boolean empty = weekStart.isBlank() && startsAt.isBlank() && endsAt.isBlank();
        if (empty) {
            return RaffleSaleWindowPolicy.defaults();
        }
        if (weekStart.isBlank() || startsAt.isBlank() || endsAt.isBlank()) {
            throw new IllegalStateException("응모권 판매 기간 재정의 값 세 개를 모두 설정해야 합니다.");
        }
        return RaffleSaleWindowPolicy.override(LocalDate.parse(weekStart),
                OffsetDateTime.parse(startsAt).toInstant(), OffsetDateTime.parse(endsAt).toInstant());
    }

    @Bean
    RaffleDrawingRepository raffleDrawingRepository(JdbcTemplate jdbc) {
        return new RaffleDrawingRepository(jdbc);
    }

    @Bean
    RaffleDrawSelector raffleDrawSelector() {
        SecureRandom random = new SecureRandom();
        return new RaffleDrawSelector(random::nextInt);
    }

    @Bean
    RaffleDrawingService raffleDrawingService(RaffleRepository raffles, RaffleDrawingRepository drawings,
            AdminAccessPolicy administrators, RaffleDrawSelector selector,
            PlatformTransactionManager transactions, @Qualifier("oauthClock") Clock clock,
            @Value("${RAFFLE_DRAW_FIRST_WEEK:2026-11-02}") String firstWeek) {
        return new RaffleDrawingService(raffles, drawings, administrators, selector,
                transactions, clock, LocalDate.parse(firstWeek));
    }

    @Bean
    RaffleService raffleService(RaffleRepository raffles, WalletRepository wallets,
            WalletTransactionRepository ledger, PlatformTransactionManager transactions,
            @Qualifier("oauthClock") Clock clock, RaffleNumberGenerator numbers,
            RaffleSaleWindowPolicy saleWindows) {
        return new RaffleService(raffles, wallets, ledger, transactions, clock, numbers, saleWindows);
    }
}
