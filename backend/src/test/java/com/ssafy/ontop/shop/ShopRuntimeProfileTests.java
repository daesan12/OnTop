package com.ssafy.ontop.shop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.shop.config.ShopConfiguration;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.shop.service.ShopService;
import com.ssafy.ontop.shop.service.ShopWorldAppearanceGateway;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ShopRuntimeProfileTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(AccessJwtService.class, () -> mock(AccessJwtService.class))
            .withBean(AuthExchangeOriginPolicy.class, () -> mock(AuthExchangeOriginPolicy.class))
            .withBean(EntityManager.class, () -> mock(EntityManager.class))
            .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
            .withBean(BehaviorLog.class, BehaviorLog::disabled)
            .withUserConfiguration(ShopController.class, ShopAccessFilter.class, ShopConfiguration.class,
                    ShopRepository.class, ShopWorldAppearanceGateway.class);

    @Test
    void 기본dev는_HTTP만등록하고_DB구매를_켜지않는다() {
        runner.withPropertyValues("spring.profiles.active=dev").run(context -> assertThat(context)
                .hasNotFailed().hasSingleBean(ShopController.class).hasSingleBean(ShopAccessFilter.class)
                .doesNotHaveBean(ShopService.class).doesNotHaveBean(ShopRepository.class)
                .doesNotHaveBean(ShopWorldAppearanceGateway.class));
    }

    @Test
    void dev환경변수와_db프로필을_함께켜야_구매와외형을_등록한다() {
        runner.withPropertyValues("spring.profiles.active=dev,db", "SHOP_ENABLED=true",
                "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused")
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(ShopService.class)
                        .hasSingleBean(ShopRepository.class).hasSingleBean(ShopWorldAppearanceGateway.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod", "production"})
    void 운영DB와_상점활성화로_구매와외형을_등록한다(String profile) {
        runner.withPropertyValues("spring.profiles.active=" + profile + ",db", "ontop.shop.enabled=true",
                "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused")
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(ShopController.class)
                        .hasSingleBean(ShopAccessFilter.class).hasSingleBean(ShopService.class)
                        .hasSingleBean(ShopRepository.class).hasSingleBean(ShopWorldAppearanceGateway.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev,prod", "dev,production", "local,prod", "local,production"})
    void 운영프로필을_개발프로필과_섞으면_상점전체를_등록하지않는다(String profiles) {
        runner.withPropertyValues("spring.profiles.active=" + profiles + ",db", "ontop.shop.enabled=true",
                "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(ShopController.class)
                        .doesNotHaveBean(ShopAccessFilter.class).doesNotHaveBean(ShopService.class)
                        .doesNotHaveBean(ShopRepository.class).doesNotHaveBean(ShopWorldAppearanceGateway.class));
    }
}
