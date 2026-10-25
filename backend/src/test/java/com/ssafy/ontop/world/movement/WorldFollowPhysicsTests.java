package com.ssafy.ontop.world.movement;

import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;

class WorldFollowPhysicsTests {
    private long tick;
    private final Map<String, String> following = Map.of("a", "b");

    @Test
    void 정지_경계와_걷기_달리기_속도를_매틱_서버_좌표로_판정한다() {
        try (var p = pair()) {
            p.place("b", 5, .84, 36);
            step(p, 1);
            assertThat(p.snapshot("a").x()).isCloseTo(6.25 / 30, offset(.003));
            assertThat(p.snapshot("a").running()).isFalse();
            p.place("a", 0, .84, 36);
            p.place("b", 5.01, .84, 36);
            step(p, 1);
            assertThat(p.snapshot("a").x()).isCloseTo(9.0 / 30, offset(.003));
            assertThat(p.snapshot("a").running()).isTrue();
            p.place("a", 0, .84, 36);
            p.place("b", 2.2, .84, 36);
            step(p, 5);
            assertThat(p.snapshot("a").x()).isCloseTo(0, offset(.001));
            assertThat(p.snapshot("a").moving()).isFalse();
            p.place("b", 4, .84, 36);
            step(p, 1);
            assertThat(p.snapshot("a").x()).isGreaterThan(.2);
        }
    }

    @Test
    void 정지_입력이_자동이동을_덮어쓰거나_자동이동이_클라이언트_순번을_소비하지_않는다() {
        try (var p = pair()) {
            p.input("a", new MoveInput(7, 0, 0, false, false), 0);
            step(p, 10);
            assertThat(p.snapshot("a").x()).isGreaterThan(1.8);
            assertThat(p.snapshot("a").lastInputSeq()).isEqualTo(7);
            // Hub가 관계를 제거한 뒤 받은 직접 조작이 다음 틱부터 우선한다.
            long now = ++tick * WorldPhysics.STEP_NANOS;
            p.input("a", new MoveInput(8, -1, 0, false, false), now);
            double x = p.snapshot("a").x();
            p.step(now, Set.of());
            assertThat(p.snapshot("a").x()).isLessThan(x);
            assertThat(p.snapshot("a").lastInputSeq()).isEqualTo(8);
        }
    }

    @Test
    void 정지_요청과_대상_퇴장_후에는_이전_자동이동이_남지_않는다() {
        try (var p = pair()) {
            step(p, 3);
            p.stop("a");
            double x = p.snapshot("a").x();
            for (int i = 0; i < 10; i++) {
                p.step(++tick * WorldPhysics.STEP_NANOS, Set.of());
            }
            assertThat(p.snapshot("a").x()).isCloseTo(x, offset(.001));
            assertThat(p.snapshot("a").moving()).isFalse();
            p.remove("b");
            step(p, 3);
            assertThat(p.snapshot("a").x()).isCloseTo(x, offset(.001));
        }
    }

    @Test
    void 실제_테이블_장애물을_통과하거나_자동으로_점프하지_않고_계속_시도한다() {
        try (var p = pair()) {
            p.place("a", -10, .84, 22);
            p.place("b", -10, .84, 15);
            step(p, 120);
            var blocked = p.snapshot("a");
            assertThat(blocked.z()).isGreaterThan(19);
            assertThat(blocked.y()).isBetween(.7, .95);
            assertThat(blocked.moving()).isTrue();
            step(p, 30);
            assertThat(p.snapshot("a").z()).isCloseTo(blocked.z(), offset(.02));
        }
    }

    @Test
    void 유지_거리와_높이를_넘거나_대상이_착석하면_물리_입력도_정지한다() {
        try (var p = pair()) {
            p.place("b", 25, .84, 36);
            step(p, 1);
            assertThat(p.snapshot("a").moving()).isFalse();
            p.place("b", 4, 4.35, 36);
            step(p, 1);
            assertThat(p.snapshot("a").moving()).isFalse();
            p.place("b", 4, .84, 36);
            p.step(++tick * WorldPhysics.STEP_NANOS, Set.of("b"), following);
            assertThat(p.snapshot("a").moving()).isFalse();
        }
    }

    private WorldPhysics pair() {
        var p = new WorldPhysics();
        p.add("a");
        p.add("b");
        p.place("a", 0, .84, 36);
        p.place("b", 4, .84, 36);
        return p;
    }

    private void step(WorldPhysics p, int count) {
        for (int i = 0; i < count; i++) {
            p.step(++tick * WorldPhysics.STEP_NANOS, Set.of(), following);
        }
    }
}
