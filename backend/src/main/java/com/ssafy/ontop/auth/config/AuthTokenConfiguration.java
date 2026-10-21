package com.ssafy.ontop.auth.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthTokenProperties.class)
public class AuthTokenConfiguration {
}
