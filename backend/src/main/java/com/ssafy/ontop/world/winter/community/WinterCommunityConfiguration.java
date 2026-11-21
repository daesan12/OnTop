package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
public class WinterCommunityConfiguration {
    @Bean
    WinterCommunityService winterCommunityService(ObjectProvider<WinterCommunityStore> stores, TableHub hub) {
        return new WinterCommunityService(stores::getIfAvailable, new HubWinterWorld(hub), Clock.systemUTC(), System::nanoTime);
    }
}
