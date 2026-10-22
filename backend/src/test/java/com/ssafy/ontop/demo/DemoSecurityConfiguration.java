package com.ssafy.ontop.demo;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

/** 테스트 classpath의 데모 Fixture에서만 등록한다. 운영 JAR에는 포함되지 않는다. */
@TestConfiguration(proxyBeanMethods = false)
public class DemoSecurityConfiguration {
    @Bean
    @Order(0)
    SecurityFilterChain demoChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/dev/omok", "/dev/omok/**", "/dev/games", "/dev/games/**")
                .csrf(csrf -> csrf.disable()).requestCache(cache -> cache.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.NEVER))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll()).build();
    }
}
