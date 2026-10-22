package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.auth.service.AccessJwtService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.heartbeat.interval=100ms",
        "ontop.websocket.heartbeat.timeout=1s",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증 채널 1",
        "ontop.world.channels[0].capacity=2",
        "ontop.world.channels[1].channel-id=channel-2", "ontop.world.channels[1].name=검증 채널 2",
        "ontop.world.channels[1].capacity=3"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@Import(RestSecurityTestSupport.class)
class WorldChannelWebSocketTests {

    @Autowired
    private AccessJwtService jwt;

    @LocalServerPort
    private int port;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper mapper;

    @Test
    void 실제_소켓_입장과_퇴장과_끊김이_기존_목록_API에_반영된다() throws Exception {
        try (ScenarioClient first = connect(); ScenarioClient second = connect();
                ScenarioClient other = connect(); ScenarioClient outside = connect()) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            JsonNode joined = second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            assertThat(first.await(message -> message.path("type").asText().equals("CHANNEL_STATE"))
                    .path("payload")).isEqualTo(joined.path("payload"));
            assertThat(channel("channel-1").path("currentUsers").asInt()).isEqualTo(2);
            assertThat(channel("channel-1").path("joinable").asBoolean()).isFalse();
            other.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));
            assertThat(outside.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                    .path("payload").path("code").asText()).isEqualTo("CHANNEL_FULL");
            assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                    .path("payload")).isEqualTo(joined.path("payload"));

            assertThat(second.request("CHANNEL_LEAVE", Map.of()).path("type").asText()).isEqualTo("CHANNEL_LEFT");
            assertThat(first.await(message -> message.path("type").asText().equals("CHANNEL_STATE"))
                    .path("payload").path("version").asLong()).isEqualTo(3);
            assertThat(channel("channel-1").path("currentUsers").asInt()).isEqualTo(1);
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));
            other.await(message -> message.path("type").asText().equals("CHANNEL_STATE"));
            second.close();
            assertThat(other.await(message -> message.path("type").asText().equals("CHANNEL_STATE"))
                    .path("payload").path("currentUsers").asInt()).isEqualTo(1);
            assertThat(channel("channel-2").path("currentUsers").asInt()).isEqualTo(1);
        }
    }

    @Test
    void heartbeat_무응답은_채널_인원도_한_번만_정리한다() throws Exception {
        try (ScenarioClient survivor = connect(); ScenarioClient silent = connect()) {
            survivor.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            silent.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            survivor.await(message -> message.path("type").asText().equals("CHANNEL_STATE"));

            silent.stopPong();
            silent.awaitClose();
            JsonNode after = survivor.await(message -> message.path("type").asText().equals("CHANNEL_STATE"))
                    .path("payload");

            assertThat(after.path("currentUsers").asInt()).isEqualTo(1);
            assertThat(survivor.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                    .path("payload").path("version").asLong()).isEqualTo(after.path("version").asLong());
            assertThat(channel("channel-1").path("currentUsers").asInt()).isEqualTo(1);
        }
    }

    private ScenarioClient connect() throws Exception {
        ScenarioClient client = new ScenarioClient(port, "ignored-in-dev-mode");
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private JsonNode channel(String channelId) throws Exception {
        // 실제 소켓 상태를 읽되 HTTP의 로그인 경계만 서버 Principal 대역으로 통과한다.
        String response = mvc.perform(get("/api/v1/channels")
                        .header("Authorization", "Bearer " + jwt.issue(RestSecurityTestSupport.USER_ID)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (JsonNode channel : mapper.readTree(response).path("items")) {
            if (channel.path("channelId").asText().equals(channelId)) {
                return channel;
            }
        }
        throw new AssertionError("검증 채널 없음");
    }
}
