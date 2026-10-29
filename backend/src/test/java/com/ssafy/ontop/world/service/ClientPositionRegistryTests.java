package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.movement.ClientPositionValidator;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import java.time.Duration;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ClientPositionRegistryTests {
    private WorldChannelRegistry registry() {
        return new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "로컬", 3))), Duration.ofMillis(50));
    }
    @Test void local외에는_실험설정을_켤수없다() {
        for (var profiles : List.of(new String[]{"dev"}, new String[]{"prod"}, new String[]{"local", "dev"}, new String[]{})) {
            var environment = new MockEnvironment(); environment.setActiveProfiles(profiles);
            var registry = registry();
            assertThatThrownBy(() -> registry.configurePositionReports(true, environment)).isInstanceOf(IllegalArgumentException.class);
            registry.clear();
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
}
