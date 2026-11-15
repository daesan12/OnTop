package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleParkExitTests {
    @Test
    void 전용_테이블_앞의_입장_반경만_넓히고_위아래층은_제외한다() throws Exception {
        var path = Path.of("../frontend/generated/park-renewal");
        var park = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));

        assertThat(park.canEnterStoneRumble(7.2, 22.885, -58.2)).isTrue();
        assertThat(park.canEnterStoneRumble(7.2, 22.885, -57.9)).isFalse();
        assertThat(park.canEnterStoneRumble(7.2, 24.685, -58.2)).isFalse();
    }

    @Test
    void 여덟_참가자가_같은_입구에서_착석해도_다른_위치에_복귀하고_걸어서_나온다() throws Exception {
        var path = Path.of("../frontend/generated/park-renewal");
        var park = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));
        var clock = new AtomicLong(1_000_000_000L);
        var world = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 16))), Duration.ofMillis(1),
                clock::get, park.createScene());
        try {
            var ids = IntStream.rangeClosed(1, 8).mapToObj(Integer::toString).toList();
            for (String id : ids) {
                world.join(id, "channel-1");
                world.releaseFacility(id, new WorldFacilityService.Pose(0, 22.885, -63, 0));
            }
            world.tables("channel-1", List.of(new WorldChannelRegistry.PublicTable("table", "table-17", 8, "STONE_RUMBLE")));
            clock.addAndGet(WorldPhysics.STEP_NANOS);
            world.advance(Set.copyOf(ids));
            for (int i = 0; i < ids.size(); i++) {
                world.placeTableExit(ids.get(i), i + 1, park.stoneRumbleExits());
            }
            var exits = ids.stream().map(world::positionOf).toList();
            assertThat(exits).allSatisfy(exit -> assertThat(exit.z()).isBetween(-59.61, -58.19));
            for (int i = 0; i < exits.size(); i++) {
                var a = exits.get(i);
                for (var b : exits.subList(i + 1, exits.size())) {
                    assertThat(Math.hypot(a.x() - b.x(), a.z() - b.z())).isGreaterThan(1.19);
                }
            }
            for (int frame = 1; frame <= 24; frame++) {
                for (String id : ids) {
                    world.input(id, new MoveInput(frame, 0, 1, false, false));
                }
                clock.addAndGet(WorldPhysics.STEP_NANOS);
                world.advance(Set.of());
            }
            for (int i = 0; i < ids.size(); i++) {
                assertThat(world.positionOf(ids.get(i)).z()).isGreaterThan(exits.get(i).z() + 1);
            }
        } finally {
            world.clear();
        }
    }
}
