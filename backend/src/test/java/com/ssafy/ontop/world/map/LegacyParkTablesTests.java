package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldProximity;
import java.util.Map;
import java.util.Set;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LegacyParkTablesTests {

    @Test
    void 현재맵의_16개_앵커는_기존ID를_유지하며_채널마다_독립된다() {
        var tables = LegacyParkTables.from(ParkScene.load(), Set.of("channel-1", "channel-2"));
        assertThat(tables.entries()).hasSize(32);
        assertThat(tables.entries()).extracting(LegacyParkTables.Entry::tableId).doesNotHaveDuplicates();
        var one = tables.entries().stream().filter(row -> row.channelId().equals("channel-1")).toList();
        assertThat(one.get(0).tableId()).isEqualTo("table-6fcc18fe-a301-3142-a69f-f3f67d026d62");
        assertThat(one.get(1).tableId()).isEqualTo("table-69d1811f-c44e-32d4-bf72-1f4ebe5fb0dd");
        assertThat(one.get(0).x()).isEqualTo(-10);
        assertThat(one.get(0).z()).isEqualTo(18);
        assertThat(one.get(15).anchorId()).isEqualTo("table-16");
        assertThat(one.get(15).x()).isEqualTo(24);
        assertThat(one.get(15).z()).isEqualTo(61);
    }

    @Test
    void 모든테이블의_관전좌표는_20미터_경계와_채널을_검사한다() {
        var tables = LegacyParkTables.from(ParkScene.load(), Set.of("channel-1", "channel-2"));
        var channels = mock(WorldChannelRegistry.class);
        var proximity = new WorldProximity(channels, tables.proximity(new WorldProximityProperties(null, null, null)));
        for (var table : tables.entries()) {
            when(channels.channelOf("viewer")).thenReturn(table.channelId());
            when(channels.positionOf("viewer")).thenReturn(
                    new WorldChannelRegistry.Position(1, table.x() + 20, table.y(), table.z(), 0));
            assertThat(proximity.canWatch("viewer", table.tableId(), table.channelId())).isTrue();
            when(channels.positionOf("viewer")).thenReturn(
                    new WorldChannelRegistry.Position(2, table.x() + 20.01, table.y(), table.z(), 0));
            assertThat(proximity.canWatch("viewer", table.tableId(), table.channelId())).isFalse();
            when(channels.positionOf("viewer")).thenReturn(
                    new WorldChannelRegistry.Position(3, table.x(), table.y(), table.z(), 0));
            String otherChannel = table.channelId().equals("channel-1") ? "channel-2" : "channel-1";
            assertThat(proximity.canWatch("viewer", table.tableId(), otherChannel)).isFalse();
        }
        assertThat(proximity.canWatch("viewer", "missing", "channel-1")).isFalse();
    }

    @Test
    void 명시한_거리검증_좌표와_반경은_유지한다() {
        var tables = LegacyParkTables.from(ParkScene.load(), Set.of("channel-1"));
        String id = tables.entries().getFirst().tableId();
        var explicit = new WorldProximityProperties.Point(1.0, 2.0);
        var properties = tables.proximity(new WorldProximityProperties(10.0, 12.0, Map.of(id, explicit)));
        assertThat(properties.chatRadius()).isEqualTo(10);
        assertThat(properties.watchRadius()).isEqualTo(12);
        assertThat(properties.tables().get(id)).isEqualTo(explicit);
        assertThat(properties.tables()).hasSize(16);
    }

    @Test
    void 프론트_대응표는_서버등록_ID와_현재맵_좌표에_일치한다() throws Exception {
        var scene = ParkScene.load();
        var mapper = new ObjectMapper();
        for (String profile : java.util.List.of("dev", "frontend-test")) {
            Set<String> channels = profile.equals("dev") ? Set.of("channel-1") : Set.of("channel-1", "channel-2");
            var expected = LegacyParkTables.from(scene, channels).entries();
            var document = mapper.readTree(Path.of("../docs/integration/legacy-tables/bindings." + profile + ".json")
                    .toFile());
            assertThat(document.path("mapVersion").asText()).isEqualTo(scene.metadata().mapVersion());
            assertThat(document.path("bindings").size()).isEqualTo(expected.size());
            for (int index = 0; index < expected.size(); index++) {
                var actual = document.path("bindings").get(index);
                var row = expected.get(index);
                assertThat(actual.path("channelId").asText()).isEqualTo(row.channelId());
                assertThat(actual.path("tableId").asText()).isEqualTo(row.tableId());
                assertThat(actual.path("anchorId").asText()).isEqualTo(row.anchorId());
                assertThat(actual.path("x").asDouble()).isEqualTo(row.x());
                assertThat(actual.path("y").asDouble()).isEqualTo(row.y());
                assertThat(actual.path("z").asDouble()).isEqualTo(row.z());
                assertThat(actual.path("watchRadius").asDouble()).isEqualTo(20);
            }
        }
    }
}
