package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.movement.ClientPositionValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import java.time.Duration;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ClientPositionRegistryTests {
    private WorldChannelRegistry registry() {
        return new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "로컬", 3))), Duration.ofMillis(50));
    }
    @Test void DB없는운영과_혼합및_지정되지않은_프로필은_좌표보고를_켤수없다() {
        for (var profiles : List.of(new String[]{"prod"}, new String[]{"production"},
                new String[]{"local", "prod", "db"}, new String[]{"dev", "prod", "db"},
                new String[]{"dev", "production", "db"}, new String[]{})) {
            var environment = new MockEnvironment(); environment.setActiveProfiles(profiles);
            var registry = registry();
            assertThatThrownBy(() -> registry.configurePositionReports(true, environment)).isInstanceOf(IllegalArgumentException.class);
            registry.clear();
        }
    }
    @ParameterizedTest
    @ValueSource(strings = {"dev,db", "prod,db", "production,db"})
    void 개발과_운영DB는_같은_검증이동과_물리프로필로_기동하고_입장한다(String profiles) {
        new org.springframework.boot.test.context.runner.WebApplicationContextRunner()
                .withInitializer(new org.springframework.boot.test.context.ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=" + profiles)
                .withBean(WorldChannelRegistry.class, this::registry)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var environment = context.getEnvironment();
                    assertThat(environment.getProperty("ontop.world.movement.client-position", Boolean.class, false)).isTrue();
                    assertThat(environment.getProperty("ontop.world.movement.tuned-profile", Boolean.class, false)).isTrue();
                    var registry = context.getBean(WorldChannelRegistry.class);
                    try {
                        registry.join("a", "one");
                        var motion = registry.worldState("one").avatars().getFirst().motion();
                        assertThat(motion.authority()).isEqualTo("CLIENT_VALIDATED");
                        assertThat(motion.profile()).isEqualTo("PARK_V1");
                    } finally { registry.clear(); }
                });
    }
    @Test void DB없는운영과_혼합프로필은_개선이동을_자동활성화하지_않는다() {
        for (String profiles : List.of("prod", "production", "dev,production,db", "dev,prod,db", "prod,dev,db", "local,prod,db")) {
            new org.springframework.boot.test.context.runner.WebApplicationContextRunner()
                    .withInitializer(new org.springframework.boot.test.context.ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.profiles.active=" + profiles)
                    .run(context -> {
                        assertThat(context).hasNotFailed();
                        var environment = context.getEnvironment();
                        assertThat(environment.getProperty("ontop.world.movement.client-position", Boolean.class, false)).isFalse();
                        assertThat(environment.getProperty("ontop.world.movement.tuned-profile", Boolean.class, false)).isFalse();
                        var registry = registry();
                        registry.configurePositionReports(false, environment);
                        try {
                            registry.join("a", "one");
                            assertThat(registry.worldState("one").avatars().getFirst().motion().authority()).isNull();
                        } finally { registry.clear(); }
                    });
        }
    }
    @Test void 기본비활성_위치보고는_캐시에_반영되지않는다() {
        var registry = registry();
        try {
            registry.join("a", "one"); var old = registry.positionOf("a");
            assertThatThrownBy(() -> registry.reportPosition("a", new ClientPositionValidator.Candidate(1, 0,
                    new ClientPositionValidator.Pose(100, 1, 100), true, false)))
                    .isInstanceOf(WorldChannelRegistry.ChannelException.class);
            assertThat(registry.positionOf("a")).isEqualTo(old);
        } finally { registry.clear(); }
    }
    @Test void 미니게임활동은_보고기한을_소비하지않고_종료후_새세대로_복귀한다() {
        var clock = new java.util.concurrent.atomic.AtomicLong();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "로컬", 3))), Duration.ofMillis(50), clock::get);
        var environment = new MockEnvironment(); environment.setActiveProfiles("local");
        registry.configurePositionReports(true, environment);
        try {
            registry.join("a", "one");
            registry.minigameActivity("a", 123, Duration.ofSeconds(1));
            clock.set(600_000_000); registry.advance(java.util.Set.of());
            assertThat(registry.worldState("one").avatars().getFirst().motion().authority()).isNull();
            clock.set(2_000_000_000L); registry.advance(java.util.Set.of());
            for (int i = 0; i < 10; i++) { clock.addAndGet(34_000_000); registry.advance(java.util.Set.of()); }
            assertThat(registry.worldState("one").avatars().getFirst().motion().authority()).isEqualTo("CLIENT_VALIDATED");
        } finally { registry.clear(); }
    }
    @ParameterizedTest
    @ValueSource(strings = {"prod,db", "production,db"})
    void 운영에서_명시적으로_두설정을_끄면_기존방향입력을_유지한다(String profiles) {
        new org.springframework.boot.test.context.runner.WebApplicationContextRunner()
                .withInitializer(new org.springframework.boot.test.context.ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=" + profiles,
                        "ontop.world.movement.client-position=false", "ontop.world.movement.tuned-profile=false")
                .withBean(WorldChannelRegistry.class, this::registry)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var registry = context.getBean(WorldChannelRegistry.class);
                    try {
                        registry.join("a", "one");
                        var motion = registry.worldState("one").avatars().getFirst().motion();
                        assertThat(motion.authority()).isNull();
                        assertThat(motion.profile()).isNull();
                    } finally { registry.clear(); }
                });
    }
    @Test void 조정프로필은_DB없는운영과_혼합프로필에서_켤수없다() {
        for(var profiles:List.of(new String[]{"prod"},new String[]{"production"},new String[]{"dev","prod","db"},new String[]{})){
            var env=new MockEnvironment();env.setActiveProfiles(profiles);var registry=registry();
            try{assertThatThrownBy(()->registry.configureTunedMovement(true,env)).isInstanceOf(IllegalArgumentException.class);}finally{registry.clear();}
        }
    }
}
