package com.ssafy.ontop.demo;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 테스트 클래스패스·loopback·전용 MySQL에서만 실행한다. 운영 JAR 제외. */
public final class ShopDemoApplication {
    public static void main(String[] args) {
        String url = System.getenv("DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_demo[A-Za-z0-9_]*(?:\\?.*)?")) {
            throw new IllegalStateException("상점 시연은 전용 loopback 테스트 DB가 필요합니다.");
        }
        new SpringApplication(OntopApplication.class, Fixture.class).run(
                "--spring.profiles.active=local,db,shop-demo", "--server.address=127.0.0.1", "--server.port=18083",
                "--ontop.shop.enabled=true", "--ontop.shop.duplicate-equipment-policy=REJECT",
                "--spring.flyway.locations=classpath:db/migration,classpath:db/shop-fixture,classpath:db/shop",
                "--ontop.auth.allowed-origins=http://127.0.0.1:18083");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("shop-demo")
    public static class Fixture {
        @Bean
        ApplicationRunner shopSeed(JdbcTemplate jdbc) {
            return args -> {
                jdbc.update("""
                        INSERT IGNORE INTO users(id, login_provider, provider_user_id, nickname, character_gender,
                            created_at, updated_at)
                        VALUES (101, 'NAVER', 'shop-demo-101', 'shopdemo', 'MALE',
                            CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                        """);
                jdbc.update("INSERT IGNORE INTO wallets(user_id, balance, reserved_balance) VALUES (101, 100, 0)");
                jdbc.update("""
                        INSERT IGNORE INTO items(id, item_code, name, item_type, equip_slot, price, image_key, is_for_sale)
                        VALUES (1, 'RED_TOP', '빨간 상의', 'EQUIPMENT', 'TOP', 10, 'demo-red-top', TRUE),
                            (2, 'BLUE_TOP', '파란 상의', 'EQUIPMENT', 'TOP', 20, 'demo-blue-top', TRUE),
                            (3, 'SNACK', '검증용 간식', 'CONSUMABLE', NULL, 5, 'demo-snack', TRUE)
                        """);
            };
        }
    }

    @RestController
    @Profile("shop-demo")
    public static class Controller {
        private final AccessJwtService jwt;
        private final AuthExchangeOriginPolicy origins;

        public Controller(AccessJwtService jwt, AuthExchangeOriginPolicy origins) {
            this.jwt = jwt;
            this.origins = origins;
        }

        @GetMapping(value = "/dev/shop", produces = "text/html")
        Resource page() { return new ClassPathResource("shop-demo/index.html"); }

        @GetMapping("/dev/shop/config")
        ResponseEntity<?> config(HttpServletRequest request) {
            origins.allowedOrigin(request);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(Map.of("accessToken", jwt.issue(101)));
        }
    }
}

