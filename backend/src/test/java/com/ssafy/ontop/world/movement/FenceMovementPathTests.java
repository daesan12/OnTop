package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "FENCE_MOVEMENT_DIR", matches = ".+")
class FenceMovementPathTests {
    @Test
    void 실제_FE_위치보고의_울타리_이동과_짧은착지_재점프를_보정없이_승인한다() throws Exception {
        var directory = Path.of(System.getenv("FENCE_MOVEMENT_DIR"));
        var mapper = new ObjectMapper();
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        var failures = new ArrayList<Object>();
        var sizes = new ArrayList<Integer>();
        var chairs = new HashMap<String, Integer>();
        for (var box : scene.data.path("boxes")) {
            var id = box.path("id").asText();
            if (id.matches(".+-chair-[0-3]")) {
                chairs.put(id.substring(0, id.lastIndexOf("-chair-")), 2);
            }
        }
        int accepted = 0, scenarios = 0;
        for (var trace : mapper.readTree(directory.resolve("position-paths.json").toFile())) {
            scenarios++;
            var now = new AtomicLong();
            try (var world = new WorldPhysics(scene, true, now::get, true, JumpCourse.loadDefault())) {
                world.chairCounts(chairs);
                world.add("a");
                var origin = trace.path("initial");
                world.place("a", origin.path("x").asDouble(), origin.path("y").asDouble(), origin.path("z").asDouble());
                long epoch = world.snapshot("a").motion().epoch();
                for (var report : trace.path("reports")) {
                    now.set(Math.round(report.path("at").asDouble() * 1e9));
                    var payload = ((ObjectNode) report.path("payload")).deepCopy().put("epoch", epoch);
                    var before = world.snapshot("a");
                    var result = world.report("a", ClientPositionValidator.Candidate.parse(payload), now.get());
                    sizes.add(payload.path("path").size());
                    if (result.motion().correctionReason() != null) {
                        failures.add(Map.of("scenario", trace.path("scenario").asText(), "at", report.path("at").asDouble(),
                                "reason", result.motion().correctionReason(), "before", before, "payload", payload));
                        break;
                    }
                    accepted++;
                    world.step(now.get(), Set.of());
                }
            }
        }
        mapper.writerWithDefaultPrettyPrinter().writeValue(directory.resolve("validation.json").toFile(),
                Map.of("scenarios", scenarios, "accepted", accepted, "firstRejections", failures,
                        "maxSamples", sizes.stream().mapToInt(Integer::intValue).max().orElse(0),
                        "averageSamples", sizes.stream().mapToInt(Integer::intValue).average().orElse(0)));
        assertThat(failures).as("See validation.json for rejected actual FE position reports").isEmpty();
        assertThat(scenarios).isEqualTo(224);
    }
}
