package com.ssafy.ontop.world.jumpmap;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 점프맵 V131(db/minigame)이 없는 migration 위치(db/migration·db/shop)에서 플래그를 잘못 켜도 서버가 시작하고
 * 점프맵(충돌체·판정·status)만 비활성인지 실제 MySQL로 확인한다.
 */
@Tag("mysql")
@SpringBootTest(properties = {
        "spring.profiles.active=local,db", "ontop.world.jumpmap.enabled=true",
        // V165가 db/shop의 items를 참조한다. db/minigame은 V131이 없어야 하므로 넣지 않는다.
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
        "ontop.world.channels[0].capacity=20",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json"
})
class JumpmapProdLikeMySqlTests {
    @Autowired JumpmapActivation activation;
    @Autowired JumpmapService service;
    @Autowired JumpmapStore store;
    @Autowired Flyway flyway;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_JUMPMAP_PRODLIKE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_jumpmap_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_jumpmap_test_ 전용 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_JUMPMAP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_JUMPMAP_DB_PASSWORD"));
    }

    @Test
    void V131이_없는_DB에서는_서버가_시작하고_점프맵만_비활성이다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion()).doesNotContain("131");
        assertThat(store.ready()).isFalse();
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.NO_STORE);
        assertThat(activation.course()).isEmpty();
        assertThat(service.active()).isFalse();
    }
}
