package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MovementPredictionContractTests {
    @Test void 의자활성화_안전이동의_새좌표와_예측세대를_즉시함께전달한다() {
        AtomicLong time = new AtomicLong();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "one", 2))), Duration.ofMillis(50), time::get);
        try {
            registry.join("a", "one");
            var pose = new com.ssafy.ontop.world.service.WorldFacilityService.Pose(2.61, 2.9, 6, 0);
            registry.holdFacility("a", pose); registry.releaseFacility("a", pose);
            time.set(34_000_000); registry.advance(Set.of());
            var before = registry.worldState("one").avatars().getFirst();
            registry.tables("one", List.of(new WorldChannelRegistry.PublicTable("table", "table-5", 4)));
            var after = registry.worldState("one").avatars().getFirst();
            assertThat(after.motion().epoch()).isGreaterThan(before.motion().epoch());
            assertThat(Math.hypot(after.position().x() - before.position().x(), after.position().z() - before.position().z())).isGreaterThan(.1);
        } finally { registry.clear(); }
    }
    @Test void 받은순번과_실제좌표계산순번을_구분하고_위치변경시예측세대를바꾼다() {
        try (var physics = new WorldPhysics()) {
            physics.add("a");
            var initial = physics.snapshot("a");
            physics.input("a", new MoveInput(1, 1, 0, false, false), 1_000_000);
            var received = physics.snapshot("a");
            assertThat(received.lastInputSeq()).isEqualTo(1);
            assertThat(received.motion().appliedInputSeq()).isZero();
            assertThat(received.x()).isEqualTo(initial.x());
            physics.step(34_000_000, Set.of());
            var applied = physics.snapshot("a");
            assertThat(applied.motion().appliedInputSeq()).isEqualTo(1);
            assertThat(applied.motion().tick()).isPositive();
            assertThat(applied.motion().inputAgeMs()).isEqualTo(33);
            physics.input("a", new MoveInput(2, -1, 0, false, false), 35_000_000);
            assertThat(physics.snapshot("a").motion()).isEqualTo(applied.motion());
            physics.place("a", 0, 1, 34);
            assertThat(physics.snapshot("a").motion().epoch()).isGreaterThan(applied.motion().epoch());
            assertThat(physics.snapshot("a").motion().inputActive()).isFalse();
        }
    }
    @Test void 묶여도착한_네입력은허용하지만_평균한도와_고정물리시간은유지한다() {
        AtomicLong time = new AtomicLong();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "one", 2))), Duration.ofMillis(50), time::get);
        try {
            registry.join("a", "one");
            double x = registry.worldState("one").avatars().getFirst().position().x();
            for (int seq = 1; seq <= 4; seq++) registry.input("a", new MoveInput(seq, 1, 0, true, false));
            assertThat(registry.worldState("one").avatars().getFirst().position().x()).isEqualTo(x);
            assertThatThrownBy(() -> registry.input("a", new MoveInput(5, 1, 0, true, false)))
                    .isInstanceOf(WorldChannelRegistry.ChannelException.class).hasMessageContaining("간격");
            assertThat(registry.worldState("one").avatars().getFirst().position().lastInputSeq()).isEqualTo(4);
            assertThat(registry.input("a", new MoveInput(4, -1, 0, true, false)).changed()).isFalse();
            time.set(49_999_999);
            assertThatThrownBy(() -> registry.input("a", new MoveInput(5, 1, 0, true, false)))
                    .isInstanceOf(WorldChannelRegistry.ChannelException.class);
            time.set(50_000_000);
            registry.input("a", new MoveInput(5, 1, 0, true, false));
            registry.advance(Set.of());
            var moved = registry.worldState("one").avatars().getFirst();
            assertThat(moved.position().x() - x).isBetween(.20, .31);
            assertThat(moved.motion().appliedInputSeq()).isEqualTo(5);
            registry.leave("a"); registry.join("a", "one");
            assertThat(registry.input("a", new MoveInput(1, 0, 0, false, false)).changed()).isTrue();
        } finally { registry.clear(); }
    }
}
