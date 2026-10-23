package com.ssafy.ontop.api;

import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class OpenApiSecurityConfiguration {

    @Bean
    @Order(-1)
    SecurityFilterChain openApiChain(HttpSecurity http, Environment environment,
            RestSecurityErrorHandler errors) throws Exception {
        boolean enabled = environment.acceptsProfiles(Profiles.of("(local | dev) & !prod & !production"))
                && environment.getProperty("springdoc.api-docs.enabled", Boolean.class, false);
        http.securityMatcher("/swagger-ui.html", "/swagger-ui/**", "/webjars/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**",
                        "/v3/api-docs.yaml")
                .csrf(csrf -> csrf.disable()).cors(cors -> cors.disable()).requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable()).httpBasic(basic -> basic.disable()).logout(logout -> logout.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .authorizeHttpRequests(authorize -> {
                    if (enabled) {
                        authorize.anyRequest().permitAll();
                    } else {
                        authorize.anyRequest().denyAll();
                    }
                });
        return http.build();
    }
}
