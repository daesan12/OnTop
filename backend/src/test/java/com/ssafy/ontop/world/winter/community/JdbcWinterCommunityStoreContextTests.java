package com.ssafy.ontop.world.winter.community;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.aop.AopAutoConfiguration;
import org.springframework.boot.autoconfigure.dao.PersistenceExceptionTranslationAutoConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.support.PersistenceExceptionTranslator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class JdbcWinterCommunityStoreContextTests {
    @ParameterizedTest
    @ValueSource(strings = {"local,db", "dev,db", "prod,db", "production,db"})
    void DB_활성_프로필에서_겨울_저장소를_클래스_프록시로_생성한다(String profiles) {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(AopAutoConfiguration.class,
                        PersistenceExceptionTranslationAutoConfiguration.class))
                .withPropertyValues("spring.profiles.active=" + profiles, "spring.aop.proxy-target-class=true")
                .withUserConfiguration(RepositoryConfiguration.class)
                .run(context -> {
                    assertThat(context).hasNotFailed()
                            .hasSingleBean(JdbcWinterCommunityStore.class)
                            .hasSingleBean(WinterCommunityStore.class);
                    var store = context.getBean(WinterCommunityStore.class);
                    assertThat(store).isSameAs(context.getBean(JdbcWinterCommunityStore.class));
                    assertThat(AopUtils.isCglibProxy(store)).isTrue();
                });
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(JdbcWinterCommunityStore.class)
    static class RepositoryConfiguration {
        @Bean
        JdbcTemplate jdbcTemplate() {
            return mock(JdbcTemplate.class);
        }

        @Bean
        PlatformTransactionManager transactionManager() {
            return mock(PlatformTransactionManager.class);
        }

        @Bean
        PersistenceExceptionTranslator persistenceExceptionTranslator() {
            return mock(PersistenceExceptionTranslator.class);
        }
    }
}
