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
    "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
    "ontop.world.channels[0].capacity=3",
    "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
    "ontop.world.channels[1].capacity=3"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldTypingWebSocketTests {
    @LocalServerPort int port;

    @Test void 입력여부만_인증된본인으로_전달하고_다른채널에는_보내지않는다() throws Exception {
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy");
                var other = new ScenarioClient(port, "spectator")) {
            assertThat(first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", true)).at("/payload/code").asText())
                    .isEqualTo("NOT_IN_CHANNEL");
            first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            other.request("CHANNEL_JOIN", Map.of("channelId", "two"));
            assertThat(first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", true, "userId", "202"))
                    .at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
            assertThat(first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", "true"))
                    .at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
            var state = other.assertNoMessageDuring(m -> hasUser(m, "101"),
                    () -> first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", true))).path("payload");
            assertThat(state.path("users").get(0).path("userId").asText()).isEqualTo("101");
            assertThat(state.toString()).doesNotContain("text", "draft");
            assertThat(second.await(m -> hasUser(m, "101")).path("payload")).isEqualTo(state);
            long version = state.path("version").asLong();
            first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", false));
            assertThat(second.await(m -> isState(m) && m.at("/payload/version").asLong() > version)
                    .at("/payload/users").isEmpty()).isTrue();
        }
    }

    @Test void 신규입장은_현재입력중상태를_받고_접속종료는_즉시해제한다() throws Exception {
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy")) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", true));
            second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            long version = second.await(m -> hasUser(m, "101")).at("/payload/version").asLong();
            first.close();
            assertThat(second.await(m -> isState(m) && m.at("/payload/version").asLong() > version)
                    .at("/payload/users").isEmpty()).isTrue();
        }
    }

    @Test void 채널퇴장하면_남아있는사용자의_입력중표시도_해제된다() throws Exception {
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy")) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            long version = first.request("WORLD_CHAT_TYPING_SET", Map.of("typing", true)).at("/payload/version").asLong();
            first.request("CHANNEL_LEAVE", Map.of());
            assertThat(second.await(m -> isState(m) && m.at("/payload/version").asLong() > version)
                    .at("/payload/users").isEmpty()).isTrue();
        }
    }

    private boolean isState(JsonNode message) { return message.path("type").asText().equals("WORLD_CHAT_TYPING_STATE"); }
    private boolean hasUser(JsonNode message, String user) {
        if (!isState(message)) return false;
        for (var item : message.at("/payload/users")) if (item.path("userId").asText().equals(user)) return true;
        return false;
    }
}
