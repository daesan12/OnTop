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
        for (int delay : new int[]{0, 25, 50, 100}) {
            traces.add(trace("flat", delay, false));
            traces.add(trace("boundary", delay, true));
            for (String name : new String[]{"strafe", "jump", "jump-pad", "pad-fall", "stairs"})
                traces.add(trace(name, delay, false));
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
            var scene = ParkScene.load();
            if (name.equals("jump-pad") || name.equals("pad-fall")) {
                var pad = java.util.stream.StreamSupport.stream(scene.data.path("boxes").spliterator(), false)
                        .filter(box -> box.path("id").asText().equals("future-jump-pad-5")).findFirst().orElseThrow();
                physics.place("a", pad.path("center").get(0).asDouble(),
                        pad.path("center").get(1).asDouble() + pad.path("half").get(1).asDouble() + .8,
                        pad.path("center").get(2).asDouble());
            } else if (name.equals("stairs")) physics.place("a", -18, .8, 11.6);
            if (boundary) {
                var data = ParkScene.load().data;
                double limit = data.path("world").path("halfSize").asDouble()
                        - data.path("world").path("boundaryHalfDepth").asDouble()
                        - data.path("movement").path("radius").asDouble() - data.path("movement").path("offset").asDouble();
                physics.place("a", limit - 1.2, ParkScene.load().groundHeight(limit - 1.2, 34) + .8, 34);
            }
            for (int tick = 1; tick <= 30; tick++) physics.step(tick * WorldPhysics.STEP_NANOS, Set.of());
            var initial = physics.snapshot("a");
            List<Map<String, Object>> commands = new ArrayList<>(), frames = new ArrayList<>(), intents = new ArrayList<>();
            boolean extended = !name.equals("flat") && !boundary;
            int end = extended ? 2200 : 1300;
            for (int at = 100; at <= end; at += 20) {
                double dx = at < 640 ? 1 : at < 820 ? 0 : at < 1180 ? -1 : 0, dz = 0;
                boolean run = false, jump = false;
                if (name.equals("strafe")) { dx = at < 1900 ? ((at - 100) / 80 % 2 == 0 ? 1 : -1) : 0; run = true; }
                if (name.equals("jump")) { dx = at < 1900 ? .6 : 0; jump = at == 100 || at == 1000; }
                if (name.equals("jump-pad")) { dx = at < 550 ? 1 : at < 800 ? -1 : 0; jump = at == 100; }
                if (name.equals("pad-fall")) dx = at < 1100 ? 1 : 0;
                if (name.equals("stairs")) { dx = 0; dz = at < 800 ? -1 : at < 1500 ? 1 : 0; }
                var intent = Map.of("dx", dx, "dz", dz, "run", run, "jump", jump);
                intents.add(Map.of("at", at, "intent", intent));
                if ((at - 100) % 60 == 0) {
                    // The ordinary FE queue keeps a jump that happened between send slots.
                    boolean queuedJump = jump || intents.stream().skip(Math.max(0, intents.size() - 3))
                            .anyMatch(item -> ((Map<?, ?>) item.get("intent")).get("jump").equals(true));
                    commands.add(Map.of("at", at, "seq", commands.size() + 1,
                            "intent", Map.of("dx", dx, "dz", dz, "run", run, "jump", queuedJump)));
                }
            }
            long origin = 2_000_000_000L;
            int next = 0;
            for (int tick = 1; tick <= (extended ? 90 : 51); tick++) {
                long now = origin + tick * WorldPhysics.STEP_NANOS;
                while (next < commands.size() && ((int) commands.get(next).get("at") + delay) * 1_000_000L + origin <= now) {
                    var command = commands.get(next++);
                    @SuppressWarnings("unchecked") var intent = (Map<String, Object>) command.get("intent");
                    long received = origin + ((int) command.get("at") + delay) * 1_000_000L;
                    physics.input("a", new MoveInput((int) command.get("seq"), (double) intent.get("dx"),
                            (double) intent.get("dz"), (boolean) intent.get("run"), (boolean) intent.get("jump")), received);
                    // The immediate receipt response still carries the previous completed physics state.
                    var receipt = new java.util.HashMap<>(frame((int) command.get("at") + delay * 2, physics.snapshot("a")));
                    receipt.put("receiptSeq", command.get("seq"));
                    frames.add(receipt);
                }
                physics.step(now, Set.of());
                if (tick % 3 == 0) frames.add(frame(tick * WorldPhysics.STEP_NANOS / 1_000_000.0 + delay, physics.snapshot("a")));
            }
            frames.sort(Comparator.comparingDouble(f -> ((Number) f.get("at")).doubleValue()));
            return Map.of("scenario", name, "oneWayMs", delay, "initial", initial,
                    "commands", commands, "intents", intents, "frames", frames, "duration", extended ? 3100 : 1800);
        }
    }
    private Map<String, Object> frame(double at, WorldPhysics.Snapshot snapshot) { return Map.of("at", at, "state", snapshot); }
}
