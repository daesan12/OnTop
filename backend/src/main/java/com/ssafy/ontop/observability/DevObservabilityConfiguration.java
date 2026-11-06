package com.ssafy.ontop.observability;

import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.persistence.EntityManagerFactory;
import java.time.Duration;
import org.aopalliance.intercept.MethodInterceptor;
import org.hibernate.SessionFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.socket.TextMessage;

/** Optional DEV-only addition. No member-authentication or game classes are modified. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Profile("observe-dev")
public class DevObservabilityConfiguration {
    public DevObservabilityConfiguration(Environment env) {
        if (!env.acceptsProfiles(Profiles.of("dev"))
                || env.acceptsProfiles(Profiles.of("local", "prod", "production"))) {
            throw new IllegalStateException("observe-dev requires DEV and rejects local/production");
        }
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain devPrometheusSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/actuator/prometheus")
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().access((authentication, context) ->
                        new org.springframework.security.authorization.AuthorizationDecision(
                                context.getRequest().getLocalPort() == 8082)))
                .build();
    }

    @Bean
    MeterBinder devJpaMetrics(ObjectProvider<EntityManagerFactory> factories) {
        return registry -> {
            EntityManagerFactory factory = factories.getIfAvailable();
            if (factory == null) {
                return;
            }
            var statistics = factory.unwrap(SessionFactory.class).getStatistics();
            FunctionCounter.builder("ontop.jpa.statements.prepared", statistics,
                    s -> s.getPrepareStatementCount()).description("Prepared JDBC statements, not total DB executions")
                    .register(registry);
            FunctionCounter.builder("ontop.jpa.queries.executed", statistics,
                    s -> s.getQueryExecutionCount()).description("Hibernate query executions only")
                    .register(registry);
        };
    }

    @Bean
    static BeanPostProcessor devWebSocketTiming() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String name) {
                if (!(bean instanceof TableWebSocketHandler)) {
                    return bean;
                }
                ProxyFactory proxy = new ProxyFactory(bean);
                proxy.setProxyTargetClass(true);
                proxy.addAdvice((MethodInterceptor) call -> {
                    if (!call.getMethod().getName().equals("handleMessage")) {
                        return call.proceed();
                    }
                    Timer timer = Timer.builder("ontop.websocket.handler.duration")
                            .tag("kind", call.getArguments()[1] instanceof TextMessage ? "text" : "control")
                            .description("Synchronous handler; excludes queue, network and client rendering")
                            .publishPercentileHistogram().minimumExpectedValue(Duration.ofNanos(10_000))
                            .maximumExpectedValue(Duration.ofSeconds(5))
                            .register(io.micrometer.core.instrument.Metrics.globalRegistry);
                    long start = System.nanoTime();
                    try {
                        return call.proceed();
                    } finally {
                        timer.record(System.nanoTime() - start, java.util.concurrent.TimeUnit.NANOSECONDS);
                    }
                });
                return proxy.getProxy();
            }
        };
    }
}
