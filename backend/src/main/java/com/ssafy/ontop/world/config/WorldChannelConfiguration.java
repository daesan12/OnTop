package com.ssafy.ontop.world.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
@EnableConfigurationProperties({WorldChannelProperties.class, WorldEmoteProperties.class})
public class WorldChannelConfiguration {
}
