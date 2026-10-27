package com.ssafy.ontop.admin.security;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AdminAccessProperties.class)
public class AdminAccessConfiguration {
    @Bean
    AdminAccessPolicy adminAccessPolicy(AdminAccessProperties properties) {
        return new AdminAccessPolicy(properties);
    }
}
