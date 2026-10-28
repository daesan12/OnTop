package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 Raw WS 응답을 FE 파서에 전달한다. 회원/DB 조회만 기존 인증 대역으로 대체한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5", "ontop.world.movement.minimum-interval=1ns"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
class WorldFrontendWireContractTests {
    @LocalServerPort int port;
    @Autowired TableHub hub;

    @Test
    void 비참가자에게_전달한_표현_취소와_공개_착석_실제_응답을_프론트_계약_검수에_사용한다() throws Exception {
        var frames = new LinkedHashMap<String, JsonNode>();
        try (var actor = client("naver"); var observer = client("ssafy")) {
            frames.put("initial", observer.await(message -> world(message)
                    && avatar(message, actor.userId).isObject()));
            JsonNode wave = actor.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
            assertThat(wave.path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
            frames.put("wave", observer.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT")));
            assertThat(actor.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0, "run", false))
                    .path("type").asText()).isEqualTo("WORLD_STATE");
            frames.put("movementCancelled", observer.await(message -> cancelled(message, wave)));
            assertThat(actor.request("WORLD_MOVE", Map.of("seq", 2, "dx", 0, "dz", 0, "run", false))
                    .path("type").asText()).isEqualTo("WORLD_STATE");
            observer.await(message -> world(message)
                    && avatar(message, actor.userId).at("/position/lastInputSeq").asInt() == 2
                    && !avatar(message, actor.userId).at("/position/moving").asBoolean());
            JsonNode clap = actor.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "CLAP"));
            assertThat(clap.path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
            frames.put("clap", observer.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT")));

            String table = hub.listTables("a").tables().getFirst().tableId();
            assertThat(actor.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
            // 독립 이벤트 간 전송 순서를 계약으로 가정하지 않고, 두 응답을 모두 보존한다.
            observer.await(message -> {
                if (cancelled(message, clap)) { frames.put("activityCancelled", message); }
                if (world(message) && avatar(message, actor.userId).path("tableSeat").isObject()) {
                    frames.put("seated", message);
                }
                return frames.containsKey("activityCancelled") && frames.containsKey("seated");
            });
            assertThat(actor.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            long seatedVersion = frames.get("seated").at("/payload/version").asLong();
            frames.put("left", observer.await(message -> world(message)
                    && message.at("/payload/version").asLong() > seatedVersion
                    && avatar(message, actor.userId).path("tableSeat").isNull()));

            // 정상 test 실행은 파일을 쓰지 않는다. 검수 명령에서만 고정된 build 경로에 합성 계정 응답을 내보낸다.
            if ("1".equals(System.getenv("ONTOP_EXPORT_WORLD_WIRE"))) {
                Path output = Path.of("build/reports/world-frontend-wire.json");
                Files.createDirectories(output.getParent());
                String runId = System.getenv("ONTOP_WORLD_WIRE_RUN_ID");
                assertThat(runId).as("검수 도구가 생성한 실행 ID").isNotBlank();
                new ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(output.toFile(),
                        Map.of("schemaVersion", 1, "runId", runId,
                                "actorUserId", actor.userId, "tableId", table, "frames", frames));
            }
        }
    }

    private ScenarioClient client(String login) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "a")).path("type").asText()).isEqualTo("CHANNEL_STATE");
        return client;
    }

    private static boolean cancelled(JsonNode message, JsonNode event) {
        return message.path("type").asText().equals("WORLD_EMOTE_CANCELLED")
                && message.at("/payload/emoteEventId").equals(event.at("/payload/eventId"));
    }

    private static boolean world(JsonNode message) {
        return message.path("type").asText().equals("WORLD_STATE");
    }

    private static JsonNode avatar(JsonNode message, String userId) {
        for (JsonNode avatar : message.at("/payload/avatars")) {
            if (avatar.path("userId").asText().equals(userId)) { return avatar; }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }
}
