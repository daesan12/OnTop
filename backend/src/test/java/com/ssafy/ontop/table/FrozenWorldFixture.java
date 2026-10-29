package com.ssafy.ontop.table;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Distance-only tests inject trusted server poses and freeze simulation time, not a client teleport API. */
@TestConfiguration(proxyBeanMethods = false)
class FrozenWorldFixture {
    @Bean @Primary
    WorldChannelRegistry frozenWorld(WorldChannelProperties properties) {
        var clock = new java.util.concurrent.atomic.AtomicLong();
        return new WorldChannelRegistry(properties, Duration.ofNanos(1), clock::incrementAndGet);
    }
}
