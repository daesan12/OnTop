package com.ssafy.ontop.feedback.config;

import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.feedback.service.FeedbackLifecycle;
import com.ssafy.ontop.feedback.service.FeedbackService;
import com.ssafy.ontop.table.service.TableHub;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile("db")
@ConditionalOnProperty(name = "ontop.feedback.enabled", havingValue = "true")
@EnableConfigurationProperties(FeedbackProperties.class)
@EntityScan(basePackageClasses = FeedbackMessage.class)
public class FeedbackConfiguration {
    @Bean
    FeedbackRepository feedbackRepository(EntityManager entities) {
        return new FeedbackRepository(entities);
    }

    @Bean
    FeedbackService feedbackService(FeedbackRepository repository, PlatformTransactionManager manager,
            TableHub hub, FeedbackProperties properties) {
        return new FeedbackService(repository, manager, hub, properties, Clock.systemUTC());
    }

    @Bean
    FeedbackLifecycle feedbackLifecycle(FeedbackRepository repository, FeedbackService service) {
        return new FeedbackLifecycle(repository, service);
    }
}
