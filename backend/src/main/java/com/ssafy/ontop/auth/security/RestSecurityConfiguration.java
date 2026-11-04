package com.ssafy.ontop.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.DispatcherType;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RestSecurityConfiguration {

    @Bean
    @Order(0)
    SecurityFilterChain nicknameAvailabilityChain(HttpSecurity http, AuthExchangeOriginPolicy origins,
            ObjectMapper mapper, RestSecurityErrorHandler errors) throws Exception {
        http.securityMatcher("/api/v1/users/nickname-availability");
        common(http, errors);
        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                .addFilterBefore(new RestCorsFilter(origins, mapper, errors), BearerTokenAuthenticationFilter.class)
                // 이 경로만 두 종류의 Bearer를 서비스에서 필수 검증한다. 온보딩을 ROLE_MEMBER로 승격하지 않는다.
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    @Order(1)
    SecurityFilterChain separateAuthenticationChain(HttpSecurity http, RestSecurityErrorHandler errors)
            throws Exception {
        http.securityMatchers(matchers -> matchers.requestMatchers(
                        "/api/v1/auth/*/authorize", "/api/v1/auth/*/callback", "/api/v1/auth/exchange",
                        "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/users/onboarding",
                        "/api/v1/operations/status",
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
            RestSecurityErrorHandler errors, AdminAccessPolicy adminAccess) throws Exception {
        common(http, errors);
        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
                .addFilterBefore(new RestCorsFilter(origins, mapper, errors), BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(authorize -> authorize.requestMatchers("/actuator/**").denyAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/me", "/api/v1/admin/feedback",
                                "/api/v1/admin/analytics/**").hasRole("ADMIN_READ")
                        .requestMatchers("/api/v1/admin/wallet-grants", "/api/v1/admin/wallet-grants/**")
                                .hasRole("ADMIN_GRANT")
                        .requestMatchers("/api/v1/admin/operations", "/api/v1/admin/operations/**")
                                .hasRole("ADMIN_OPERATION")
                        .requestMatchers("/api/v1/admin/**").denyAll()
                        .anyRequest().hasRole("MEMBER"))
                .oauth2ResourceServer(resource -> resource.bearerTokenResolver(new StrictBearerTokenResolver())
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors)
                        .jwt(jwt -> jwt.decoder(decoder).jwtAuthenticationConverter(verified -> {
                            AuthenticatedUser user = authentication.requireActive(
                                    Long.parseLong(verified.getSubject()), verified.getClaimAsString("sid"));
                            List<GrantedAuthority> authorities = new ArrayList<>();
                            authorities.add(new SimpleGrantedAuthority("ROLE_MEMBER"));
                            if (adminAccess.canRead(user.userId())) {
                                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN_READ"));
                            }
                            if (adminAccess.canGrant(user.userId())) {
                                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN_GRANT"));
                            }
                            if (adminAccess.canOperate(user.userId())) {
                                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN_OPERATION"));
                            }
                            var result = UsernamePasswordAuthenticationToken.authenticated(user, null,
                                    authorities);
                            // 접속권은 이 요청에서 검증된 회원/만료 정보를 재사용한다. 원문 JWT는 보관하지 않는다.
                            result.setDetails(new AccessAuthenticationService.AuthenticatedAccess(
                                    user, verified.getExpiresAt()));
                            return result;
                        })));
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
