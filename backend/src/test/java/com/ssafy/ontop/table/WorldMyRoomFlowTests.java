package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext
class WorldMyRoomFlowTests {
    @LocalServerPort int port;
    @Test void 인증된_두_소켓에_마이룸_표시와_해제를_전파하고_새접속도_복원한다() throws Exception {
        try (var first = client("naver"); var observer = client("ssafy")) {
            var opened = first.request("WORLD_MYROOM_SET", Map.of("open", true));
            assertThat(opened.path("type").asText()).isEqualTo("WORLD_STATE");
            assertThat(activity(opened, first.userId)).isEqualTo("MYROOM");
            for (var avatar : opened.at("/payload/avatars")) assertThat(avatar.path("activity").isNull()).isTrue();
            observer.await(m -> m.path("type").asText().equals("WORLD_STATE") && activity(m, first.userId).equals("MYROOM"));
            assertThat(first.request("WORLD_MYROOM_SET", Map.of("open", true, "userId", observer.userId))
                    .at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
            first.request("WORLD_MYROOM_SET", Map.of("open", false));
            observer.await(m -> m.path("type").asText().equals("WORLD_STATE") && activity(m, first.userId).isEmpty());
            first.request("WORLD_MYROOM_SET", Map.of("open", true));
            first.close();
            observer.await(m -> m.path("type").asText().equals("WORLD_STATE")
                    && !hasUser(m, first.userId));
            try (var rejoined = client("naver")) {
                var world = rejoined.request("WORLD_MYROOM_SET", Map.of("open", false));
                assertThat(activity(world, rejoined.userId)).isEmpty();
            }
        }
    }
    private ScenarioClient client(String login) throws Exception {
        var c = new ScenarioClient(port, login);
        c.await(m -> m.path("type").asText().equals("CONNECTED"));
        c.request("CHANNEL_JOIN", Map.of("channelId", "a"));
        return c;
    }
    private static String activity(JsonNode message, String user) {
        for (var avatar : message.at("/payload/avatars"))
            if (avatar.path("userId").asText().equals(user))
                return avatar.path("myRoomOpen").asBoolean() ? "MYROOM" : avatar.path("activity").asText("");
        return "";
    }
    private static boolean hasUser(JsonNode message, String user) {
        for (var avatar : message.at("/payload/avatars"))
            if (avatar.path("userId").asText().equals(user)) return true;
        return false;
    }
}
