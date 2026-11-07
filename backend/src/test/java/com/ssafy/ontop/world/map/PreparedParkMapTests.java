package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PreparedParkMapTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path directory;

    @Test
    void 별도_네이티브_장면의_스폰과_이동을_검사해도_기본장면은_바뀌지_않는다() throws Exception {
        var original = ParkScene.load().metadata();
        var park = load(fixture(), Set.of("channel-1"));
        try (var physics = new WorldPhysics(park.createScene())) {
            physics.add("101");
            assertThat(physics.snapshot("101").z()).isEqualTo(82);
            assertThat(physics.snapshot("101").yaw()).isCloseTo(3.14, org.assertj.core.data.Offset.offset(0.001));
            long tick = 0;
            for (int i = 0; i < 30; i++) {
                physics.step(++tick * WorldPhysics.STEP_NANOS, Set.of());
            }
            double before = physics.snapshot("101").x();
            for (int i = 0; i < 30; i++) {
                long now = ++tick * WorldPhysics.STEP_NANOS;
                physics.input("101", new MoveInput(i + 1, 1, 0, false, false), now);
                physics.step(now, Set.of());
            }
            assertThat(physics.snapshot("101").x() - before)
                    .isCloseTo(6.25, org.assertj.core.data.Offset.offset(0.1));
        }
        assertThat(ParkScene.load().metadata()).isEqualTo(original);
    }

    @Test
    void 채널마다_16개_테이블을_조립하고_기존_ID를_유지한다() throws Exception {
        var park = load(fixture(), Set.of("channel-1", "channel-2"));

        assertThat(park.bindings()).hasSize(32);
        assertThat(park.bindings()).extracting(PreparedParkMap.Binding::tableId).doesNotHaveDuplicates();
        assertThat(park.bindings().get(0).tableId()).isEqualTo("table-6fcc18fe-a301-3142-a69f-f3f67d026d62");
        assertThat(park.bindings().get(1).tableId()).isEqualTo("table-69d1811f-c44e-32d4-bf72-1f4ebe5fb0dd");
        assertThat(park.bindings().get(16).tableId()).isEqualTo("table-c07ae818-2248-3150-8970-820b5529dfb7");
        assertThat(park.bindings().get(17).tableId()).isEqualTo("table-ce87bea5-89c6-3892-b08e-489bcbef8533");
        assertThat(park.proximity().tables()).hasSize(32);
        assertThat(park.proximity().chatRadius()).isEqualTo(50);
        assertThat(park.proximity().watchRadius()).isEqualTo(20);
        assertThat(park.proximity().tables().get(park.bindings().get(15).tableId()).x()).isEqualTo(16);
    }

    @Test
    void 테이블이_18개로_늘어도_기존_16개_ID와_매핑을_유지한다() throws Exception {
        var previous = load(fixture(), Set.of("channel-1", "channel-2"));
        ObjectNode source = fixture();
        var tables = (com.fasterxml.jackson.databind.node.ArrayNode) source.path("data").path("tables");
        for (int number = 17; number <= 18; number++) {
            tables.addObject().put("id", "table-" + number).putArray("position")
                    .add(-53).add(0.1).add(number == 17 ? -8 : 2);
        }
        JsonNode first = tables.remove(0);
        tables.add(first);
        var expanded = load(source, Set.of("channel-1", "channel-2"));
        var oldDocument = mapper.createObjectNode();
        oldDocument.putArray("emotes").add("FART");
        oldDocument.set("bindings", mapper.valueToTree(previous.bindings()));

        assertThat(expanded.bindings()).hasSize(36).containsAll(previous.bindings());
        assertThat(expanded.bindings()).extracting(PreparedParkMap.Binding::tableId).doesNotHaveDuplicates();
        assertThat(expanded.createRooms()).hasSize(36);
        assertThat(expanded.proximity().tables().get(PreparedParkMap.serverTableId("channel-1", 17)))
                .isEqualTo(new com.ssafy.ontop.world.config.WorldProximityProperties.Point(-53.0, -8.0));
        assertThat(expanded.proximity().tables().get(PreparedParkMap.serverTableId("channel-2", 18)))
                .isEqualTo(new com.ssafy.ontop.world.config.WorldProximityProperties.Point(-53.0, 2.0));
        assertThat(expanded.bindingsDocument(oldDocument).path("emotes")).isEqualTo(oldDocument.path("emotes"));
        assertThat(expanded.bindingsDocument(oldDocument).path("bindings").size()).isEqualTo(36);
    }

    @Test
    void 조립한_좌석은_채널과_다른_구성에_영향_없이_게임선택과_준비를_처리한다() throws Exception {
        var park = load(fixture(), Set.of("channel-1", "channel-2"));
        var rooms = park.createRooms();
        var room = rooms.get(park.bindings().get(15).tableId());

        assertThat(room.join("101")).isTrue();
        room.selectGame(TableGame.OMOK);
        assertThat(room.join("102")).isTrue();
        room.setReady("101", true);
        room.setReady("102", true);

        assertThat(room.snapshot().seats()).allMatch(seat -> seat.ready());
        assertThat(rooms.get(park.bindings().get(31).tableId()).snapshot().seats())
                .allMatch(seat -> seat.userId() == null);
        assertThat(park.createRooms().get(park.bindings().get(15).tableId()).snapshot().seats())
                .allMatch(seat -> seat.userId() == null);
    }

    @Test
    void 충돌체를_복제하지_않고_지형을_첫_메시로_정렬한다() throws Exception {
        ObjectNode source = fixture();
        var park = load(source, Set.of("channel-1"));
        JsonNode data = park.collisionData();

        assertThat(data.path("hulls").size()).isEqualTo(1);
        assertThat(data.path("boxes").size()).isZero();
        assertThat(data.path("steppingStones").size()).isEqualTo(1);
        assertThat(data.path("meshes").get(0).path("id").asText()).isEqualTo("terrain");
        assertThat(data.path("world").path("halfSize").asDouble()).isEqualTo(90);
        assertThat(data.path("tower").path("surfaceOffset").asDouble()).isEqualTo(0.12);
        assertThat(data.path("spawn").path("first").get(2).asDouble()).isEqualTo(82);
        assertThat(data.path("movement").path("walkSpeed").asDouble()).isEqualTo(6.25);
        ((ObjectNode) data).put("sourceSha256", "changed");
        assertThat(park.collisionData().path("sourceSha256").asText()).isEqualTo(park.metadata().mapVersion());
    }

    @Test
    void 익명메모는_도달좌표에_높이를_또_더하지_않고_높이경계를_제외한다() throws Exception {
        var park = load(fixture(), Set.of("channel-1"));
        var reach = park.notes();

        assertThat(reach.center().y()).isEqualTo(18.92);
        assertThat(reach.contains(60.5, 18.92, 54.5)).isTrue();
        assertThat(reach.contains(60.5, 18.92 + 0.71, 54.5)).isFalse();
        assertThat(reach.contains(60.5 + 2.61, 18.92, 54.5)).isFalse();
        var exact = new PreparedParkMap.Reach(new WorldFacilityService.Pose(0, 0, 0, 0), 2.6, 0.7, true);
        assertThat(exact.contains(2.6, 0.699, 0)).isTrue();
        assertThat(exact.contains(0, 0.7, 0)).isFalse();
        assertThat(park.feedback().center().y()).isEqualTo(0.8);
    }

    @Test
    void 새_좌표로_시설을_이용하고_해제하며_기존_카탈로그를_쓰지_않는다() throws Exception {
        var park = load(fixture(), Set.of("channel-1"));
        var service = new WorldFacilityService(park.facilities(), Clock.systemUTC(), System::nanoTime);
        var position = new com.ssafy.ontop.world.service.WorldChannelRegistry.Position(
                0, 20, 0.8, 30, 0, false, false, false);

        var lease = service.use("101", "channel-1", "use-1", "bench-new", 0, position);

        assertThat(lease.pose().x()).isEqualTo(20);
        assertThat(service.state("channel-1").mapVersion()).isEqualTo(park.metadata().mapVersion());
        assertThat(service.state("channel-2").occupancies()).isEmpty();
        service.release("101");
        assertThat(service.state("channel-1").occupancies()).isEmpty();
    }

    @Test
    void 기존_매핑과_감정표현을_보존하고_충돌하는_매핑은_거절한다() throws Exception {
        var park = load(fixture(), Set.of("channel-1"));
        ObjectNode previous = mapper.createObjectNode();
        previous.putArray("emotes").add("WAVE");
        previous.set("bindings", mapper.valueToTree(park.bindings().subList(0, 2)));

        ObjectNode document = park.bindingsDocument(previous);

        assertThat(document.path("bindings").size()).isEqualTo(16);
        assertThat(document.path("emotes")).isEqualTo(previous.path("emotes"));
        assertThat(previous.path("bindings").size()).isEqualTo(2);
        ((ObjectNode) previous.path("bindings").get(0)).put("tableId", "wrong-existing-id");
        assertThatThrownBy(() -> park.bindingsDocument(previous)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 앵커_누락과_중복_또는_빈_채널은_실패한다() throws Exception {
        ObjectNode map = fixture();
        var tables = (com.fasterxml.jackson.databind.node.ArrayNode) map.path("data").path("tables");
        tables.remove(7);
        assertThatThrownBy(() -> load(map, Set.of("channel-1"))).isInstanceOf(IllegalArgumentException.class);
        tables.add(tables.get(0).deepCopy());
        assertThatThrownBy(() -> load(map, Set.of("channel-1"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> load(fixture(), Set.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 지형격자와_전망대높이와_디딤돌_불일치를_거절한다() throws Exception {
        for (String kind : new String[] {"terrain", "indices", "tower", "stone", "notes"}) {
            ObjectNode map = fixture();
            JsonNode physics = map.path("data").path("physics");
            switch (kind) {
                case "terrain" -> ((ObjectNode) physics.path("terrain")).put("columns", 3);
                case "indices" -> ((ObjectNode) physics.path("meshes").get(0))
                        .putArray("indices").add(0).add(1).add(2).add(1).add(2).add(3);
                case "tower" -> ((ObjectNode) physics.path("tower")).put("topY", 19);
                case "stone" -> ((ObjectNode) physics.path("steppingStones").get(0)).put("width", 9);
                default -> ((ObjectNode) map.path("data").path("interactions").path("notes"))
                        .put("heightReference", "feet");
            }
            assertThatThrownBy(() -> load(map, Set.of("channel-1"))).isInstanceOf(IllegalArgumentException.class);
        }
    }

    private PreparedParkMap load(ObjectNode map, Set<String> channels) throws Exception {
        byte[] bytes = mapper.writeValueAsBytes(map);
        ObjectNode manifest = mapper.createObjectNode();
        manifest.put("format", "ontop.park-map-manifest").put("hashAlgorithm", "sha256");
        manifest.put("mapId", "park").put("schemaVersion", 2).put("mapVersion", "a".repeat(64));
        manifest.putArray("artifacts").addObject().put("path", "generated/park/server-map.json")
                .put("bytes", bytes.length).put("sha256",
                        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        Path file = Files.write(directory.resolve("server-map.json"), bytes);
        Path manifestFile = Files.write(directory.resolve("manifest.json"), mapper.writeValueAsBytes(manifest));
        return PreparedParkMap.load(file, manifestFile, channels);
    }

    private ObjectNode fixture() throws Exception {
        ObjectNode root = (ObjectNode) mapper.readTree("""
                {"format":"ontop.park-map","mapId":"park","schemaVersion":2,"data":{
                "world":{"half":90},"tables":[],"surfaces":{"lake":{"x":62,"z":-14,"rx":18,"rz":43,
                "surfaceY":0.045,"depth":2.8,"swimmingThreshold":0.95}},"physics":{
                "units":"m","upAxis":"Y","coordinateSpace":"world","playerInflation":0,"collisionMargin":0,
                "character":{"radius":0.3,"halfHeight":0.48,"offset":0.02},
                "spawn":{"origin":"capsule-center","position":[0,0.84,82],"yaw":3.14},
                "boxes":[],"meshes":[{"id":"terrain","role":"terrain",
                "vertices":[-90,0,-90,90,0,-90,-90,0,90,90,0,90],"indices":[0,2,1,1,2,3]}],
                "hulls":[{"id":"stone","role":"surface","vertices":[0,0,0,2,0,0,0,1,2,2,1,2]}],
                "terrain":{"meshId":"terrain","triangleOrder":"a-c-b,b-c-d","columns":2,"rows":2,
                "halfSize":90,"step":180},"tower":{"x":62,"z":56,"inner":5,"outer":8,"height":18,
                "turns":3,"surfaceOffset":0.12,"topY":18.12,"jumpSpeed":7.8},
                "steppingStones":[{"id":"stone","x":1,"z":1,"width":2,"depth":2,"bottom":0,"top":1,"height":1}]},
                "interactions":{"notes":{"reachPosition":[60.5,18.92,54.5],"radius":2.6,"heightTolerance":0.7,
                "heightReference":"legacy-avatar-origin","radiusComparison":"less-than-or-equal",
                "heightComparison":"strict-less-than"},"mailbox":{"position":[-18,0,18],"radius":2.6},
                "benches":[{"id":"bench-new","kind":"BENCH","position":[20,0,30],"yaw":0,"radius":3,
                "heightTolerance":0.7,"seats":[{"seatIndex":0,"use":{"x":20,"y":0.8,"z":30,"yaw":0},
                "exit":{"x":20,"y":0.8,"z":32,"yaw":0}}]}],"fitness":[],"telescopes":[]}}}
                """);
        root.put("mapVersion", "a".repeat(64));
        var tables = (com.fasterxml.jackson.databind.node.ArrayNode) root.path("data").path("tables");
        for (int i = 1; i <= 16; i++) {
            tables.addObject().put("id", "table-" + i).putArray("position").add(i).add(0).add(i);
        }
        return root;
    }
}
