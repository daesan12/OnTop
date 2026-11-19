package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SnowballServiceTests {
    private final SnowballService service = new SnowballService();
    private final Position origin = new Position(0, 0, .84, 0, 0);
    private final List<SnowballService.Target> targets = List.of(
            new SnowballService.Target("far", new Position(0, 0, .84, 10, 0)),
            new SnowballService.Target("near", new Position(0, .2, .84, 5, 0)),
            new SnowballService.Target("side", new Position(0, 3, .84, 3, 0)));

    @Test
    void 앞쪽의_가장_가까운_사용자에게_맞는다() {
        var event = service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);

        assertThat(event.hitUserId()).isEqualTo("near");
        assertThat(event.endZ()).isEqualTo(5);
    }

    @Test
    void 벽_너머나_다른_높이의_사용자에게_맞지_않는다() {
        var event = service.create("shot", "park", "self", origin, 0, targets, yaw -> 4, 0, Instant.EPOCH);

        assertThat(event.hitUserId()).isEmpty();
        assertThat(event.endZ()).isEqualTo(4);
    }

    @Test
    void 중복_요청은_같은_발사를_돌려주고_새_연속_발사는_거절한다() {
        var first = service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);

        assertThat(service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 1, Instant.EPOCH))
                .isSameAs(first);
        assertThatThrownBy(() -> service.create("next", "park", "self", origin, 0, targets,
                yaw -> 16, 1, Instant.EPOCH)).isInstanceOf(IllegalStateException.class);
        assertThat(service.create("next", "park", "self", origin, Math.PI, targets,
                yaw -> 16, 900_000_000L, Instant.EPOCH).hitUserId()).isEmpty();
    }
}
