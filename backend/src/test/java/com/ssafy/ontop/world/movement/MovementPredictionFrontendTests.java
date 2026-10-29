package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;

/** Actual Bullet trajectories replayed by the FE predictor. Controlled latency, not a live-server benchmark. */
@EnabledIfEnvironmentVariable(named = "TEST_MOVEMENT_PREDICTION_FRONTEND", matches = "true")
class MovementPredictionFrontendTests {
    @Test void 같은_Bullet_궤적과_지연에서_예측전후_반응과_충돌보정을비교한다() throws Exception {
        Path directory = Path.of(System.getenv("MOVEMENT_COMPARISON_DIR")).toAbsolutePath();
        Files.createDirectories(directory);
        var traces = new ArrayList<Map<String, Object>>();
        for (int delay : new int[]{0, 50, 100}) {
            traces.add(trace("flat", delay, false));
            traces.add(trace("boundary", delay, true));
        }
        new ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(directory.resolve("bullet-traces.json").toFile(), traces);
        var builder = new ProcessBuilder("node", "node_modules/vitest/vitest.mjs", "run", "tests/unit/movementComparison.test.ts")
                .directory(Path.of("../frontend").toFile()).redirectErrorStream(true)
                .redirectOutput(directory.resolve("frontend-comparison.log").toFile());
        builder.environment().put("MOVEMENT_COMPARISON_DIR", directory.toString());
        Process process = builder.start();
        try {
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue();
            String report = Files.readString(directory.resolve("frontend-comparison.log"));
            System.out.println(report);
            assertThat(process.exitValue()).as(report).isZero();
            assertThat(directory.resolve("comparison-results.json")).exists();
        } finally { if (process.isAlive()) process.destroyForcibly(); }
    }
    private Map<String, Object> trace(String name, int delay, boolean boundary) {
        try (var physics = new WorldPhysics()) {
            physics.add("a");
            if (boundary) {
                var data = ParkScene.load().data;
                double limit = data.path("world").path("halfSize").asDouble()
                        - data.path("world").path("boundaryHalfDepth").asDouble()
                        - data.path("movement").path("radius").asDouble() - data.path("movement").path("offset").asDouble();
                physics.place("a", limit - 1.2, ParkScene.load().groundHeight(limit - 1.2, 34) + .8, 34);
            }
            for (int tick = 1; tick <= 30; tick++) physics.step(tick * WorldPhysics.STEP_NANOS, Set.of());
            var initial = physics.snapshot("a");
            List<Map<String, Object>> commands = new ArrayList<>(), frames = new ArrayList<>();
            for (int at = 100, seq = 1; at <= 1300; at += 60, seq++) {
                double dx = at < 640 ? 1 : at < 820 ? 0 : at < 1180 ? -1 : 0;
                commands.add(Map.of("at", at, "seq", seq, "intent", Map.of("dx", dx, "dz", 0, "run", false, "jump", false)));
            }
            long origin = 2_000_000_000L;
            int next = 0;
            for (int tick = 1; tick <= 51; tick++) {
                long now = origin + tick * WorldPhysics.STEP_NANOS;
                while (next < commands.size() && ((int) commands.get(next).get("at") + delay) * 1_000_000L + origin <= now) {
                    var command = commands.get(next++);
                    @SuppressWarnings("unchecked") var intent = (Map<String, Object>) command.get("intent");
                    long received = origin + ((int) command.get("at") + delay) * 1_000_000L;
                    physics.input("a", new MoveInput((int) command.get("seq"), (double) intent.get("dx"), 0, false, false), received);
                    // The immediate receipt response still carries the previous completed physics state.
                    frames.add(frame((int) command.get("at") + delay * 2, physics.snapshot("a")));
                }
                physics.step(now, Set.of());
                if (tick % 3 == 0) frames.add(frame(tick * WorldPhysics.STEP_NANOS / 1_000_000.0 + delay, physics.snapshot("a")));
            }
            frames.sort(Comparator.comparingDouble(f -> ((Number) f.get("at")).doubleValue()));
            return Map.of("scenario", name, "oneWayMs", delay, "initial", initial, "commands", commands, "frames", frames);
        }
    }
    private Map<String, Object> frame(double at, WorldPhysics.Snapshot snapshot) { return Map.of("at", at, "state", snapshot); }
}
