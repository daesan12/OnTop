package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.games.omok.enabled=true", "ontop.games.onecard.enabled=true",
        "server.address=127.0.0.1", "ontop.world.channels[0].channel-id=one",
        "ontop.world.channels[0].name=테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class,
        ManualForfeitFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ManualForfeitFlowTests {
    @LocalServerPort private int port;
    @Autowired private OmokEngine omok;
    @Autowired private OneCardEngine onecard;
    @Autowired private Collector collector;
    @Autowired private TableHub hub;

    @Test
    void 실제소켓_기권승인_종료상태_중복응답_연결유지_복귀차단을확인한다() throws Exception {
        omok.create("manual", "table", 101, 202);
        try (var first = connect("naver", "RESTORED"); var second = connect("ssafy", "RESTORED");
                var viewer = connect("spectator", "LOBBY")) {
            var denied = viewer.request("GAME_FORFEIT", Map.of("gameId", "manual", "actionId", "forged"));
            assertThat(denied.at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            var spoofed = second.request("GAME_FORFEIT", Map.of("gameId", "manual", "actionId", "spoof",
                    "userId", 101));
            assertThat(spoofed.at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
            var accepted = second.request("GAME_FORFEIT", Map.of("gameId", "manual", "actionId", "button"));
            assertThat(accepted.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            assertThat(accepted.at("/payload/duplicate").asBoolean()).isFalse();
            assertThat(accepted.at("/payload/version").asLong()).isEqualTo(1);
            second.state("FINISHED");
            var duplicated = second.request("GAME_FORFEIT", Map.of("gameId", "manual", "actionId", "button"));
            assertThat(duplicated.at("/payload/duplicate").asBoolean()).isTrue();
            second.state("FINISHED");
            var finished = first.await(message -> message.path("type").asText().equals("GAME_STATE")
                    && message.at("/payload/publicState/status").asText().equals("FINISHED"));
            assertThat(finished.at("/payload/publicState/winnerUserId").asText()).isEqualTo("101");
            assertThat(finished.at("/payload/publicState/endReason").asText()).isEqualTo("EXPLICIT_LEAVE");
            assertThat(collector.events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(1);
            assertThat(collector.events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
            assertThat(second.request("CHANNEL_JOIN", Map.of("channelId", "one"))
                    .path("type").asText()).isEqualTo("CHANNEL_STATE");
            Files.writeString(Path.of("build/manual-forfeit-verification.json"), new ObjectMapper().findAndRegisterModules()
                    .writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                            "accepted", accepted, "duplicate", duplicated, "finished", finished,
                            "events", collector.events.stream().filter(event -> event instanceof GameFinished
                                    || event instanceof GameParticipantLeft).toList())));
        }
        awaitServerDisconnect();
        try (var returned = connect("ssafy", "FINISHED")) {
            assertThat(returned.request("GAME_ACTION_SEND", Map.of("gameId", "manual", "actionId", "revive",
                    "expectedVersion", 1, "input", Map.of("x", 0, "y", 0)))
                    .at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(returned.request("GAME_FORFEIT", Map.of("gameId", "manual", "actionId", "again"))
                    .at("/payload/duplicate").asBoolean()).isTrue();
        }
    }

    @Test
    void 세명경기는_기권자만탈락하고_다른참가자경기는유지한다() throws Exception {
        onecard.create("multi", "table", List.of(101L, 202L, 505L));
        try (var first = connect("naver", "RESTORED"); var second = connect("ssafy", "RESTORED");
                var third = connect("spectator", "RESTORED")) {
            assertThat(second.request("GAME_FORFEIT", Map.of("gameId", "multi", "actionId", "leave"))
                    .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            second.state("ELIMINATED");
            assertThat(second.request("GAME_ACTION_SEND", Map.of("gameId", "multi", "actionId", "revive",
                    "expectedVersion", 1, "input", Map.of("kind", "draw")))
                    .at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(first.request("GAME_STATE_CHECK", Map.of("gameId", "multi"))
                    .at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
            assertThat(collector.events.stream().filter(GameFinished.class::isInstance)).isEmpty();
            assertThat(third.request("GAME_FORFEIT", Map.of("gameId", "multi", "actionId", "last"))
                    .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            third.state("FINISHED");
            assertThat(collector.events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(2);
            assertThat(collector.events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        }
    }

    private ScenarioClient connect(String login, String status) throws Exception {
        var client = new ScenarioClient(port, login);
        client.state(status);
        return client;
    }

    private void awaitServerDisconnect() throws InterruptedException {
        // 클라이언트 close()/reader 종료는 서버의 afterConnectionClosed 완료를 보장하지 않는다.
        // 기존 연결이 남아 있는 동안 새 연결을 거절하는 중복 접속 정책은 유지한다.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (hub.metricsSnapshot().activeConnections() != 0 && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(hub.metricsSnapshot().activeConnections()).as("이전 연결의 서버 정리 완료").isZero();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean Collector forfeitCollector() { return new Collector(); }
    }

    static class Collector {
        final List<Object> events = new CopyOnWriteArrayList<>();
        @EventListener public void left(GameParticipantLeft event) { events.add(event); }
        @EventListener public void finished(GameFinished event) { events.add(event); }
    }
}
