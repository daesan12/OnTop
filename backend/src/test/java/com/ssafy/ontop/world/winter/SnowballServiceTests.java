package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SnowballServiceTests {
    private final SnowballService service = new SnowballService();
    private final Position origin = new Position(0, 0, .84, 0, 0);
    private final List<SnowballService.Target> targets = List.of(
            new SnowballService.Target("far", new Position(0, 0, .84, 10, 0)),
            new SnowballService.Target("near", new Position(0, .2, .84, 5, 0)),
            new SnowballService.Target("side", new Position(0, 3, .84, 3, 0)));

    @BeforeEach
    void 눈을_준비한다() { service.pickup("park", "self", 0); }

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
        service.pickup("park", "self", 900_000_000L);
        assertThat(service.create("next", "park", "self", origin, Math.PI, targets,
                yaw -> 16, 900_000_000L, Instant.EPOCH).hitUserId()).isEmpty();
    }
    @Test
    void 눈이_없으면_발사하지_못하고_한번_주워_한번만_던진다() {
        service.disconnected("self");
        assertThatThrownBy(() -> service.create("empty", "park", "self", origin, 0, targets,
                yaw -> 16, 0, Instant.EPOCH)).hasMessageContaining("먼저 주워");
        service.pickup("park", "self", 0);
        service.pickup("park", "self", 0);
        service.create("one", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        assertThat(service.state("park").players().stream().filter(p -> p.userId().equals("self")).findFirst().orElseThrow().snowballs()).isZero();
    }

    private void 세번_맞힌다() {
        for (int i = 0; i < 3; i++) {
            service.pickup("park", "self", i * 1_000_000_000L);
            service.create("hit-" + i, "park", "self", origin, 0, targets, yaw -> 16,
                    i * 1_000_000_000L, Instant.EPOCH.plusSeconds(i));
        }
    }

    @Test
    void 세번_맞으면_오초간_얼고_시간이_지나면_피격_횟수가_초기화된다() {
        세번_맞힌다();
        assertThat(service.frozen("near", 2_100_000_000L)).isTrue();
        assertThat(service.expire(6_999_000_000L)).isEmpty();
        assertThat(service.expire(7_000_000_000L)).containsExactly("near");
        var victim = service.state("park").players().stream().filter(p -> p.userId().equals("near")).findFirst().orElseThrow();
        assertThat(victim.hits()).isZero();
        assertThat(victim.freezeId()).isEmpty();
    }

    @Test
    void 같은키나_중복요청은_탈출을_완성하지_못하고_AD_교대_여섯번으로_푼다() {
        세번_맞힌다();
        String id = service.state("park").players().stream().filter(p -> p.userId().equals("near")).findFirst().orElseThrow().freezeId();
        service.escape("a", "park", "near", id, "A", 2_100_000_000L);
        service.escape("a", "park", "near", id, "D", 2_200_000_000L);
        service.escape("aa", "park", "near", id, "A", 2_300_000_000L);
        assertThat(service.frozen("near", 2_300_000_000L)).isTrue();
        for (int i = 0; i < 5; i++) {
            service.escape("press-" + i, "park", "near", id, i % 2 == 0 ? "D" : "A", 2_400_000_000L + i * 100_000_000L);
        }
        assertThat(service.frozen("near", 2_900_000_000L)).isFalse();
        assertThatThrownBy(() -> service.escape("stale", "park", "near", id, "A", 3_000_000_000L))
                .isInstanceOf(SnowballService.Rejected.class);
    }

}
