package com.ssafy.ontop.admin.walletgrant.config;

import com.ssafy.ontop.admin.walletgrant.repository.AdminWalletGrantRepository;
import com.ssafy.ontop.admin.walletgrant.service.AdminWalletGrantService;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class AdminWalletGrantConfiguration {
    @Bean
    AdminWalletGrantRepository adminWalletGrantRepository(JdbcTemplate jdbc) {
        return new AdminWalletGrantRepository(jdbc);
    }

    @Bean
    AdminWalletGrantService adminWalletGrantService(UserRepository users, WalletRepository wallets,
            WalletTransactionRepository ledger, AdminWalletGrantRepository grants,
            PlatformTransactionManager transactions, @Qualifier("oauthClock") Clock clock) {
        return new AdminWalletGrantService(users, wallets, ledger, grants, transactions, clock);
    }
}
