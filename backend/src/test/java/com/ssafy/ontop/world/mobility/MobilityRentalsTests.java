package com.ssafy.ontop.world.mobility;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MobilityRentalsTests {
    private final MobilityWallet wallet = mock(MobilityWallet.class);

    @Test
    void 정문에서_자전거와_킥보드의_상호작용_범위를_따로_판정한다() throws Exception {
        var stations = new ObjectMapper().readTree("""
                [{"id":"mobility-entry","reachPosition":[-6.85,4.885,86.5],
                  "yaw":-1.57,"radius":3,"heightTolerance":0.7}]
                """);
        var mapRentals = new MobilityRentals(wallet, stations);
        var bicycleSide = new Position(0, -6.85, 4.885, 84.8, 0);

        assertThat(mapRentals.inReach("mobility-entry", VehicleKind.BICYCLE, bicycleSide)).isTrue();
        assertThat(mapRentals.inReach("mobility-entry", VehicleKind.SCOOTER, bicycleSide)).isFalse();
        assertThat(mapRentals.inReach("unknown", VehicleKind.BICYCLE, bicycleSide)).isFalse();
    }

    @Test
    void 리뉴얼_맵의_여덟_대여소에서_각_거치대의_접근_위치를_구분한다() throws Exception {
        var directory = Path.of("..", "frontend", "generated", "park-renewal");
        var map = PreparedParkMap.load(directory.resolve("server-map.json"),
                directory.resolve("manifest.json"), Set.of("channel-1"));
        var sites = map.constructionSites();
        var mapRentals = new MobilityRentals(wallet, sites);
        var expected = Set.of("mobility-entry", "mobility-plaza", "mobility-rest", "mobility-west",
                "mobility-north", "mobility-lake", "mobility-fitness", "mobility-hill");
        Set<String> checked = new HashSet<>();

        for (var site : sites) {
            String id = site.path("id").asText();
            if (!id.startsWith("mobility-")) {
                continue;
            }
            checked.add(id);
            var reach = site.path("reachPosition");
            double yaw = site.path("yaw").asDouble();
            for (var vehicle : VehicleKind.values()) {
                double side = vehicle == VehicleKind.BICYCLE ? -1.7 : 1.7;
                double x = reach.get(0).asDouble() + side * Math.cos(yaw);
                double y = reach.get(1).asDouble();
                double z = reach.get(2).asDouble() - side * Math.sin(yaw);
                var atRack = new Position(0, x, y, z, yaw);
                var wrongFloor = new Position(0, x, y + 1.5, z, yaw);
                var other = vehicle == VehicleKind.BICYCLE ? VehicleKind.SCOOTER : VehicleKind.BICYCLE;
                assertThat(mapRentals.inReach(id, vehicle, atRack)).as("%s %s reach", id, vehicle).isTrue();
                assertThat(mapRentals.inReach(id, other, atRack)).as("%s opposite rack", id).isFalse();
                assertThat(mapRentals.inReach(id, vehicle, wrongFloor)).as("%s wrong floor", id).isFalse();
            }
        }
        assertThat(checked).containsExactlyInAnyOrderElementsOf(expected);
    }
}
