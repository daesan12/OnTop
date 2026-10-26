package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WorldPhysicsTests {
    private long tick;

    @Test
    void 점프_입력이_만료돼도_착지_전까지는_감정표현을_막는다() {
        try (var physics = new WorldPhysics()) {
            physics.add("a");
            for (int i = 0; i < 30; i++) {
                physics.step(++tick * WorldPhysics.STEP_NANOS, java.util.Set.of());
            }
            double standingY = physics.snapshot("a").y();
            long jumpedAt = ++tick * WorldPhysics.STEP_NANOS;
            physics.input("a", new MoveInput(1, 0, 0, false, true), jumpedAt);
            for (int i = 0; i < 10; i++) {
                physics.step(tick++ * WorldPhysics.STEP_NANOS, java.util.Set.of());
            }
            long now = tick * WorldPhysics.STEP_NANOS;

            assertThat(now - jumpedAt).isGreaterThan(250_000_000L);
            assertThat(physics.snapshot("a").y()).isGreaterThan(standingY + .3);
            assertThat(physics.hasMovementActivity("a", now)).isTrue();

            for (int i = 0; i < 60; i++) {
                physics.step(++tick * WorldPhysics.STEP_NANOS, java.util.Set.of());
            }
            assertThat(physics.snapshot("a").y()).isCloseTo(standingY, org.assertj.core.data.Offset.offset(.05));
            assertThat(physics.hasMovementActivity("a", tick * WorldPhysics.STEP_NANOS)).isFalse();
        }
    }

    @Test
    void 큰채널도_검증된_스폰영역을_순환한다() {
        var scene = ParkScene.load();
        assertThat(scene.spawn(136)).isEqualTo(scene.spawn(8));
        assertThat(scene.spawn(140)).isEqualTo(scene.spawn(12));
        assertThat(scene.spawn(1000).z).isBetween(34f, 38.1f);
    }

    @Test
    void 수영하다_징검다리로_올라올수있다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            p.place("a", 56.7916667, -.075, -21.9959675);
            drive(p, 2, 0, 0, false, false);
            assertThat(p.snapshot("a").swimming()).isTrue();
            drive(p, 10, 0, -1, false, true);
            drive(p, 60, 0, 0, false, false);
            assertThat(p.snapshot("a").y()).as("징검다리 %s", p.snapshot("a")).isBetween(1.0, 1.3);
            assertThat(p.snapshot("a").swimming()).isFalse();
        }
    }

    @Test
    void 전망대_나선경사로를_따라_높이가증가한다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            p.place("a", 62.5, .94, 50);
            drive(p, 10, 0, 0, false, false);
            for (int i = 0; i < 60; i++) {
                var state = p.snapshot("a");
                double angle = Math.atan2(state.z() - 50, state.x() - 56);
                drive(p, 1, -Math.sin(angle), Math.cos(angle), false, false);
            }
            assertThat(p.snapshot("a").y()).as("전망대 %s", p.snapshot("a")).isBetween(1.6, 4.0);
        }
    }

    @Test
    void 착석은_남은점프와_이동입력도_정지한다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            drive(p, 30, 0, 0, false, false);
            drive(p, 3, 0, -1, true, true);
            p.step(++tick * WorldPhysics.STEP_NANOS, java.util.Set.of("a"));
            var seated = p.snapshot("a");
            for (int i = 0; i < 60; i++)
                p.step(++tick * WorldPhysics.STEP_NANOS, java.util.Set.of("a"));
            assertThat(p.snapshot("a")).isEqualTo(seated);
            assertThat(seated.moving()).isFalse();
        }
    }

    @Test
    void 실제맵의_벽과_테이블을_달리기와점프로_통과하지못한다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            p.place("a", 0, .8, 79);
            drive(p, 30, 0, 0, false, false);
            drive(p, 60, 0, 1, true, true);
            assertThat(p.snapshot("a").z()).isLessThan(79.4);
            p.place("a", -10, .8, 22);
            drive(p, 15, 0, 0, false, false);
            drive(p, 60, 0, -1, true, true);
            assertThat(p.snapshot("a").z()).isGreaterThan(19);
        }
    }

    @Test
    void 실제팔각정_계단을_오르고_내려온다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            p.place("a", -18, .8, 11.6);
            drive(p, 15, 0, 0, false, false);
            drive(p, 20, 0, -1, false, false);
            assertThat(p.snapshot("a").y()).isBetween(1.4, 1.6);
            drive(p, 20, 0, 1, false, false);
            drive(p, 15, 0, 0, false, false);
            assertThat(p.snapshot("a").y()).isBetween(.7, .9);
        }
    }

    @Test
    void 점프는_지상에서만_시작하고_공중에서_재충전되지않는다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            drive(p, 30, 0, 0, false, false);
            double base = p.snapshot("a").y();
            double peak = base;
            for (int i = 0; i < 60; i++) {
                drive(p, 1, 0, 0, false, i < 12);
                peak = Math.max(peak, p.snapshot("a").y());
            }
            assertThat(peak - base).isBetween(.8, 1.3);
            assertThat(p.snapshot("a").y())
                    .isCloseTo(base, org.assertj.core.data.Offset.offset(.05));
        }
    }

    @Test
    void 물속에서도_수평수영이_진행되고_부력높이를_유지한다() {
        try (var p = new WorldPhysics()) {
            p.add("a");
            p.place("a", 56, -.1, -30);
            drive(p, 30, 1, 0, false, false);
            assertThat(p.snapshot("a").swimming()).as("수영 상태 %s", p.snapshot("a")).isTrue();
            assertThat(p.snapshot("a").x()).isGreaterThan(58);
            assertThat(p.snapshot("a").y()).isBetween(-.3, .3);
        }
    }

    private void drive(WorldPhysics p, int count, double dx, double dz, boolean run, boolean jump) {
        for (int i = 0; i < count; i++) {
            long now = ++tick * WorldPhysics.STEP_NANOS;
            p.input("a", new MoveInput(tick, dx, dz, run, jump && i == 0), now);
            p.step(now, java.util.Set.of());
        }
    }

    @Test
    void 서버시간만큼만_이동하고_입력만료후_멈춘다() {
        try (var physics = new WorldPhysics()) {
            physics.add("a");
            for (int i = 0; i < 30; i++)
                physics.step(i * WorldPhysics.STEP_NANOS, java.util.Set.of());
            var before = physics.snapshot("a");
            for (int i = 30; i < 60; i++) {
                physics.input(
                        "a", new MoveInput(i, 0, -1, false, false), i * WorldPhysics.STEP_NANOS);
                physics.step(i * WorldPhysics.STEP_NANOS, java.util.Set.of());
            }
            var after = physics.snapshot("a");
            assertThat(before.z() - after.z()).isBetween(6.0, 6.5);
            assertThat(after.y()).isBetween(.7, .9);
            for (int i = 60; i < 90; i++)
                physics.step(i * WorldPhysics.STEP_NANOS, java.util.Set.of());
            var stopped = physics.snapshot("a");
            assertThat(stopped.moving()).isFalse();
            assertThat(after.z() - stopped.z()).isLessThan(2);
            assertThat(
                            physics.input(
                                    "a",
                                    new MoveInput(1, 1, 0, true, false),
                                    90 * WorldPhysics.STEP_NANOS))
                    .isFalse();
        }
    }
}
