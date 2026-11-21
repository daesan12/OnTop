package com.ssafy.ontop.demo;

import com.ssafy.ontop.world.winter.community.LocalWinterCommunityStore;
import com.ssafy.ontop.world.winter.community.WinterCommunityStore;
import java.nio.file.Path;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;

@TestConfiguration(proxyBeanMethods = false)
@Profile("local & stone-rumble-park & !db & !dev & !prod & !production")
@ConditionalOnProperty(name = "ontop.qa-feedback.enabled", havingValue = "true")
public class WinterCommunityParkQa {
    @Bean WinterCommunityStore winterCommunityQaStore() {
        return new LocalWinterCommunityStore(Path.of(".gradle/qa-feedback/winter-community.json"), 98);
    }
}
