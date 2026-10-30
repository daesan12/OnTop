package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 코스 활성 채널의 빠른 낙하 world sweep(setSweepTest(false))이 기존 공원 구조물 이동을 바꾸지 않는지 비교한다.
 * 같은 입력을 기존 ghost sweep(코스 없음)과 코스 활성 물리에 넣는다. 12m/s 미만 이동은 매 틱 같은 위치여야 하고,
 * 빠른 낙하(world sweep 구간)는 최종 착지 위치·지지면이 같아야 한다.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpCourseSweepRegressionTests {
    private ParkScene scene;
    private JumpCourse course;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            // 이름, 시작 x/y/z, 방향 dx/dz, 달리기, 점프 간격(틱, 0=없음), 틱 수, PARK_V1 여부, 빠른 낙하 포함
            "팔각정P0_계단, 0, 0.84, -8, 0, 1, false, 0, 120, true, false",
            "팔각정P0_계단_기본이동, 0, 0.84, -8, 0, 1, false, 0, 120, false, false",
            // 착지 직전 점프 입력은 v2 버퍼(점프맵 활성 채널)로 결과가 달라지므로 이 비교에서는 점프를 넣지 않는다(JumpGraceTests).
            "팔각정P1_바닥, -28, 0.84, -2, 0, 1, true, 0, 90, true, false",
            "석탑_벽, -53, 0.95, -31, 0, 1, true, 0, 75, true, false",
            "석탑_벽_점프, -53, 0.95, -31, 0, 1, false, 10, 75, true, false",
            "전망대_나선길, 68.5, 0.95, 56, 0, 1, false, 0, 150, true, false",
            "전망대_외벽_점프, 72, 0.84, 56, -1, 0, true, 9, 90, true, false",
            "징검다리, 44.92, 1.2, -25.9, 1, 0, false, 8, 120, true, false",
            "분수_가장자리, 0, 0.84, -30, 0, 1, true, 0, 120, true, false",
            "테이블_구역, -20, 0.84, 30, 1, 0.3, true, 11, 120, true, false",
            "높은곳_낙하_지형, 10, 30, 70, 0, 0, false, 0, 90, true, true",
            "높은곳_낙하_기본이동, 10, 30, 70, 0, 0, false, 0, 120, false, true"
    })
    void 코스_활성의_world_sweep은_기존_구조물_이동과_같다(String name, double x, double y, double z, double dx, double dz,
            boolean run, int jumpEvery, int ticks, boolean tuned, boolean fastFall) {
        long[] now = {0};
        try (var ghost = new WorldPhysics(scene, false, () -> now[0], tuned);
                var world = new WorldPhysics(scene, false, () -> now[0], tuned, course)) {
            for (var physics : java.util.List.of(ghost, world)) {
                physics.add("a");
                physics.place("a", x, y, z);
            }
            double worst = 0;
            for (int i = 1; i <= ticks; i++) {
                var input = new MoveInput(i, dx, dz, run, jumpEvery > 0 && i % jumpEvery == 0);
                ghost.input("a", input, now[0]);
                world.input("a", input, now[0]);
                now[0] += WorldPhysics.STEP_NANOS;
                ghost.step(now[0], Set.of());
                world.step(now[0], Set.of());
                var a = ghost.snapshot("a");
                var b = world.snapshot("a");
                worst = Math.max(worst, Math.max(Math.abs(a.x() - b.x()), Math.max(Math.abs(a.y() - b.y()), Math.abs(a.z() - b.z()))));
            }
            assertThat(worst).as("%s 최대 위치 차이 ghost=%s world=%s", name, ghost.snapshot("a"), world.snapshot("a"))
                    .isLessThan(fastFall ? .2 : 1e-4);
            assertThat(world.snapshot("a").y()).as(name).isCloseTo(ghost.snapshot("a").y(), org.assertj.core.data.Offset.offset(1e-3));
            assertThat(world.support("a").kind()).as(name).isEqualTo(ghost.support("a").kind());
            assertThat(world.support("a").colliderId()).as(name).isEqualTo(ghost.support("a").colliderId());
            assertThat(world.lastRecovery("a") == null).as("%s 복구 여부", name).isEqualTo(ghost.lastRecovery("a") == null);
        }
    }
}
