package com.ssafy.ontop.world.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties({WorldChannelProperties.class, WorldEmoteProperties.class,
        WorldProximityProperties.class})
public class WorldChannelConfiguration {
}
