package com.ssafy.ontop.world.jumpmap;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;

/**
 * FE가 내보낸 돌탑 점프맵 코스 전달본. 원본 바이트의 SHA-256과 세 버전을 확인하고,
 * 좌표는 보정·재배치하지 않는다. 게임 진행·보상 판정은 이 클래스가 담당하지 않는다.
 */
public final class JumpCourse {
    public static final String COURSE_VERSION = "park180-jump-v1";
    public static final String RULES_VERSION = "v3";
    public static final int COLLIDERS = 113;
    public static final int GATES = 6;
    public static final int STAGES = 7;
    private static final String RESOURCE = "/world/jumpmap/course.generated.json";
    private static final String CHECKSUM_RESOURCE = "/world/jumpmap/course.generated.sha256";
    private static final String COORDINATES = "uninflated; metres; Y up; center = top - thickness/2";
    private static final int MAX_BYTES = 1024 * 1024;
    private static final double EPSILON = 1e-9;

    private final String sha256;
    private final String selectedCourseVersion, selectedRulesVersion;
    private final boolean renewal;
    private final int stageCount, gateCount, colliderCount;
    private final java.util.Map<Integer,String> themes = new java.util.HashMap<>();
    private final java.util.Map<Integer,Double> yaws = new java.util.HashMap<>();
    private final double finishRadius;
    private final int visibleAtStart;
    private final String mapVersion;
    private final int tickRate;
    private final int coyoteTicks;
    private final int jumpBufferTicks;
    private final List<Stage> stages;
    private final List<Collider> colliders;
    private final Point start;
    private final Point finish;
    private final Point returnTo;

    private JumpCourse(String sha256, JsonNode root) {
        this.sha256 = sha256;
        require(root != null && root.isObject(), "코스는 JSON 객체여야 합니다.");
        require(root.path("schemaVersion").isIntegralNumber() && root.path("schemaVersion").intValue() == 1,
                "지원하는 코스 schemaVersion은 1입니다.");
        mapVersion = text(root, "mapVersion");
        require(mapVersion.matches("[0-9a-f]{64}"), "코스 mapVersion 형식이 올바르지 않습니다.");
        selectedCourseVersion = text(root, "courseVersion");
        selectedRulesVersion = text(root, "rulesVersion");
        renewal = "park220-jump10-v1".equals(selectedCourseVersion);
        require(renewal ? "v4".equals(selectedRulesVersion)
                : COURSE_VERSION.equals(selectedCourseVersion) && RULES_VERSION.equals(selectedRulesVersion),
                "지원하지 않는 courseVersion/rulesVersion입니다.");
        stageCount = renewal ? 10 : STAGES;
        gateCount = stageCount - 1;
        colliderCount = renewal ? 178 : COLLIDERS;
        visibleAtStart = renewal ? integer(root, "visibleAtStart") : COLLIDERS;
        require(!renewal || visibleAtStart > 0 && visibleAtStart <= root.path("stages").path(0).path("count").asInt(),
                "시작 발판 수가 첫 구간과 맞지 않습니다.");
        finishRadius = root.path("finish").path("radius").asDouble(2);
        require(Double.isFinite(finishRadius) && finishRadius > 0 && finishRadius <= 3, "완주 반경이 올바르지 않습니다.");
        JsonNode physics = root.path("physics");
        tickRate = integer(physics, "tickRate");
        require(tickRate == 30, "코스 물리 tickRate는 서버와 같은 30Hz여야 합니다.");
        require(COORDINATES.equals(text(physics, "colliderCoordinates")), "충돌체 좌표 기준이 다릅니다.");
        require(physics.path("avatarCollision").isBoolean() && !physics.path("avatarCollision").booleanValue(),
                "캐릭터끼리는 충돌하지 않아야 합니다.");
        // 보조 틱의 서버 적용 방식은 다음 단계에서 확정한다. 여기서는 전달값만 보존한다.
        coyoteTicks = integer(physics, "coyoteTicks");
        jumpBufferTicks = integer(physics, "jumpBufferTicks");
        stages = stages(root.path("stages"));
        colliders = colliders(root.path("colliders"), root.path("pads"), stages);
        start = point(root.path("start"), true);
        finish = point(root.path("finish"), true);
        returnTo = point(root.path("returnTo"), false);
    }

    /** 서버 배포 산출물에 포함된 전달본과 checksum 파일을 함께 읽는다. */
    public static JumpCourse loadDefault() throws IOException {
        return load(resource(RESOURCE), new String(resource(CHECKSUM_RESOURCE), StandardCharsets.US_ASCII));
    }

    /** The enclosing map loader already validates the content checksum and map identity. */
    public static JumpCourse loadEmbedded(JsonNode course, String mapVersion) {
        require(course instanceof ObjectNode, "공원 점프맵 데이터가 객체여야 합니다.");
        ObjectNode document = ((ObjectNode) course).deepCopy();
        document.put("mapVersion", mapVersion);
        return new JumpCourse(sha256(document.toString().getBytes(StandardCharsets.UTF_8)), document);
    }

    /** checksum은 줄바꿈을 포함한 JSON 원본 바이트로 계산한다. */
    public static JumpCourse load(byte[] json, String expectedSha256) throws IOException {
        require(json != null && json.length > 0 && json.length <= MAX_BYTES, "코스 파일은 1바이트 이상 1MiB 이하여야 합니다.");
        require(expectedSha256 != null && expectedSha256.strip().matches("[0-9a-f]{64}"),
                "코스 checksum 형식이 올바르지 않습니다.");
        String actual = sha256(json);
        require(actual.equals(expectedSha256.strip()), "코스 파일 SHA-256이 전달본과 다릅니다.");
        ObjectMapper mapper = new ObjectMapper()
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        return new JumpCourse(actual, mapper.readTree(json));
    }

    public String sha256() { return sha256; }
    public String mapVersion() { return mapVersion; }
    public String courseVersion() { return selectedCourseVersion; }
    public String rulesVersion() { return selectedRulesVersion; }
    public boolean renewal() { return renewal; }
    public int stageCount() { return stageCount; }
    public String theme(int block) { return themes.getOrDefault(block, "stone"); }
    public boolean visibleAtStart(int block) { return block < visibleAtStart; }
    public double yaw(int block) { return yaws.getOrDefault(block, 0d); }
    public boolean atFinish(double x, double z) { return Double.isFinite(x) && Double.isFinite(z) && Math.hypot(x-finish.x(),z-finish.z()) <= finishRadius; }
    public int tickRate() { return tickRate; }
    public int coyoteTicks() { return coyoteTicks; }
    public int jumpBufferTicks() { return jumpBufferTicks; }
    public List<Stage> stages() { return stages; }
    /** JSON colliders 배열 순서. 목록 위치가 block 번호다. */
    public List<Collider> colliders() { return colliders; }
    public Point start() { return start; }
    public Point finish() { return finish; }
    public Point returnTo() { return returnTo; }

    public record Stage(int stage, String name, int count, int reward) {}

    public record Point(double x, double y, double z) {}

    /** box의 halfX/halfZ는 반크기, cylinder는 둘 다 radius다. 중심 높이는 top - thickness/2로 계산한다. */
    public record Collider(int block, String id, int stage, Integer gate, Shape shape,
            double x, double z, double top, double thickness, double halfX, double halfZ) {
        public enum Shape { BOX, CYLINDER }

        public double centerY() { return top - thickness / 2; }
    }

    private List<Stage> stages(JsonNode values) {
        require(values.isArray() && values.size() == stageCount, "코스 stage 수가 계약과 다릅니다.");
        var result = new ArrayList<Stage>();
        for (int index = 0; index < values.size(); index++) {
            JsonNode stage = values.get(index);
            require(integer(stage, "stage") == index + 1, "stage 번호는 1부터 순서대로여야 합니다.");
            int count = integer(stage, "count"), reward = integer(stage, "reward");
            require(count > 0 && reward > 0, "stage 발판 수와 보상은 양수여야 합니다.");
            result.add(new Stage(index + 1, text(stage, "name"), count, reward));
        }
        if (renewal) {
            List<Integer> rewards = result.stream().map(Stage::reward).toList();
            require(rewards.equals(List.of(10, 20, 30, 40, 50, 60, 64, 70, 76, 80))
                            || rewards.equals(List.of(5, 10, 15, 20, 25, 30, 32, 35, 38, 40)),
                    "10단계 보상 계약이 다릅니다.");
        }
        return List.copyOf(result);
    }

    private List<Collider> colliders(JsonNode values, JsonNode pads, List<Stage> stages) {
        require(values.isArray() && values.size() == colliderCount, "코스 충돌체는 113개여야 합니다.");
        require(pads.isArray() && pads.size() == colliderCount, "코스 pads와 충돌체 수가 다릅니다.");
        var result = new ArrayList<Collider>();
        var ids = new HashSet<String>();
        int[] normal = new int[stageCount + 1];
        int gates = 0, previousStage = 1;
        for (int block = 0; block < values.size(); block++) {
            JsonNode value = values.get(block);
            require(integer(value, "block") == block, "충돌체 block은 배열 순서와 같아야 합니다.");
            String id = text(value, "id");
            require(ids.add(id), "충돌체 id가 중복되었습니다.");
            int stage = integer(value, "stage");
            require(stage >= previousStage && stage <= stageCount, "충돌체 stage는 1~7 순서여야 합니다.");
            previousStage = stage;
            JsonNode gateNode = value.path("gate");
            Integer gate = null;
            if (gateNode.isNull()) {
                normal[stage]++;
            } else {
                gate = integer(value, "gate");
                gates++;
                // 문은 해당 stage의 마지막 일반 발판 뒤에 한 번만 온다. gate 7은 호수 판정이라 충돌체가 없다.
                require(gate == gates && gate == stage && normal[stage] == stages.get(stage - 1).count(),
                        "중간 문 위치가 stage 순서와 다릅니다.");
            }
            require(value.path("yaw").isNumber() && Double.isFinite(value.path("yaw").doubleValue()) && (renewal || value.path("yaw").doubleValue() == 0),
                    "코스 충돌체 yaw는 모두 0이어야 합니다.");
            double top = finite(value.path("top")), thickness = positive(value.path("thickness"));
            JsonNode center = vector(value.path("center")), half = vector(value.path("half"));
            for (JsonNode component : half) positive(component);
            require(Math.abs(center.get(1).doubleValue() - (top - thickness / 2)) < EPSILON
                            && Math.abs(half.get(1).doubleValue() - thickness / 2) < EPSILON,
                    "충돌체 중심 높이는 top - thickness/2여야 합니다.");
            Collider.Shape shape = switch (text(value, "shape")) {
                case "box" -> {
                    require(value.path("radius").isNull(), "box 충돌체에는 radius가 없어야 합니다.");
                    yield Collider.Shape.BOX;
                }
                case "cylinder" -> {
                    double radius = positive(value.path("radius"));
                    require(Math.abs(half.get(0).doubleValue() - radius) < EPSILON
                                    && Math.abs(half.get(2).doubleValue() - radius) < EPSILON,
                            "cylinder 반크기와 radius가 다릅니다.");
                    yield Collider.Shape.CYLINDER;
                }
                default -> throw new IllegalArgumentException("지원하지 않는 충돌체 형상입니다.");
            };
            var collider = new Collider(block, id, stage, gate, shape, center.get(0).doubleValue(),
                    center.get(2).doubleValue(), top, thickness, half.get(0).doubleValue(), half.get(2).doubleValue());
            matchesPad(collider, pads.get(block));
            themes.put(block, pads.get(block).path("theme").asText("stone"));
            yaws.put(block, value.path("yaw").asDouble());
            result.add(collider);
        }
        require(gates == gateCount, "중간 문 충돌체는 6개여야 합니다.");
        for (Stage stage : stages) {
            require(normal[stage.stage()] == stage.count(), "stage별 일반 발판 수가 다릅니다.");
        }
        require(result.size() - gates == colliderCount - gateCount, "일반 발판 충돌체는 107개여야 합니다.");
        return List.copyOf(result);
    }

    // pads는 FE 화면 배치 정보다. 같은 block의 식별자·위치가 충돌체와 어긋나면 전달본 전체를 거부한다.
    private static void matchesPad(Collider collider, JsonNode pad) {
        require(integer(pad, "block") == collider.block() && collider.id().equals(text(pad, "id"))
                        && integer(pad, "stage") == collider.stage(),
                "pads와 충돌체의 block·id·stage가 다릅니다.");
        JsonNode gate = pad.path("gate");
        require(collider.gate() == null ? gate.isMissingNode() || gate.isNull()
                        : gate.isIntegralNumber() && gate.intValue() == collider.gate(),
                "pads와 충돌체의 gate가 다릅니다.");
        require(Math.abs(finite(pad.path("x")) - collider.x()) < EPSILON
                        && Math.abs(finite(pad.path("z")) - collider.z()) < EPSILON
                        && Math.abs(finite(pad.path("top")) - collider.top()) < EPSILON
                        && Math.abs(finite(pad.path("thickness")) - collider.thickness()) < EPSILON,
                "pads와 충돌체의 좌표가 다릅니다.");
    }

    private static Point point(JsonNode value, boolean withHeight) {
        require(value.isObject(), "코스 좌표 객체가 필요합니다.");
        return new Point(finite(value.path("x")), withHeight ? finite(value.path("y")) : 0, finite(value.path("z")));
    }

    private static byte[] resource(String path) throws IOException {
        try (InputStream input = JumpCourse.class.getResourceAsStream(path)) {
            if (input == null) {
                throw new IOException("점프맵 코스 리소스가 없습니다: " + path);
            }
            byte[] bytes = input.readNBytes(MAX_BYTES + 1);
            require(bytes.length <= MAX_BYTES, "코스 리소스가 허용 크기를 초과했습니다.");
            return bytes;
        }
    }

    private static JsonNode vector(JsonNode value) {
        require(value.isArray() && value.size() == 3, "좌표 배열의 길이가 올바르지 않습니다.");
        for (JsonNode component : value) finite(component);
        return value;
    }

    private static String text(JsonNode node, String name) {
        JsonNode value = node.path(name);
        require(value.isTextual() && !value.textValue().isBlank(), name + " 문자열이 필요합니다.");
        return value.textValue();
    }

    private static int integer(JsonNode node, String name) {
        JsonNode value = node.path(name);
        require(value.isIntegralNumber() && value.canConvertToInt() && value.intValue() >= 0,
                name + " 값은 0 이상의 정수여야 합니다.");
        return value.intValue();
    }

    private static double finite(JsonNode value) {
        require(value.isNumber() && Double.isFinite(value.doubleValue()), "유한한 숫자가 필요합니다.");
        return value.doubleValue();
    }

    private static double positive(JsonNode value) {
        double number = finite(value);
        require(number > 0, "양수인 충돌체 치수가 필요합니다.");
        return number;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
