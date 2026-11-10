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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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

/** Optional environment-bound metrics configuration. Authentication and game behavior are not modified. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Profile({"observe-dev", "observe-prod"})
public class ObservabilityConfiguration {
    public ObservabilityConfiguration(Environment environment) {
        boolean observeDev = environment.acceptsProfiles(Profiles.of("observe-dev"));
        boolean observeProd = environment.acceptsProfiles(Profiles.of("observe-prod"));
        if (observeDev == observeProd) {
            throw new IllegalStateException("exactly one observability profile is required");
        }

        if (observeDev && (!environment.acceptsProfiles(Profiles.of("dev"))
                || environment.acceptsProfiles(Profiles.of("local", "prod", "production")))) {
            throw new IllegalStateException("observe-dev requires DEV and rejects local/production");
        }

        if (observeProd && (!environment.acceptsProfiles(Profiles.of("prod", "production"))
                || environment.acceptsProfiles(Profiles.of("local", "dev")))) {
            throw new IllegalStateException("observe-prod requires production and rejects local/DEV");
        }
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain prometheusSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/actuator/prometheus", "/actuator/health")
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().access((authentication, context) ->
                        new org.springframework.security.authorization.AuthorizationDecision(
                                context.getRequest().getLocalPort() == 8082)))
                .build();
    }

    @Bean
    @ConditionalOnProperty(name = "ontop.observability.jpa-statistics-enabled", havingValue = "true")
    MeterBinder jpaMetrics(ObjectProvider<EntityManagerFactory> factories) {
        return registry -> {
            EntityManagerFactory factory = factories.getIfAvailable();
            if (factory == null) {
                return;
            }
            var statistics = factory.unwrap(SessionFactory.class).getStatistics();
            FunctionCounter.builder("ontop.jpa.statements.prepared", statistics,
                    value -> value.getPrepareStatementCount())
                    .description("Prepared JDBC statements, not total DB executions")
                    .register(registry);
            FunctionCounter.builder("ontop.jpa.queries.executed", statistics,
                    value -> value.getQueryExecutionCount())
                    .description("Hibernate query executions only")
                    .register(registry);
        };
    }

    @Bean
    static BeanPostProcessor webSocketTiming() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String name) {
                if (!(bean instanceof TableWebSocketHandler)) {
                    return bean;
                }
                ProxyFactory proxy = new ProxyFactory(bean);
                proxy.setProxyTargetClass(true);
                Timer textTimer = registerHandlerTimer("text");
                Timer controlTimer = registerHandlerTimer("control");
                proxy.addAdvice((MethodInterceptor) call -> {
                    if (!call.getMethod().getName().equals("handleMessage")) {
                        return call.proceed();
                    }
                    Timer timer = call.getArguments()[1] instanceof TextMessage ? textTimer : controlTimer;
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

    private static Timer registerHandlerTimer(String kind) {
        return Timer.builder("ontop.websocket.handler.duration")
                .tag("kind", kind)
                .description("Synchronous handler; excludes queue, network and client rendering")
                .publishPercentileHistogram().minimumExpectedValue(Duration.ofNanos(10_000))
                .maximumExpectedValue(Duration.ofSeconds(5))
                .register(io.micrometer.core.instrument.Metrics.globalRegistry);
    }
}
