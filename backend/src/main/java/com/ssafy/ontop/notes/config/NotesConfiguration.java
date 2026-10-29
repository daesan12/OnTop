package com.ssafy.ontop.notes.config;

import com.ssafy.ontop.notes.domain.AnonymousNote;
import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.notes.service.NotesService;
import com.ssafy.ontop.table.service.TableHub;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.notes.enabled", havingValue = "true")
@EnableConfigurationProperties(NotesProperties.class)
@EntityScan(basePackageClasses = AnonymousNote.class)
public class NotesConfiguration {
    @Bean
    NotesRepository notesRepository(EntityManager entities) {
        return new NotesRepository(entities);
    }

    @Bean
    NotesService notesService(NotesRepository repository, PlatformTransactionManager manager,
            TableHub hub, NotesProperties properties) {
        return new NotesService(repository, manager, hub, properties, Clock.systemUTC());
    }

}
