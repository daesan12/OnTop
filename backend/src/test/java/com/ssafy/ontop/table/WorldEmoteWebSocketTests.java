package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=1s",
        "ontop.world.emote.minimum-interval=60s",
        "ontop.world.emote.codes[0]=WAVE", "ontop.world.emote.codes[1]=CLAP",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=3",
        "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
        "ontop.world.channels[1].capacity=3"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldEmoteWebSocketTests {

    @LocalServerPort
    private int port;

    @Test
    void 실제_소켓에서_검증된_사용자로_감정표현하고_형식_위조와_빠른_반복을_차단한다() throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient second = connect("ssafy")) {
            assertThat(first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"))
                    .path("payload").path("code").asText()).isEqualTo("NOT_IN_CHANNEL");
            join(first, "one");
            join(second, "one");
            assertThat(first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE", "userId", "202"))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
            JsonNode message = first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE")).path("payload");
            assertThat(message.path("userId").asText()).isEqualTo("101");
            assertThat(message.path("emoteCode").asText()).isEqualTo("WAVE");
            assertThat(UUID.fromString(message.path("eventId").asText())).isNotNull();
            assertThat(Instant.parse(message.path("sentAt").asText())).isNotNull();
            assertThat(second.await(value -> value.path("type").asText().equals("WORLD_EMOTE_EVENT"))
                    .path("payload")).isEqualTo(message);
            try (ScenarioClient duplicate = new ScenarioClient(port, "naver")) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            assertThat(first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"))
                    .path("payload").path("code").asText()).isEqualTo("EMOTE_TOO_FREQUENT");
            JsonNode other = second.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE")).path("payload");
            assertThat(first.await(value -> value.path("type").asText().equals("WORLD_EMOTE_EVENT"))
                    .path("payload")).isEqualTo(other);
        }
    }

    @Test
    void 채널_이동은_간격을_유지하고_heartbeat_종료_뒤_새_연결은_전송할_수_있다() throws Exception {
        try (ScenarioClient survivor = connect("naver"); ScenarioClient silent = connect("ssafy")) {
            join(survivor, "one");
            join(silent, "one");
            silent.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
            survivor.await(value -> value.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            silent.request("CHANNEL_LEAVE", Map.of());
            join(silent, "two");
            assertThat(silent.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"))
                    .path("payload").path("code").asText()).isEqualTo("EMOTE_TOO_FREQUENT");
            silent.stopPong();
            silent.awaitClose();
            try (ScenarioClient returned = connect("ssafy")) {
                join(returned, "two");
                JsonNode message = returned.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
                assertThat(message.path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
                assertThat(message.path("payload").path("userId").asText()).isEqualTo("202");
                assertThat(message.path("payload").path("channelId").asText()).isEqualTo("two");
            }
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private void join(ScenarioClient client, String channel) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        client.await(message -> message.path("type").asText().equals("WORLD_STATE"));
    }
}
