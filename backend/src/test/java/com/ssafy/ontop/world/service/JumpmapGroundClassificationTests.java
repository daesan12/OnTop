package com.ssafy.ontop.world.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapTracker.Surface;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 실제 생성 맵에서 낙하 판정(FALL)이 어떤 바닥에 적용되는지 고정한다. 서버 물리로 각 충돌체 위에 떨어뜨려
 * 실제 지지 충돌체와 지면/구조물 분류를 확인한다(BE 명세 5장: 지형·길·광장은 FALL, 석탑·전망대·팔각정 등은 이어짐).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpmapGroundClassificationTests {
    private ParkScene scene;
    private JumpCourse course;
    private JsonNode physics;
    private long now;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
        physics = new ObjectMapper().readTree(Path.of("../frontend/generated/park/server-map.json").toFile())
                .path("data").path("physics");
    }

    /** 충돌체 윗면 중앙(hull은 윗면 정점 평균) 위 1m에서 떨어뜨린다. */
    private double[] top(String id) {
        for (JsonNode box : physics.path("boxes")) {
            if (box.path("id").asText().equals(id)) {
                return new double[] {box.at("/center/0").asDouble(), box.at("/center/1").asDouble() + box.at("/half/1").asDouble(),
                        box.at("/center/2").asDouble()};
            }
        }
        for (String kind : new String[] {"hulls", "meshes"}) {
            for (JsonNode hull : physics.path(kind)) {
                if (!hull.path("id").asText().equals(id)) continue;
                var v = hull.path("vertices");
                double top = Double.NEGATIVE_INFINITY;
                for (int i = 1; i < v.size(); i += 3) top = Math.max(top, v.get(i).asDouble());
                double x = 0, z = 0;
                int n = 0;
                for (int i = 0; i < v.size(); i += 3) {
                    if (Math.abs(v.get(i + 1).asDouble() - top) < 1e-6) { x += v.get(i).asDouble(); z += v.get(i + 2).asDouble(); n++; }
                }
                return new double[] {x / n, top, z / n};
            }
        }
        throw new IllegalArgumentException(id);
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            // 지면: 광장·코트·나루 착지장. 지형 메시 자체.
            "plaza-floor, GROUND,", "vr-court-floor, GROUND,", "fishing-landing-42, GROUND,", "layout-fishing-east, GROUND,",
            // 구조물: 석탑 몸체 꼭대기, 팔각정 바닥, 낚시 데크, 벤치, 징검돌
            "vr-pagoda-body, STRUCTURE,", "P1-floor, STRUCTURE, -3", "P0-floor, STRUCTURE, -8", "layout-fishing-deck, STRUCTURE,",
            "bench-event-east-seat, STRUCTURE,", "layout-stone-bridge-stone-12, STRUCTURE,", "tower-deck, STRUCTURE,",
            // 높이 기준의 경계 사례: 팔각정·석탑 첫 계단(지형+0.18m)은 지면으로 본다(검토 필요 정책).
            "P1-step-1-0, GROUND,", "pagoda-step-x-1-0, GROUND,", "pagoda-step-x-1-4, STRUCTURE,"
    })
    void 실제_맵_바닥별_낙하판정(String id, Surface expected, Double dx) {
        double[] p = top(id);
        // 팔각정 중앙은 테이블 이용 구역(올라설 수 없음)이라 바닥 가장자리 쪽에 떨어뜨린다.
        if (dx != null) p[0] += dx;
        try (var world = new WorldPhysics(scene, false, () -> now, true, course)) {
            world.add("a");
            world.place("a", p[0], p[1] + 1, p[2]);
            for (int i = 0; i < 45; i++) world.step(now += WorldPhysics.STEP_NANOS, Set.of());
            var observation = world.observe("a");
            assertThat(observation.support().colliderId()).as("%s 위에 섰는지 %s", id, observation).startsWith(id.replaceAll("-\\d+$", ""));
            assertThat(WorldChannelRegistry.jumpmapSurface(observation)).as("%s %s", id, observation).isEqualTo(expected);
        }
    }
}
