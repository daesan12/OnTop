package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.config.WorldProximityProperties.Point;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.service.WorldProximity;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldProximityTests {
    private final WorldChannelRegistry channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 5), new Channel("two", "둘", 5))));
    private final WorldProximity proximity = new WorldProximity(channels,
            new WorldProximityProperties(null, null, Map.of("table", new Point(0.0, 0.0))));

    @Test
    void 기본20m_경계를_포함하고_높이는_제외한다() {
        place("a", "one", 0, 0);
        place("b", "one", 12, 16);
        assertThat(proximity.canHear("a", "b")).isTrue();
        assertThat(proximity.canWatch("b", "table", "one")).isTrue();
        channels.move("a", new Position(0, 0, 0, 0, 0)); // 낡은 순번은 위치를 바꾸지 않는다.
        assertThat(proximity.canHear("a", "b")).isTrue();
    }

    @Test
    void 반경초과_다른채널_위치미보고_좌표미설정은_차단한다() {
        place("a", "one", 0, 0);
        place("far", "one", 20.0001, 0);
        place("other", "two", 0, 0);
        channels.join("unknown", "one");
        for (String target : List.of("far", "other", "unknown", "outside")) {
            assertThat(proximity.canHear("a", target)).isFalse();
        }
        assertThat(proximity.canWatch("a", "unset", "one")).isFalse();
        assertThat(proximity.canWatch("unknown", "table", "one")).isFalse();
        assertThat(proximity.canWatch("other", "table", "one")).isFalse();
        channels.leave("a");
        assertThat(proximity.hasPosition("a")).isFalse();
        channels.join("a", "one");
        assertThat(proximity.canWatch("a", "table", "one")).isFalse();
    }

    @Test
    void 큰유한좌표를_계산해도_overflow로_가까운것처럼_허용하지않는다() {
        place("a", "one", Double.MAX_VALUE, 0);
        place("b", "one", -Double.MAX_VALUE, 0);
        assertThat(proximity.canHear("a", "b")).isFalse();
    }

    @Test
    void 일부좌표가_빠진_설정을_원점으로_해석하지않는다() {
        assertThatThrownBy(() -> new Point(null, 10.0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Point(10.0, null)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(doubles = {0, -1, Double.NaN, Double.POSITIVE_INFINITY})
    void 잘못된_반경설정을_거절한다(double radius) {
        assertThatThrownBy(() -> new WorldProximityProperties(radius, 20.0, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new WorldProximityProperties(20.0, radius, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void place(String user, String channel, double x, double z) {
        channels.join(user, channel);
        channels.move(user, new Position(0, x, user.equals("b") ? 999 : 0, z, 0));
    }
}
