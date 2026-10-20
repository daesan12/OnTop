package com.ssafy.ontop.table;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증 채널",
        "ontop.world.channels[0].capacity=2"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
class WorldChannelAuthenticationTests {

    @LocalServerPort
    private int port;

    @Test
    void 기존_인증_연결의_내부_ID를_쓰고_추가_연결과_payload_위조를_거절한다() throws Exception {
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy")) {
            assertThat(first.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo("101");
            second.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1", "userId", "202"))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");

            assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                    .path("payload").path("userIds").get(0).asText()).isEqualTo("101");
            try (ScenarioClient duplicate = new ScenarioClient(port, "naver")) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            var joined = second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")).path("payload");
            assertThat(joined.path("currentUsers").asInt()).isEqualTo(2);
            assertThat(joined.path("userIds")).extracting(node -> node.asText()).containsExactly("101", "202");
        }
    }
}
