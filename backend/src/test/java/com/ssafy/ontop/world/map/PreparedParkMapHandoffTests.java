package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldProximity;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
class PreparedParkMapHandoffTests {
    private final Path input = Path.of(System.getenv("TEST_GENERATED_MAP_DIR"));
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 실제_전달본의_테이블과_물리좌표를_조립해도_기본맵은_그대로다() throws Exception {
        var before = ParkScene.load().metadata();
        var park = load(Set.of("channel-1", "channel-2"));
        JsonNode source = mapper.readTree(input.resolve("server-map.json").toFile()).path("data");
        JsonNode converted = park.collisionData();

        assertThat(park.createRooms()).hasSize(32);
        assertThat(converted.path("boxes")).isEqualTo(source.path("physics").path("boxes"));
        assertThat(converted.path("hulls")).isEqualTo(source.path("physics").path("hulls"));
        assertThat(converted.path("steppingStones")).isEqualTo(source.path("physics").path("steppingStones"));
        assertThat(converted.path("meshes").size()).isEqualTo(source.path("physics").path("meshes").size());
        assertThat(converted.path("tower")).isEqualTo(source.path("physics").path("tower"));
        assertThat(park.facilities().facilities()).hasSize(source.path("interactions").path("benches").size()
                + source.path("interactions").path("fitness").size()
                + source.path("interactions").path("telescopes").size());
        assertThat(park.notes().center().y()).isEqualTo(source.path("interactions").path("notes")
                .path("reachPosition").get(1).doubleValue());
        assertThat(park.facilities().mapVersion()).isEqualTo(park.metadata().mapVersion());
        assertThat(ParkScene.load().metadata()).isEqualTo(before);
        assertThat(before.schemaVersion()).isEqualTo(1);
    }

    @Test
    void 신규_16번_테이블_관전은_해당_채널의_새좌표_20m를_기준으로_검사한다() throws Exception {
        var park = load(Set.of("channel-1", "channel-2"));
        var registry = mock(WorldChannelRegistry.class);
        var proximity = new WorldProximity(registry, park.proximity());
        var binding = park.bindings().get(15);
        var point = park.proximity().tables().get(binding.tableId());
        when(registry.channelOf("101")).thenReturn("channel-1");
        when(registry.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(
                0, point.x() + 20, 0.84, point.z(), 0, false, false, false));

        assertThat(proximity.canWatch("101", binding.tableId(), "channel-1")).isTrue();
        assertThat(proximity.canWatch("101", binding.tableId(), "channel-2")).isFalse();
        when(registry.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(
                0, point.x() + 20.01, 0.84, point.z(), 0, false, false, false));
        assertThat(proximity.canWatch("101", binding.tableId(), "channel-1")).isFalse();
    }

    @Test
    void 프론트에_전달할_환경별_매핑을_기존_필드와_ID를_보존해_생성한다() throws Exception {
        for (String environment : new String[] {"dev", "frontend-test"}) {
            Set<String> channels = environment.equals("dev") ? Set.of("channel-1") : Set.of("channel-1", "channel-2");
            var park = load(channels);
            String name = "park-bindings." + environment + ".json";
            ObjectNode previous = (ObjectNode) mapper.readTree(input.resolve(name).toFile());
            ObjectNode generated = park.bindingsDocument(previous);
            assertThat(generated.path("emotes")).isEqualTo(previous.path("emotes"));
            assertThat(generated.path("bindings").size()).isEqualTo(channels.size() * 16);
            assertThat(park.bindingsDocument(generated)).isEqualTo(generated);
            assertThat(mapper.readTree(Path.of("..", "docs", "integration", "park-180", name).toFile()))
                    .isEqualTo(generated);
            // 빌드 산출물만 쓴다. frontend/public과 기존 서버 resources는 변경하지 않는다.
            Path output = Path.of("build", "park-prepared", name);
            Files.createDirectories(output.getParent());
            Files.writeString(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated) + "\n");
        }
    }

    private PreparedParkMap load(Set<String> channels) throws Exception {
        return PreparedParkMap.load(input.resolve("server-map.json"), input.resolve("manifest.json"), channels);
    }
}
