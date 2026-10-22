package com.ssafy.ontop.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.DispatcherType;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RestSecurityConfiguration {

    @Bean
    @Order(1)
    SecurityFilterChain separateAuthenticationChain(HttpSecurity http, RestSecurityErrorHandler errors)
            throws Exception {
        http.securityMatchers(matchers -> matchers.requestMatchers(
                        "/api/v1/auth/*/authorize", "/api/v1/auth/*/callback", "/api/v1/auth/exchange",
                        "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/users/onboarding",
                        "/actuator/health", "/actuator/health/**", "/ws/tables",
                        "/dev/tables", "/dev/world-config")
                .requestMatchers(request -> request.getDispatcherType() == DispatcherType.ERROR));
        common(http, errors);
        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.NEVER))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                // 기존 WebSocket 테스트/서버 필터가 설정한 Servlet Principal을 덮어쓰지 않는다.
                .servletApi(api -> api.disable())
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain protectedRestChain(HttpSecurity http, AccessJwtDecoder decoder,
            AccessAuthenticationService authentication, AuthExchangeOriginPolicy origins, ObjectMapper mapper,
            RestSecurityErrorHandler errors) throws Exception {
        common(http, errors);
        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                .addFilterBefore(new RestCorsFilter(origins, mapper, errors), BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(authorize -> authorize.requestMatchers("/actuator/**").denyAll()
                        .anyRequest().hasRole("MEMBER"))
                .oauth2ResourceServer(resource -> resource.bearerTokenResolver(new StrictBearerTokenResolver())
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors)
                        .jwt(jwt -> jwt.decoder(decoder).jwtAuthenticationConverter(verified ->
                                UsernamePasswordAuthenticationToken.authenticated(
                                        authentication.requireActive(Long.parseLong(verified.getSubject())), null,
                                        List.of(new SimpleGrantedAuthority("ROLE_MEMBER"))))));
        return http.build();
    }

    @Bean
    WebSecurityCustomizer requestRejection(RestSecurityErrorHandler errors) {
        return web -> web.requestRejectedHandler((request, response, exception) -> {
            var error = RestAuthenticationException.Error.REQUEST_REJECTED;
            errors.write(response, error.status(), error.code(), error.message());
        });
    }

    private void common(HttpSecurity http, RestSecurityErrorHandler errors) throws Exception {
        // Bearer REST는 쿠키 인증을 받지 않는다. 별도 인증 POST는 기존 Origin/코드 검증을 그대로 수행한다.
        http.csrf(csrf -> csrf.disable()).cors(cors -> cors.disable()).requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(errors)
                        .accessDeniedHandler(errors));
    }
}
