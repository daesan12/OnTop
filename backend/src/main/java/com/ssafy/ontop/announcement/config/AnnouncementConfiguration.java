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
    com.ssafy.ontop.announcement.repository.EntryNewsRepository entryNewsRepository(EntityManager entities) {
        return new com.ssafy.ontop.announcement.repository.EntryNewsRepository(entities);
    }
    @Bean
    com.ssafy.ontop.announcement.service.EntryNewsService entryNewsService(
            com.ssafy.ontop.announcement.repository.EntryNewsRepository repository, @Qualifier("oauthClock") Clock clock,
            com.ssafy.ontop.announcement.service.EntryNewsStorage storage) {
        return new com.ssafy.ontop.announcement.service.EntryNewsService(repository, clock, storage);
    }
    @Bean(destroyMethod="close")
    com.ssafy.ontop.announcement.service.EntryNewsStorage entryNewsStorage(
            @org.springframework.beans.factory.annotation.Value("${ENTRY_NEWS_ASSET_BUCKET:${SKIN_ASSET_BUCKET:}}") String bucket,
            @org.springframework.beans.factory.annotation.Value("${ENTRY_NEWS_ASSET_REGION:${SKIN_ASSET_REGION:ap-northeast-2}}") String region,
            @org.springframework.beans.factory.annotation.Value("${ENTRY_NEWS_ASSET_CDN_BASE_URL:${SKIN_ASSET_CDN_BASE_URL:}}") String cdn,
            org.springframework.core.env.Environment runtime) {
        var profiles=java.util.Set.of(runtime.getActiveProfiles());
        String env=profiles.contains("prod")||profiles.contains("production")?"prod":profiles.contains("dev")?"dev":"local";
        return new com.ssafy.ontop.announcement.service.EntryNewsStorage(bucket, region, cdn, env);
    }
    @Bean
    AnnouncementRepository announcementRepository(EntityManager entities) { return new AnnouncementRepository(entities); }

    @Bean
    AnnouncementService announcementService(AnnouncementRepository repository, @Qualifier("oauthClock") Clock clock) {
        return new AnnouncementService(repository, clock);
    }
}
