package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 legacy 리소스/Bullet 회귀. 시작 위치만 서버 fixture이며 FE/배포 검수가 아니다. */
class FeedbackCollisionTests {
    private final ParkScene scene = ParkScene.load();
    private long tick;

    @Test
    void 사각분수를_제거하고_원형48구간_좌석16개_의자높이와_카탈로그버전을_맞춘다() throws Exception {
        assertThat(boxes().filter(box -> box.path("id").asText().equals("fountain-basin"))).isEmpty();
        assertThat(boxes().filter(box -> box.path("id").asText().startsWith("fountain-basin-"))).hasSize(48);
        assertThat(boxes().filter(box -> box.path("id").asText().contains("-stone-seat-"))).hasSize(16);
        assertThat(seats()).hasSize(28).allSatisfy(box -> {
            assertThat(box.path("half").get(1).asDouble()).isEqualTo(1.25);
            assertThat(box.path("center").get(1).asDouble() - 1.25).isEqualTo(0);
        });
        try (var input = getClass().getResourceAsStream("/world/facilities.json")) {
            assertThat(new ObjectMapper().readTree(input).path("mapVersion").asText()).isEqualTo(scene.version());
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 분수_바깥_대각선_통로는_모서리에_막히지_않는다(boolean run) {
        try (var physics = actor(-50, -42)) {
            drive(physics, run ? 14 : 20, -Math.sqrt(.5), Math.sqrt(.5), run, false);
            assertThat(physics.snapshot("a").x()).isLessThan(-52);
            assertThat(physics.snapshot("a").z()).isGreaterThan(-39.6);
        }
    }

    @ParameterizedTest
    @MethodSource("fountainApproaches")
    void 분수_8방향_접근은_원판을_통과하지_못한다(double angle, boolean run) {
        double dx = Math.cos(angle), dz = Math.sin(angle);
        try (var physics = actor(-56 + dx * 8, -45 + dz * 8)) {
            drive(physics, 60, -dx, -dz, run, false);
            var position = physics.snapshot("a");
            assertThat(Math.hypot(position.x() + 56, position.z() + 45)).as("%s", position)
                    .isBetween(5.5, 6.1);
        }
    }

    @ParameterizedTest(name = "{0} axis={1} run={2} jump={3}")
    @MethodSource("seatApproaches")
    void 모든_돌좌석_정면과_옆면에서_걷기_달리기_점프로_통과하지_못한다(
            String id, int axis, boolean run, boolean jump) {
        JsonNode box = seats().filter(value -> value.path("id").asText().equals(id)).findFirst().orElseThrow();
        double x = box.path("center").get(0).asDouble();
        double z = box.path("center").get(2).asDouble();
        double center = axis == 0 ? x : z;
        double half = box.path("half").get(axis).asDouble();
        String tableId = id.split("-")[0] + "-" + id.split("-")[1];
        JsonNode table = java.util.stream.StreamSupport.stream(scene.data.path("tables").spliterator(), false)
                .filter(value -> value.path("id").asText().equals(tableId)).findFirst().orElseThrow();
        // 테이블의 반대쪽 외부에서 접근한다. 음수 방향 좌석의 시작점을 테이블 안에 배치하지 않는다.
        double sign = center < table.path("position").get(axis).asDouble() ? -1 : 1;
        try (var physics = actor(x + (axis == 0 ? sign * (half + 1.5) : 0),
                z + (axis == 2 ? sign * (half + 1.5) : 0))) {
            for (int index = 0; index < 60; index++) {
                drive(physics, 1, axis == 0 ? -sign : 0, axis == 2 ? -sign : 0, run, jump && index == 0);
                var position = physics.snapshot("a");
                double coordinate = axis == 0 ? position.x() : position.z();
                assertThat(sign * (coordinate - center)).as("%s %s", id, position).isGreaterThan(half + .18);
            }
            var end = physics.snapshot("a");
            assertThat(sign * ((axis == 0 ? end.x() : end.z()) - center)).as("의자 외벽까지 접근: %s", end)
                    .isLessThan(half + .65);
        }
    }

    @Test
    void 승인_착석중_몸체를_제외하고_퇴장후_원래_외부위치에서_이동한다() {
        try (var physics = actor(-7.5, 19.25)) {
            var before = physics.snapshot("a");
            physics.step(++tick * WorldPhysics.STEP_NANOS, Set.of("a"));
            assertThat(physics.snapshot("a").x()).isEqualTo(before.x());
            physics.step(++tick * WorldPhysics.STEP_NANOS, Set.of());
            drive(physics, 10, 1, 0, false, false);
            assertThat(physics.snapshot("a").x()).isGreaterThan(before.x() + 1.5);
        }
    }

    private static Stream<Arguments> fountainApproaches() {
        return java.util.stream.IntStream.range(0, 8).boxed().flatMap(i -> Stream.of(
                Arguments.of(i * Math.PI / 4, false), Arguments.of(i * Math.PI / 4, true)));
    }

    private static Stream<Arguments> seatApproaches() {
        return seats().flatMap(box -> Stream.of(0, 2).flatMap(axis -> Stream.of(
                Arguments.of(box.path("id").asText(), axis, false, false),
                Arguments.of(box.path("id").asText(), axis, true, false),
                Arguments.of(box.path("id").asText(), axis, true, true))));
    }

    private static Stream<JsonNode> boxes() {
        return java.util.stream.StreamSupport.stream(ParkScene.load().data.path("boxes").spliterator(), false);
    }

    private static Stream<JsonNode> seats() {
        return boxes().filter(box -> box.path("id").asText().contains("-stone-seat-")
                || box.path("id").asText().contains("-stool-"));
    }

    private WorldPhysics actor(double x, double z) {
        tick = 0;
        var physics = new WorldPhysics();
        physics.add("a");
        physics.place("a", x, scene.groundHeight(x, z) + .84, z);
        drive(physics, 15, 0, 0, false, false);
        return physics;
    }

    private void drive(WorldPhysics physics, int steps, double dx, double dz, boolean run, boolean jump) {
        for (int index = 0; index < steps; index++) {
            long now = ++tick * WorldPhysics.STEP_NANOS;
            physics.input("a", new MoveInput(tick, dx, dz, run, jump && index == 0), now);
            physics.step(now, Set.of());
        }
    }
}
