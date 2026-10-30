package com.ssafy.ontop.world.jumpmap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** FE 전달본(frontend/docs/jumpmap)과 서버 리소스가 같은 바이트인지, 검증 규칙이 변조를 거부하는지 확인한다. */
class JumpCourseTests {
    private static final Path HANDOFF = Path.of("../frontend/docs/jumpmap");
    private static final String GENERATED_MAP = "04350122fdeee2b89212345ee4f776990d78832bb25435418b5ea6f2b2fbc769";

    @Test
    void 서버_리소스는_FE_전달본과_같은_바이트와_checksum이다() throws Exception {
        assertThat(resource("course.generated.json")).isEqualTo(Files.readAllBytes(HANDOFF.resolve("course.generated.json")));
        assertThat(resource("course.generated.sha256")).isEqualTo(Files.readAllBytes(HANDOFF.resolve("course.generated.sha256")));
        assertThat(sha256(resource("course.generated.json")))
                .isEqualTo(new String(resource("course.generated.sha256"), StandardCharsets.US_ASCII).strip());
    }

    @Test
    void 세_버전과_113개_충돌체_구성을_검증한다() throws Exception {
        var course = JumpCourse.loadDefault();
        var manifest = new ObjectMapper().readTree(Path.of("../frontend/generated/park/manifest.json").toFile());

        assertThat(course.mapVersion()).isEqualTo(GENERATED_MAP).isEqualTo(manifest.path("mapVersion").asText());
        assertThat(course.courseVersion()).isEqualTo("park180-jump-v1");
        assertThat(course.rulesVersion()).isEqualTo("v2");
        assertThat(course.sha256()).isEqualTo("daabdd8346576f0dfcde7cfbdd7c1845ce75ff776779a59610255f472fe5e5fb");
        assertThat(course.colliders()).hasSize(113);
        assertThat(course.colliders()).extracting(JumpCourse.Collider::block)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 113).boxed().toList());
        assertThat(course.colliders().stream().filter(c -> c.gate() == null)).hasSize(107);
        assertThat(course.colliders().stream().filter(c -> c.gate() != null).map(c -> List.of(c.block(), c.gate())))
                .containsExactly(List.of(24, 1), List.of(34, 2), List.of(48, 3), List.of(61, 4), List.of(79, 5), List.of(98, 6));
        assertThat(course.stages()).extracting(JumpCourse.Stage::count).containsExactly(24, 9, 13, 12, 17, 18, 14);
        assertThat(course.colliders().stream().filter(c -> c.shape() == JumpCourse.Collider.Shape.BOX)).hasSize(42);
        assertThat(course.colliders().stream().filter(c -> c.shape() == JumpCourse.Collider.Shape.CYLINDER)).hasSize(71);
        // 원본 문서의 0.12m가 아니라 전달본의 0.05m 방패연 두께를 그대로 쓴다.
        assertThat(course.colliders().stream().filter(c -> c.stage() == 6 && c.gate() == null))
                .hasSize(18).allSatisfy(c -> assertThat(c.thickness()).isEqualTo(0.05));
        var first = course.colliders().getFirst();
        assertThat(first.id()).isEqualTo("future-jump-pad-0");
        assertThat(first.centerY()).isEqualTo(0.53, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(course.tickRate()).isEqualTo(30);
        assertThat(course.start()).isEqualTo(new JumpCourse.Point(-53, 0, -14.1));
    }

    @Test
    void 바이트가_바뀌면_checksum으로_거부한다() throws Exception {
        byte[] json = resource("course.generated.json");
        String expected = sha256(json);
        byte[] changed = json.clone();
        changed[changed.length - 1] = ' ';

        assertThatThrownBy(() -> JumpCourse.load(changed, expected)).hasMessageContaining("SHA-256");
        assertThatThrownBy(() -> JumpCourse.load(json, "not-a-hash")).hasMessageContaining("checksum");
    }

    @Test
    void checksum이_맞아도_버전과_충돌체_규칙이_다르면_거부한다() throws Exception {
        rejects(root -> root.put("courseVersion", "park180-jump-v2"), "courseVersion");
        rejects(root -> root.put("rulesVersion", "v1"), "rulesVersion");
        rejects(root -> root.withArray("colliders").remove(112), "113");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(80)).put("yaw", 0.1), "yaw");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(80)).put("top", 46), "top - thickness/2");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(3)).put("block", 4), "block");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(24)).put("gate", 2), "중간 문");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(24)).putNull("gate"), "gate");
        rejects(root -> ((ObjectNode) root.withArray("colliders").get(0)).put("shape", "sphere"), "형상");
        rejects(root -> ((ObjectNode) root.withArray("pads").get(5)).put("x", 0), "pads");
    }

    @Test
    void 플래그가_꺼져_있으면_코스를_읽지_않고_비활성이다() {
        var loaded = new AtomicBoolean();
        var activation = JumpmapActivation.decide(false, GENERATED_MAP, () -> {
            loaded.set(true);
            return JumpCourse.loadDefault();
        });

        assertThat(loaded).isFalse();
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.DISABLED);
        assertThat(activation.active()).isFalse();
        assertThat(activation.course()).isEmpty();
    }

    @Test
    void 맵버전이_다르거나_코스가_잘못되면_점프맵만_비활성이다() {
        var legacy = JumpmapActivation.decide(true, "legacy-park-version", JumpCourse::loadDefault);
        assertThat(legacy.state()).isEqualTo(JumpmapActivation.State.MAP_MISMATCH);
        assertThat(legacy.course()).isEmpty();

        var invalid = JumpmapActivation.decide(true, GENERATED_MAP, () -> {
            throw new IllegalArgumentException("broken");
        });
        assertThat(invalid.state()).isEqualTo(JumpmapActivation.State.INVALID_COURSE);
        assertThat(invalid.course()).isEmpty();

        var active = JumpmapActivation.decide(true, GENERATED_MAP, JumpCourse::loadDefault);
        assertThat(active.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
        assertThat(active.course()).get().extracting(JumpCourse::courseVersion).isEqualTo("park180-jump-v1");
    }

    private static void rejects(Consumer<ObjectNode> change, String message) throws Exception {
        var root = (ObjectNode) new ObjectMapper().readTree(resource("course.generated.json"));
        change.accept(root);
        byte[] json = new ObjectMapper().writeValueAsBytes(root);
        assertThatThrownBy(() -> JumpCourse.load(json, sha256(json))).as(message).hasMessageContaining(message);
    }

    private static byte[] resource(String name) throws Exception {
        try (var input = JumpCourse.class.getResourceAsStream("/world/jumpmap/" + name)) {
            assertThat(input).as(name).isNotNull();
            return input.readAllBytes();
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
}
