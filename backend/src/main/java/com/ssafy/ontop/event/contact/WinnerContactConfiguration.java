package com.ssafy.ontop.event.contact;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.time.Clock;
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
@ConditionalOnProperty(name = "ontop.event.contact.enabled", havingValue = "true")
public class WinnerContactConfiguration {
    @Bean
    WinnerContactRepository winnerContactRepository(JdbcTemplate jdbc) {
        return new WinnerContactRepository(jdbc);
    }

    @Bean
    WinnerContactCrypto winnerContactCrypto(
            @Value("${ontop.event.contact.active-key-id}") String activeKeyId,
            @Value("${ontop.event.contact.keys}") String keys) {
        return new WinnerContactCrypto(activeKeyId, keys);
    }

    @Bean
    WinnerContactService winnerContactService(WinnerContactRepository repository,
            WinnerContactCrypto crypto, AdminAccessPolicy administrators,
            PlatformTransactionManager manager, @Qualifier("oauthClock") Clock clock) {
        return new WinnerContactService(repository, crypto, administrators, manager, clock);
    }

    @Bean
    WinnerContactCleanup winnerContactCleanup(WinnerContactService service) {
        return new WinnerContactCleanup(service);
    }
}
