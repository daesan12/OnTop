package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldProximity;
import com.ssafy.ontop.world.config.WorldProximityProperties.Point;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.profiles.active=local", "server.address=127.0.0.1", "ontop.websocket.authenticated=true",
    "ontop.world.movement.client-position=true", "ontop.world.movement.minimum-interval=1ns",
    "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=로컬",
    "ontop.world.channels[0].capacity=3"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext
class ClientPositionWebSocketTests {
    @LocalServerPort int port;
    @Autowired WorldChannelRegistry channels;
    @Autowired WorldProximity proximity;
    @Test void 실제인증소켓_위치승인_주변방송_거리판정_좌표주입거절을_확인한다() throws Exception {
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy")) {
            first.await(m -> m.path("type").asText().equals("CONNECTED"));
            second.await(m -> m.path("type").asText().equals("CONNECTED"));
            first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            var own = avatar(first.await(m -> m.path("type").asText().equals("WORLD_STATE")).path("payload"), "101");
            second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            second.await(m -> m.path("type").asText().equals("WORLD_STATE"));
            assertThat(own.at("/motion/authority").asText()).isEqualTo("CLIENT_VALIDATED");
            double x = own.at("/position/x").asDouble(), y = own.at("/position/y").asDouble(), z = own.at("/position/z").asDouble();
            long epoch = own.at("/motion/epoch").asLong();
            proximity.registerTable("probe", new Point(x + 20.25, z));
            assertThat(proximity.canWatch("101", "probe", "one")).isFalse();
            Thread.sleep(100);
            var accepted = first.request("WORLD_POSITION", report(1, epoch, x + .5, y, z));
            assertThat(accepted.path("type").asText()).isEqualTo("WORLD_STATE");
            assertThat(channels.positionOf("101").x()).isCloseTo(x + .5, within(.001));
            assertThat(proximity.canWatch("101", "probe", "one")).isTrue();
            second.await(m -> m.path("type").asText().equals("WORLD_STATE")
                    && avatar(m.path("payload"), "101").at("/position/lastInputSeq").asLong() == 1);
            var denied = first.request("WORLD_POSITION", report(2, epoch, x + 60, y, z));
            assertThat(avatar(denied.path("payload"), "101").at("/motion/authority").isMissingNode()).isTrue();
            assertThat(channels.positionOf("101").x()).isCloseTo(x + .5, within(.001));
            long corrected = avatar(denied.path("payload"), "101").at("/motion/epoch").asLong();
            var stale = first.request("WORLD_POSITION", report(3, epoch, x + 60, y, z));
            assertThat(avatar(stale.path("payload"), "101").at("/motion/epoch").asLong()).isEqualTo(corrected);
            var spoof = new java.util.HashMap<>(report(4, corrected, x, y, z)); spoof.put("userId", "202");
            assertThat(first.request("WORLD_POSITION", spoof).at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
            String table = "table-" + java.util.UUID.nameUUIDFromBytes("one\0table-1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(first.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
            assertThat(first.request("WORLD_POSITION", report(5, corrected, x, y, z)).at("/payload/code").asText()).isEqualTo("TABLE_BUSY");
        } finally { proximity.removeTable("probe"); }
    }
    private static Map<String, Object> report(long seq, long epoch, double x, double y, double z) {
        return Map.of("seq", seq, "epoch", epoch, "x", x, "y", y, "z", z, "yaw", 0, "run", true, "jump", false);
    }
    @Test void 따라가기시작후_도착한_이전정지보고는_새관계를_취소하지않는다() throws Exception {
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy")) {
            first.await(m -> m.path("type").asText().equals("CONNECTED"));
            second.await(m -> m.path("type").asText().equals("CONNECTED"));
            first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            var own = avatar(first.await(m -> m.path("type").asText().equals("WORLD_STATE")).path("payload"), "101");
            second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            second.await(m -> m.path("type").asText().equals("WORLD_STATE"));
            var started = first.request("WORLD_FOLLOW_START", Map.of("targetId", "202"));
            assertThat(started.path("type").asText()).isEqualTo("WORLD_FOLLOW_STATE");
            first.request("WORLD_POSITION", report(1, own.at("/motion/epoch").asLong(),
                    own.at("/position/x").asDouble(), own.at("/position/y").asDouble(), own.at("/position/z").asDouble()));
            var checked = first.request("WORLD_FOLLOW_CHECK", Map.of());
            assertThat(checked.at("/payload/links").size()).isEqualTo(1);
        }
    }
    private static JsonNode avatar(JsonNode state, String id) {
        for (var avatar : state.path("avatars")) if (avatar.path("userId").asText().equals(id)) return avatar;
        throw new AssertionError("missing avatar " + id);
    }
}
