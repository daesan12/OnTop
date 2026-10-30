package com.ssafy.ontop.world.map;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import com.ssafy.ontop.world.service.WorldMapCompatibility;
import com.ssafy.ontop.world.service.WorldProximity;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
class GeneratedWorldMapRuntimeTests {
    @TempDir
    Path temporary;

    @Test
    void 명시적으로_선택한_장면과_모든_테이블이_같은_버전을_사용한다() {
        selected(input().resolve("server-map.json"), input().resolve("manifest.json")).run(context -> {
            assertThat(context).hasNotFailed();
            var runtime = context.getBean(WorldMapRuntime.class);
            var maps = context.getBean(WorldMapCompatibility.class);
            var channels = context.getBean(WorldChannelRegistry.class);
            assertThat(runtime.prepared()).isPresent();
            assertThat(maps.metadata()).isEqualTo(runtime.scene().metadata());
            assertThat(channels.mapMetadata()).isEqualTo(maps.metadata());
            assertThat(maps.metadata().schemaVersion()).isEqualTo(2);
            assertThat(maps.requiresMatch()).isTrue();
            int tableCount = runtime.prepared().orElseThrow().bindings().size();
            assertThat(context.getBean(TableHub.class).listTables("channel-1").tables()).hasSize(tableCount);
            String table = PreparedParkMap.serverTableId("channel-1", tableCount);
            var point = runtime.prepared().orElseThrow().proximity().tables().get(table);
            channels.join("101", "channel-1");
            channels.holdFacility("101", new Pose(point.x() + 19, 0.84, point.z(), 0));
            assertThat(context.getBean(WorldProximity.class).canWatch("101", table, "channel-1")).isTrue();
            assertThat(ParkScene.load().metadata().schemaVersion()).isEqualTo(1);
        });
    }

    @Test
    void 새맵은_채널_설정이_없으면_기본_데모_테이블로_대체하지_않는다() {
        WorldMapRuntimeConfigurationTests.runner().withPropertyValues(
                "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
                "ontop.world.map.json-path=" + input().resolve("server-map.json").toAbsolutePath(),
                "ontop.world.map.manifest-path=" + input().resolve("manifest.json").toAbsolutePath())
                .run(context -> assertThat(context).hasFailed().getFailure().rootCause()
                        .hasMessageContaining("채널 목록"));
    }

    @Test
    void 생성물의_원본_바이트가_바뀌면_서버_구성을_완료하지_않는다() throws Exception {
        byte[] map = Files.readAllBytes(input().resolve("server-map.json"));
        byte[] modified = java.util.Arrays.copyOf(map, map.length + 1);
        modified[modified.length - 1] = ' ';
        Path changed = Files.write(temporary.resolve("server-map.json"), modified);

        selected(changed, input().resolve("manifest.json"))
                .run(context -> assertThat(context).hasFailed().getFailure().rootCause()
                        .hasMessageContaining("바이트 수"));
    }

    private WebApplicationContextRunner selected(Path map, Path manifest) {
        return WorldMapRuntimeConfigurationTests.runner().withPropertyValues(
                "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
                "ontop.world.map.json-path=" + map.toAbsolutePath(),
                "ontop.world.map.manifest-path=" + manifest.toAbsolutePath(),
                "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=새맵검증",
                "ontop.world.channels[0].capacity=4");
    }

    private Path input() { return Path.of(System.getenv("TEST_GENERATED_MAP_DIR")); }
}
