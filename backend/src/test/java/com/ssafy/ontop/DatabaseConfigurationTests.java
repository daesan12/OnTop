package com.ssafy.ontop;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseConfigurationTests {

    @ParameterizedTest
    @ValueSource(strings = {"default", "local", "test"})
    void DB_프로필이_없으면_외부_DB없이_시작한다(String profile) {
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=" + profile)
                .withUserConfiguration(TestApplication.class)
                .run(context -> assertThat(context).hasNotFailed()
                        .doesNotHaveBean(DataSource.class)
                        .doesNotHaveBean(EntityManagerFactory.class)
                        .doesNotHaveBean(Flyway.class));
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    static class TestApplication {
    }
}
