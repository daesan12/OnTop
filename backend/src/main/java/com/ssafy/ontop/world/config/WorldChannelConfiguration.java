package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.map.WorldMapRuntime;
import java.io.IOException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties({WorldChannelProperties.class, WorldEmoteProperties.class,
        WorldProximityProperties.class, WorldMapProperties.class})
public class WorldChannelConfiguration {
    @Bean
    public WorldMapRuntime worldMapRuntime(WorldMapProperties properties, WorldChannelProperties channels)
            throws IOException {
        return WorldMapRuntime.load(properties, channels);
    }
}
