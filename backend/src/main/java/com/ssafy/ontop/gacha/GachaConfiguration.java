package com.ssafy.ontop.gacha;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name="ontop.gacha.enabled",havingValue="true")
public class GachaConfiguration {
    @Bean GachaRepository gachaRepository(JdbcTemplate jdbc) { return new GachaRepository(jdbc); }
    @Bean GachaService gachaService(GachaRepository repository,WalletRepository wallets,WalletTransactionRepository ledger,
            EntityManager entities,PlatformTransactionManager manager,ObjectMapper json,@Qualifier("oauthClock") Clock clock,
            @Value("${ontop.shop.enabled:false}") boolean shop) {
        if(!shop) throw new IllegalStateException("의상 뽑기는 상점/옷장 스키마와 SHOP_ENABLED=true가 필요합니다.");
        SecureRandom random=new SecureRandom();
        return new GachaService(repository,wallets,ledger,entities,manager,json,clock,random::nextInt);
    }
    @Bean
    @ConditionalOnProperty(name="ontop.gacha.broadcast-enabled",havingValue="true",matchIfMissing=true)
    GachaOutbox gachaOutbox(GachaRepository repository,PlatformTransactionManager manager,ObjectMapper json,
            ObjectProvider<TableHub> hubs,@Value("${ontop.gacha.node-id:server-1}") String node) {
        return new GachaOutbox(repository,manager,json,node,event->{
            TableHub hub=hubs.getIfAvailable();
            if(hub!=null) hub.publishGacha(event);
        });
    }
}
