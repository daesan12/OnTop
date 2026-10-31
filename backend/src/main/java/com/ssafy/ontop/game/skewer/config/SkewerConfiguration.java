package com.ssafy.ontop.game.skewer.config;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.skewer.service.SkewerAdmissionService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class SkewerConfiguration {
    @Bean
    SkewerAdmissionService skewerAdmissionService(WalletRepository wallets, WalletTransactionRepository ledger,
            PlatformTransactionManager manager) {
        return new SkewerAdmissionService(wallets, ledger, manager, Clock.systemUTC());
    }
}
