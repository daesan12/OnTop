package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChannelRegistry.ChannelException;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class WorldMovementTests {

    private final AtomicLong clock = new AtomicLong();
    private final WorldChannelProperties properties = new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3), new Channel("two", "둘", 3)));
    private final WorldChannelRegistry registry = new WorldChannelRegistry(properties, Duration.ofMillis(100), clock::get);

    @Test
    void 늦은_입장자에게_최신_위치를_주고_이전_스냅샷과_채널_인원_버전은_유지한다() {
        registry.join("a", "one");
        var initial = registry.worldState("one");
        assertThat(initial.avatars().getFirst().position()).isNull();
        registry.move("a", pose(7, 12));
        registry.join("b", "one");
        var current = registry.worldState("one");
        assertThat(current.avatars().getFirst().position().x()).isEqualTo(12);
        assertThat(current.avatars().get(1).position()).isNull();
        assertThat(current.version()).isEqualTo(3);
        assertThat(registry.join("b", "one").state().version()).isEqualTo(2);
        assertThat(initial.avatars()).hasSize(1);
        assertThat(initial.avatars().getFirst().position()).isNull();
        assertThatThrownBy(() -> current.avatars().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void 늦은_순번과_빠른_새_이동은_위치를_되돌리거나_순번을_소비하지_않는다() {
        registry.join("a", "one");
        var accepted = registry.move("a", pose(5, 3)).state();
        assertThat(registry.move("a", pose(4, 999)).changed()).isFalse();
        assertThat(registry.move("a", pose(5, 999)).state()).isEqualTo(accepted);
        clock.set(99_999_999);
        ChannelException error = catchThrowableOfType(ChannelException.class, () -> registry.move("a", pose(6, 4)));
        assertThat(error.code()).isEqualTo("MOVE_TOO_FREQUENT");
        assertThat(registry.worldState("one")).isEqualTo(accepted);
        clock.incrementAndGet();
        assertThat(registry.move("a", pose(6, 4)).state().avatars().getFirst().position().sequence()).isEqualTo(6);
    }

    @Test
    void 사용자별_전송_간격과_채널별_위치는_서로_영향주지_않는다() {
        registry.join("a", "one");
        registry.join("b", "one");
        registry.join("c", "two");
        registry.move("a", pose(0, 1));
        assertThat(registry.move("b", pose(0, 2)).changed()).isTrue();
        assertThat(registry.move("c", pose(0, 3)).state().avatars()).hasSize(1);
        assertThat(registry.worldState("one").avatars()).extracting(avatar -> avatar.userId())
                .containsExactly("a", "b");
    }

    @Test
    void 퇴장과_종료는_위치를_지우고_재입장하면_순번과_간격도_새로_시작한다() {
        registry.join("a", "one");
        registry.move("a", pose(999, 12));
        registry.leave("a");
        assertThat(registry.worldState("one").avatars()).isEmpty();
        long version = registry.worldState("one").version();
        assertThat(registry.disconnect("a")).isNull();
        assertThat(registry.worldState("one").version()).isEqualTo(version);
        registry.join("a", "two");
        assertThat(registry.worldState("two").avatars().getFirst().position()).isNull();
        assertThat(registry.move("a", pose(0, 1)).changed()).isTrue();
        registry.clear();
        assertThat(registry.worldState("two").avatars()).isEmpty();
        assertThat(catchThrowableOfType(ChannelException.class, () -> registry.move("a", pose(1, 0))).code())
                .isEqualTo("NOT_IN_CHANNEL");
    }

    @Test
    void 잘못된_이동_간격과_유한하지_않은_위치와_정수_범위는_거절한다() {
        for (Duration duration : List.of(Duration.ZERO, Duration.ofMillis(-1), Duration.ofSeconds(61))) {
            assertThatThrownBy(() -> new WorldChannelRegistry(properties, duration)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> pose(0, Double.NaN)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pose(0, Double.POSITIVE_INFINITY)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pose(-1, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pose(9_007_199_254_740_992L, 0)).isInstanceOf(IllegalArgumentException.class);
    }

    private Position pose(long sequence, double x) {
        return new Position(sequence, x, 0, -1, 0.5);
    }
}
