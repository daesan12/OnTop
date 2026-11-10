package com.ssafy.ontop.feedback.config;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.feedback.service.FeedbackLifecycle;
import com.ssafy.ontop.feedback.service.FeedbackService;
import com.ssafy.ontop.notification.domain.PersonalNotification;
import com.ssafy.ontop.notification.repository.NotificationRepository;
import com.ssafy.ontop.notification.repository.EventWinnerNotificationRepository;
import com.ssafy.ontop.notification.service.NotificationService;
import com.ssafy.ontop.notification.repository.NotificationRewardRepository;
import com.ssafy.ontop.notification.service.NotificationRewardService;
import com.ssafy.ontop.table.service.TableHub;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@Profile("db")
@ConditionalOnProperty(name = "ontop.feedback.enabled", havingValue = "true")
@EnableConfigurationProperties(FeedbackProperties.class)
@EntityScan(basePackageClasses = {FeedbackMessage.class,
        PersonalNotification.class})
public class FeedbackConfiguration {
    @Bean
    FeedbackRepository feedbackRepository(EntityManager entities) {
        return new FeedbackRepository(entities);
    }

    @Bean
    FeedbackService feedbackService(FeedbackRepository repository, PlatformTransactionManager manager,
            TableHub hub, FeedbackProperties properties,
            NotificationRepository notifications) {
        var service = new FeedbackService(repository, manager, hub, properties, Clock.systemUTC());
        service.configureReplies(notifications);
        return service;
    }

    @Bean
    NotificationRepository notificationRepository(EntityManager entities) {
        return new NotificationRepository(entities);
    }

    @Bean
    EventWinnerNotificationRepository eventWinnerNotificationRepository(JdbcTemplate jdbc) {
        return new EventWinnerNotificationRepository(jdbc);
    }

    @Bean
    NotificationRewardRepository notificationRewardRepository(EntityManager entities) {
        return new NotificationRewardRepository(entities);
    }

    @Bean
    NotificationRewardService notificationRewardService(NotificationRewardRepository repository,
            AdminAccessPolicy administrators, PlatformTransactionManager manager, ApplicationEventPublisher events) {
        return new NotificationRewardService(repository, administrators, manager, events, Clock.systemUTC());
    }

    @Bean
    NotificationService notificationService(FeedbackRepository repository,
            NotificationRepository notifications,
            EventWinnerNotificationRepository eventWinners,
            AdminAccessPolicy administrators, PlatformTransactionManager manager,
            ApplicationEventPublisher events) {
        return new NotificationService(repository, notifications, eventWinners,
                administrators, manager, events, Clock.systemUTC());
    }

    @Bean
    FeedbackLifecycle feedbackLifecycle(FeedbackRepository repository, FeedbackService service) {
        return new FeedbackLifecycle(repository, service);
    }
}
