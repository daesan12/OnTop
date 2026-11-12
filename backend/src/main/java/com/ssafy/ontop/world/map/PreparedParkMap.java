package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.service.WorldFacilityService.Catalog;
import com.ssafy.ontop.world.service.WorldFacilityService.Definition;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 새 맵의 테이블·좌표·물리 입력을 조립한다. 런타임 선택과 기본 맵 유지 여부는 WorldMapRuntime이 담당한다. */
public final class PreparedParkMap {
    private final JsonNode collisionData;
    private final JsonNode jumpCourse;
    private final WorldMapMetadata metadata;
    private final List<Binding> bindings;
    private final WorldProximityProperties proximity;
    private final Catalog facilities;
    private final Reach notes;
    private final Reach feedback;
    private final Reach vrEntrance;

    private PreparedParkMap(GeneratedParkMapLoader.ValidatedMap map, Set<String> channels) throws IOException {
        JsonNode data = map.document().path("data");
        var tablePoints = new LinkedHashMap<String, WorldProximityProperties.Point>();
        var entries = new ArrayList<Binding>();
        require(!channels.isEmpty() && channels.stream().noneMatch(String::isBlank), "채널 목록이 필요합니다.");
        Map<String, JsonNode> anchors = indexed(data.path("tables"));
        require(!anchors.isEmpty(), "게임 테이블 앵커가 필요합니다.");
        if (data.has("tableAnchorIds")) {
            var declared = new HashSet<String>();
            JsonNode ids = data.path("tableAnchorIds");
            require(ids.isArray(), "테이블 앵커 목록은 배열이어야 합니다.");
            for (JsonNode id : ids) {
                require(id.isTextual() && declared.add(id.asText()), "테이블 앵커 목록을 확인해주세요.");
            }
            require(declared.equals(anchors.keySet()), "테이블 앵커 목록과 좌표가 다릅니다.");
        } else {
            for (int i = 1; i <= anchors.size(); i++) {
                require(anchors.containsKey("table-" + i), "테이블 앵커가 누락되었습니다: table-" + i);
            }
        }
        var anchorNumbers = new ArrayList<Integer>();
        for (String id : anchors.keySet()) {
            require(id.matches("table-[1-9][0-9]{0,8}"), "테이블 앵커 형식이 올바르지 않습니다: " + id);
            anchorNumbers.add(Integer.parseInt(id.substring("table-".length())));
        }
        anchorNumbers.sort(Integer::compareTo);
        for (String channel : channels.stream().sorted().toList()) {
            for (int number : anchorNumbers) {
                String anchorId = "table-" + number;
                JsonNode anchor = anchors.get(anchorId);
                Pose position = position(anchor.path("position"), 0);
                String tableId = serverTableId(channel, number);
                entries.add(new Binding(channel, tableId, anchorId));
                tablePoints.put(tableId, new WorldProximityProperties.Point(position.x(), position.z()));
            }
        }
        bindings = List.copyOf(entries);
        proximity = new WorldProximityProperties(null, null, tablePoints);
        facilities = facilities(data.path("interactions"), map);
        JsonNode notesNode = data.path("interactions").path("notes");
        require("legacy-avatar-origin".equals(notesNode.path("heightReference").asText())
                        && "less-than-or-equal".equals(notesNode.path("radiusComparison").asText())
                        && "strict-less-than".equals(notesNode.path("heightComparison").asText()),
                "익명 메모함 판정 기준을 확인해주세요.");
        notes = new Reach(position(notesNode.path("reachPosition"), 0), positive(notesNode.path("radius")),
                positive(notesNode.path("heightTolerance")), true);
        JsonNode mailbox = data.path("interactions").path("mailbox");
        // 소리함 position은 모델 바닥이다. 기존 아바타 원점 보정은 한 번만 적용한다.
        Pose base = position(mailbox.path("position"), 0);
        feedback = new Reach(new Pose(base.x(), base.y() + 0.8, base.z(), 0),
                positive(mailbox.path("radius")), 0.7, false);
        JsonNode entrance = data.path("interactions").path("vrEntrance");
        vrEntrance = entrance.isMissingNode() ? java.util.stream.StreamSupport.stream(data.path("facilities").spliterator(), false)
                .filter(node -> "vr-experience-hall".equals(node.path("id").asText())).findFirst().map(vr -> {
                    Pose site = position(vr.path("position"), vr.path("yaw").asDouble());
                    return new Reach(new Pose(site.x() + Math.sin(site.yaw()) * 7.7, 0.8,
                            site.z() + Math.cos(site.yaw()) * 7.7, site.yaw()), 2.8, 0.9, false);
                }).orElse(null) : new Reach(pose(entrance), positive(entrance.path("radius")), 0.9, false);
        jumpCourse = data.path("jumpCourse");
        collisionData = physicsData(map);
        metadata = map.metadata();
    }

    public static PreparedParkMap load(Path mapFile, Path manifestFile, Set<String> channelIds) throws IOException {
        return new PreparedParkMap(new GeneratedParkMapLoader().load(mapFile, manifestFile), Set.copyOf(channelIds));
    }

    public JsonNode jumpCourse() { return jumpCourse.deepCopy(); }
    public JsonNode collisionData() { return collisionData.deepCopy(); }
    public WorldMapMetadata metadata() { return metadata; }
    public List<Binding> bindings() { return bindings; }
    public WorldProximityProperties proximity() { return proximity; }
    public Catalog facilities() { return facilities; }
    public Reach notes() { return notes; }
    public Reach feedback() { return feedback; }
    public java.util.Optional<Reach> vrEntrance() { return java.util.Optional.ofNullable(vrEntrance); }

    /** 명시적으로 선택한 별도 장면을 생성하며 ParkScene.load()의 기본 장면을 교체하지 않는다. */
    public ParkScene createScene() {
        return ParkScene.fromPreparedData(collisionData, metadata);
    }

    /** 반환한 좌석은 독립된 검증/향후 구성용이다. 현재 TableHub의 rooms를 변경하지 않는다. */
    public Map<String, TableRoom> createRooms() {
        var rooms = new LinkedHashMap<String, TableRoom>();
        bindings.forEach(binding -> rooms.put(binding.tableId(), new TableRoom(binding.tableId())));
        return java.util.Collections.unmodifiableMap(rooms);
    }

    /** 기존 emotes 등 추가 필드를 보존하고 bindings만 교체한다. */
    public ObjectNode bindingsDocument(ObjectNode previous) {
        ObjectNode document = previous.deepCopy();
        JsonNode existing = previous.path("bindings");
        require(existing.isMissingNode() || existing.isArray(), "기존 bindings는 배열이어야 합니다.");
        for (JsonNode entry : existing) {
            require(bindings.stream().anyMatch(binding -> binding.channelId().equals(entry.path("channelId").asText())
                            && binding.tableId().equals(entry.path("tableId").asText())
                            && binding.anchorId().equals(entry.path("anchorId").asText())),
                    "기존 테이블 ID·앵커 매핑과 다릅니다.");
        }
        document.set("bindings", new ObjectMapper().valueToTree(bindings));
        return document;
    }

    public static String serverTableId(String channelId, int number) {
        return "table-" + UUID.nameUUIDFromBytes((channelId + "\0table-" + number).getBytes(StandardCharsets.UTF_8));
    }

    public record Binding(String channelId, String tableId, String anchorId) {}

    public record Reach(Pose center, double radius, double heightTolerance, boolean strictHeight) {
        public Reach {
            require(center != null && Double.isFinite(center.x()) && Double.isFinite(center.y())
                            && Double.isFinite(center.z()) && Double.isFinite(radius) && radius > 0
                            && Double.isFinite(heightTolerance) && heightTolerance > 0,
                    "이용 위치와 반경·높이 허용값을 확인해주세요.");
        }
        public boolean contains(double x, double y, double z) {
            double height = Math.abs(y - center.y());
            return Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z)
                    && Math.hypot(x - center.x(), z - center.z()) <= radius
                    && (strictHeight ? height < heightTolerance : height <= heightTolerance);
        }
    }

    private static ObjectNode physicsData(GeneratedParkMapLoader.ValidatedMap map) throws IOException {
        JsonNode data = map.document().path("data");
        JsonNode physics = data.path("physics");
        ObjectNode root;
        try (var input = PreparedParkMap.class.getResourceAsStream("/world/park.json")) {
            if (input == null) {
                throw new IOException("기존 Java 이동 설정을 읽을 수 없습니다.");
            }
            root = (ObjectNode) new ObjectMapper().readTree(input);
        }
        // Java 이동 정책은 유지하고, 좌표/형상만 검증한 새 생성물에서 가져온다.
        ObjectNode movement = (ObjectNode) root.path("movement");
        for (String key : List.of("radius", "halfHeight", "offset")) {
            require(Math.abs(positive(physics.path("character").path(key)) - movement.path(key).asDouble()) < 1e-9,
                    "캐릭터 치수와 기존 Java 이동 설정이 다릅니다.");
        }
        root.put("sourceSha256", map.metadata().mapVersion());
        root.set("boxes", physics.path("boxes").deepCopy());
        root.set("hulls", physics.path("hulls").deepCopy());
        for (String key : List.of("furniturePolicy", "fountainPolicy", "pavilionJumpSpeed", "pavilionTunedJumpSpeed", "secretCorridor")) {
            if (physics.has(key)) root.set(key, physics.path(key).deepCopy());
        }
        if (data.has("pavilions")) root.set("pavilions", data.path("pavilions").deepCopy());
        JsonNode terrain = physics.path("terrain");
        Map<String, JsonNode> meshes = indexed(physics.path("meshes"));
        JsonNode ground = meshes.get(terrain.path("meshId").asText());
        require(ground != null && "a-c-b,b-c-d".equals(terrain.path("triangleOrder").asText()),
                "지형 메시와 삼각형 순서를 확인해주세요.");
        int columns = integer(terrain.path("columns"));
        require(columns >= 2 && columns == integer(terrain.path("rows"))
                        && ground.path("vertices").size() == (long) columns * columns * 3,
                "기존 Java 지형 판정은 정사각형 격자가 필요합니다.");
        double half = positive(terrain.path("halfSize"));
        require(Math.abs(positive(terrain.path("step")) * (columns - 1) - half * 2) < 1e-8
                        && Math.abs(positive(data.path("world").path("half")) - half) < 1e-8,
                "지형 간격과 월드 크기가 다릅니다.");
        for (int z = 0; z < columns; z++) {
            for (int x = 0; x < columns; x++) {
                int at = (z * columns + x) * 3;
                require(Math.abs(ground.path("vertices").get(at).asDouble() - (-half + x * half * 2 / (columns - 1)))
                                < 1e-6 && Math.abs(ground.path("vertices").get(at + 2).asDouble()
                                - (-half + z * half * 2 / (columns - 1))) < 1e-6,
                        "지형 정점은 Z행/X열 순서여야 합니다.");
            }
        }
        JsonNode indices = ground.path("indices");
        require(indices.size() == (long) (columns - 1) * (columns - 1) * 6, "지형 삼각형 개수가 다릅니다.");
        int index = 0;
        for (int z = 0; z < columns - 1; z++) {
            for (int x = 0; x < columns - 1; x++) {
                int a = z * columns + x;
                for (int expected : new int[] {a, a + columns, a + 1, a + 1, a + columns, a + columns + 1}) {
                    require(indices.get(index++).intValue() == expected, "지형 삼각형 배열 순서가 다릅니다.");
                }
            }
        }
        var ordered = root.putArray("meshes");
        ObjectNode collisionGround = ground.deepCopy();
        if (physics.has("secretTerrainCuts")) {
            JsonNode cuts = physics.path("secretTerrainCuts");
            require(cuts.isArray(), "비밀통로 지형 절개 목록이 필요합니다.");
            Set<Integer> skipped = new HashSet<>();
            for (JsonNode cut : cuts) {
                int face = integer(cut);
                require(face >= 0 && face < indices.size() / 3 && skipped.add(face), "비밀통로 지형 절개가 올바르지 않습니다.");
            }
            var kept = collisionGround.putArray("indices");
            for (int i = 0; i < indices.size(); i++) {
                if (!skipped.contains(i / 3)) kept.add(indices.get(i));
            }
        }
        ordered.add(collisionGround);
        meshes.values().stream().filter(mesh -> mesh != ground).forEach(mesh -> ordered.add(mesh.deepCopy()));
        ((ObjectNode) root.path("world")).put("halfSize", half);
        var spawn = root.putObject("spawn");
        spawn.set("first", physics.path("spawn").path("position").deepCopy());
        spawn.put("spacing", 1.35);
        spawn.put("yaw", physics.path("spawn").path("yaw").asDouble());
        JsonNode lake = data.path("surfaces").path("lake");
        var water = root.putObject("lake");
        for (String key : List.of("x", "z", "surfaceY")) {
            water.put(key, number(lake.path(key)));
        }
        water.put("radiusX", positive(lake.path("rx")));
        water.put("radiusZ", positive(lake.path("rz")));
        water.put("depth", positive(lake.path("depth")));
        ((ObjectNode) root.path("swimming")).put("depthThreshold", positive(lake.path("swimmingThreshold")));
        JsonNode tower = physics.path("tower");
        number(tower.path("x"));
        number(tower.path("z"));
        double inner = positive(tower.path("inner"));
        require(positive(tower.path("outer")) > inner && integer(tower.path("turns")) > 0,
                "전망대 반경과 회전 수가 올바르지 않습니다.");
        require(Math.abs(number(tower.path("surfaceOffset")) + positive(tower.path("height"))
                        - number(tower.path("topY"))) < 1e-8, "전망대 상단 높이가 일치하지 않습니다.");
        positive(tower.path("jumpSpeed"));
        root.set("tower", tower.deepCopy());
        Map<String, JsonNode> hulls = indexed(physics.path("hulls"));
        Map<String, JsonNode> stones = indexed(physics.path("steppingStones"));
        for (var entry : stones.entrySet()) {
            JsonNode stone = entry.getValue();
            JsonNode hull = hulls.get(entry.getKey());
            require(hull != null, "디딤돌에 대응하는 충돌 hull이 없습니다.");
            double[] min = {Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY};
            double[] max = {Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY};
            var vertices = hull.path("vertices");
            for (int i = 0; i < vertices.size(); i++) {
                min[i % 3] = Math.min(min[i % 3], vertices.get(i).doubleValue());
                max[i % 3] = Math.max(max[i % 3], vertices.get(i).doubleValue());
            }
            Map<String, Double> expected = Map.of("x", (min[0] + max[0]) / 2, "z", (min[2] + max[2]) / 2,
                    "width", max[0] - min[0], "depth", max[2] - min[2], "bottom", min[1], "top", max[1],
                    "height", max[1] - min[1]);
            expected.forEach((key, value) -> require(Math.abs(number(stone.path(key)) - value) < 1e-6,
                    "디딤돌 보조 정보와 충돌 hull이 다릅니다: " + key));
        }
        // 보조 정보만 연결한다. 충돌체는 위 hulls에서 정확히 한 번 생성한다.
        root.set("steppingStones", physics.path("steppingStones").deepCopy());
        return root;
    }

    private static Catalog facilities(JsonNode interactions, GeneratedParkMapLoader.ValidatedMap map)
            throws IOException {
        Catalog previous;
        try (var input = PreparedParkMap.class.getResourceAsStream("/world/facilities.json")) {
            if (input == null) {
                throw new IOException("기존 망원경 사용 설정을 읽을 수 없습니다.");
            }
            previous = new ObjectMapper().readValue(input, Catalog.class);
        }
        var definitions = new ArrayList<Definition>();
        Set<String> ids = new HashSet<>();
        for (String group : List.of("benches", "fitness", "telescopes")) {
            JsonNode items = interactions.path(group);
            require(items.isArray(), "시설 이용 정보 배열이 필요합니다.");
            for (JsonNode item : items) {
                String id = item.path("id").asText();
                require(!id.isBlank() && ids.add(id), "시설 ID가 비었거나 중복되었습니다.");
                String kind = switch (group) {
                    case "benches" -> "BENCH";
                    case "fitness" -> "FITNESS";
                    default -> "TELESCOPE";
                };
                require(kind.equals(item.path("kind").asText()), "시설 종류가 일치하지 않습니다.");
                Pose center = position(item.path("position"), number(item.path("yaw")));
                center = new Pose(center.x(), center.y() + 0.8, center.z(), center.yaw());
                var seats = new ArrayList<Pose>();
                Pose exit;
                if (group.equals("benches")) {
                    JsonNode benchSeats = item.path("seats");
                    require(benchSeats.isArray() && !benchSeats.isEmpty(), "벤치 좌석이 필요합니다.");
                    exit = pose(benchSeats.get(0).path("exit"));
                    for (int i = 0; i < benchSeats.size(); i++) {
                        JsonNode seat = benchSeats.get(i);
                        require(integer(seat.path("seatIndex")) == i && pose(seat.path("exit")).equals(exit),
                                "벤치 좌석 순서와 공통 하차 위치를 확인해주세요.");
                        seats.add(pose(seat.path("use")));
                    }
                } else {
                    seats.add(pose(item.path("use")));
                    exit = pose(item.path("exit"));
                }
                definitions.add(new Definition(id, kind, center, positive(item.path("radius")),
                        positive(item.path("heightTolerance")), List.copyOf(seats), exit));
            }
        }
        require(!definitions.isEmpty(), "이용 가능한 시설이 없습니다.");
        definitions.sort(Comparator.comparing(Definition::facilityId));
        return new Catalog(map.metadata().mapVersion(), map.fileSha256(), previous.aimIntervalMs(),
                previous.minPitch(), previous.maxPitch(), previous.initialPitch(), List.copyOf(definitions), List.of());
    }

    private static Map<String, JsonNode> indexed(JsonNode items) {
        require(items.isArray(), "ID가 있는 배열이 필요합니다.");
        var result = new LinkedHashMap<String, JsonNode>();
        for (JsonNode item : items) {
            JsonNode id = item.path("id");
            require(id.isTextual() && !id.asText().isBlank() && result.putIfAbsent(id.asText(), item) == null,
                    "ID가 비었거나 중복되었습니다.");
        }
        return result;
    }

    private static Pose position(JsonNode array, double yaw) {
        require(array.isArray() && array.size() == 3, "XYZ 좌표가 필요합니다.");
        return new Pose(number(array.get(0)), number(array.get(1)), number(array.get(2)), yaw);
    }

    private static Pose pose(JsonNode node) {
        return new Pose(number(node.path("x")), number(node.path("y")), number(node.path("z")),
                number(node.path("yaw")));
    }

    private static int integer(JsonNode node) {
        require(node.isIntegralNumber() && node.canConvertToInt(), "정수가 필요합니다.");
        return node.intValue();
    }

    private static double positive(JsonNode node) {
        double value = number(node);
        require(value > 0, "양수인 치수가 필요합니다.");
        return value;
    }

    private static double number(JsonNode node) {
        require(node.isNumber() && Double.isFinite(node.doubleValue()), "유한한 숫자가 필요합니다.");
        return node.doubleValue();
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
