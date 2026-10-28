package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 물리 tick과 입력 취소 경로를 함께 검사한다. 기존 거리 fixture의 시계는 사용하지 않는다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5", "ontop.world.movement.minimum-interval=1ms"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldEmoteMovementFlowTests {
    @LocalServerPort int port;

    @ParameterizedTest
    @CsvSource({"false,false", "true,false", "false,true"})
    void 이미_시작한_방귀는_걷기_달리기_점프_입력과_실제_물리_방송으로_취소하지_않는다(
            boolean run, boolean jump) throws Exception {
        try (var first = client("naver"); var observer = client("ssafy")) {
            JsonNode event = first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "FART"));
            assertThat(event.path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
            observer.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            observer.assertNoMessageDuring(message -> message.path("type").asText().equals("WORLD_EMOTE_CANCELLED"), () -> {
                assertThat(first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0,
                        "run", run, "jump", jump)).path("type").asText()).isEqualTo("WORLD_STATE");
                JsonNode movement = observer.await(message -> message.path("type").asText().equals("WORLD_STATE")
                        && message.at("/payload/avatars/0/position/lastInputSeq").asInt() == 1
                        && message.at("/payload/avatars/0/position/moving").asBoolean());
                assertThat(movement.at("/payload/avatars/0/position/running").asBoolean()).isEqualTo(run);
                assertThat(first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"))
                        .at("/payload/code").asText()).isEqualTo("EMOTE_ACTIVITY_CONFLICT");
                return null;
            });
        }
    }

    private ScenarioClient client(String login) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
        return client;
    }
}
