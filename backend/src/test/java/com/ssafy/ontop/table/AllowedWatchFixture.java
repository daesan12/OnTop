package com.ssafy.ontop.table;

import com.ssafy.ontop.world.service.WorldProximity;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.doReturn;

// 기존 통신/복구 테스트에서 거리 권한만 허용하는 대역. 실제 거리는 WorldProximity*Tests에서 검사한다.
@TestConfiguration(proxyBeanMethods = false)
class AllowedWatchFixture {
    @Bean
    @Primary
    WorldProximity allowedWatch(WorldChannelRegistry channels, WorldProximityProperties properties) {
        WorldProximity proximity = spy(new WorldProximity(channels, properties));
        doReturn(true).when(proximity).canWatch(nullable(String.class), nullable(String.class), nullable(String.class));
        return proximity;
    }

    static WorldProximity allowed() {
        WorldProximity proximity = mock(WorldProximity.class);
        when(proximity.canWatch(nullable(String.class), nullable(String.class), nullable(String.class)))
                .thenReturn(true);
        return proximity;
    }
}
