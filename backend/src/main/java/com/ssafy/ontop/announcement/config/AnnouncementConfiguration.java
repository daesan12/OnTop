package com.ssafy.ontop.announcement.config;

import com.ssafy.ontop.announcement.domain.Announcement;
import com.ssafy.ontop.announcement.repository.AnnouncementRepository;
import com.ssafy.ontop.announcement.service.AnnouncementService;
import com.ssafy.ontop.config.RuntimeProfiles;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@EntityScan(basePackageClasses = Announcement.class)
public class AnnouncementConfiguration {
    @Bean
    AnnouncementRepository announcementRepository(EntityManager entities) { return new AnnouncementRepository(entities); }

    @Bean
    AnnouncementService announcementService(AnnouncementRepository repository, @Qualifier("oauthClock") Clock clock) {
        return new AnnouncementService(repository, clock);
    }
}
