package com.ssafy.ontop.world;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.service.WorldFollowService;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldFollowTests {

    private final WorldFollowService service = new WorldFollowService();

    @Test
    void 시작_거리와_높이_경계를_포함하고_초과는_거절한다() {
        var initial = service.start("a", "one", "two", position(0, 0), position(12, 2));
        assertThat(initial.version()).isEqualTo(1);
        assertThat(initial.links()).hasSize(1);
        assertCode(() -> service.start("a", "three", "two", position(0, 0), position(12.001, 0)),
                "FOLLOW_OUT_OF_RANGE");
        assertCode(() -> service.start("a", "three", "two", position(0, 0), position(0, 2.001)),
                "FOLLOW_OUT_OF_RANGE");
        assertThat(service.state("a")).isEqualTo(initial);
    }

    @Test
    void 반복_시작은_ID와_버전을_유지하고_다른_대상으로_바꾸면_새_ID를_발급한다() {
        var initial = service.start("a", "one", "two", position(0, 0), position(1, 0));
        assertThat(service.start("a", "one", "two", position(0, 0), position(1, 0))).isEqualTo(initial);
        assertThat(service.start("a", "one", "two", position(0, 0), position(18, 0))).isEqualTo(initial);
        var next = service.start("a", "one", "three", position(0, 0), position(1, 0));
        assertThat(next.version()).isEqualTo(2);
        assertThat(next.links().getFirst().followId()).isNotEqualTo(initial.links().getFirst().followId());
        assertCode(() -> service.stop("a", "one", initial.links().getFirst().followId()), "FOLLOW_LINK_MISMATCH");
        assertThat(service.state("a")).isEqualTo(next);
    }

    @Test
    void 종료는_본인_관계만_제거하고_중복_종료는_상태를_바꾸지_않는다() {
        var first = service.start("a", "one", "two", position(0, 0), position(1, 0));
        service.start("a", "three", "two", position(0, 0), position(1, 0));
        String id = first.links().getFirst().followId();
        var stopped = service.stop("a", "one", id);
        assertThat(stopped.links()).extracting(WorldFollowService.Link::followerId).containsExactly("three");
        assertThat(service.stop("a", "one", id)).isEqualTo(stopped);
        assertThat(service.isFollowing("one")).isFalse();
        assertThat(service.isFollowing("three")).isTrue();
    }

    @Test
    void 자기자신과_순환_관계는_거절하고_다른_채널은_분리한다() {
        assertCode(() -> service.start("a", "one", "one", position(0, 0), position(0, 0)),
                "FOLLOW_SELF_NOT_ALLOWED");
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        service.start("a", "two", "three", position(0, 0), position(1, 0));
        assertCode(() -> service.start("a", "three", "one", position(0, 0), position(1, 0)),
                "FOLLOW_CYCLE_NOT_ALLOWED");
        assertThat(service.state("a").links()).hasSize(2);
        assertThat(service.state("b").links()).isEmpty();
    }

    @Test
    void 유지_거리는_24미터_높이_3점5미터_경계를_포함한다() {
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        var onBoundary = service.prune("a", Map.of("one", position(0, 0), "two", position(24, 3.5)), Set.of());
        assertThat(onBoundary.version()).isEqualTo(1);
        assertThat(onBoundary.links()).hasSize(1);
        var outside = service.prune("a", Map.of("one", position(0, 0), "two", position(24.001, 0)), Set.of());
        assertThat(outside.version()).isEqualTo(2);
        assertThat(outside.links()).isEmpty();
    }

    @Test
    void 위치_소실과_이용_상태_전환은_자동_해제한다() {
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        assertThat(service.prune("a", Map.of("one", position(0, 0)), Set.of()).links()).isEmpty();
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        assertThat(service.prune("a", Map.of("one", position(0, 0), "two", position(1, 0)),
                Set.of("two")).links()).isEmpty();
        assertCode(() -> service.start("a", "one", "two", null, position(1, 0)), "WORLD_POSITION_REQUIRED");
    }

    @Test
    void 직접입력은_본인의_연결만_해제하고_뒤따르는_사용자는_유지한다() {
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        service.start("a", "two", "three", position(0, 0), position(1, 0));
        var changed = service.stopFollowing("two");
        assertThat(changed).hasSize(1);
        assertThat(changed.getFirst().links()).extracting(WorldFollowService.Link::followerId)
                .containsExactly("one");
        assertThat(service.stopFollowing("two")).isEmpty();
    }

    @Test
    void 퇴장은_양쪽_관계를_제거하고_중복_정리와_앱_종료를_처리한다() {
        service.start("a", "one", "two", position(0, 0), position(1, 0));
        service.start("a", "two", "three", position(0, 0), position(1, 0));
        assertThat(service.removeUser("two")).hasSize(1).allSatisfy(state -> assertThat(state.links()).isEmpty());
        assertThat(service.removeUser("two")).isEmpty();
        service.start("b", "four", "five", position(0, 0), position(1, 0));
        service.clear();
        assertThat(service.state("b").links()).isEmpty();
    }

    private Position position(double x, double y) {
        return new Position(1, x, y, 0, 0);
    }

    private void assertCode(Runnable action, String code) {
        assertThatThrownBy(action::run).isInstanceOf(WorldFollowService.FollowException.class)
                .extracting("code").isEqualTo(code);
    }
}
