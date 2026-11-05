package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.ledger.service.DiceLedgerEngine;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 실제 소켓으로 주사위 장부 입력·관전·관전자 훈수 핑·20초 자동 기록을 검증한다. 인증·시작은 테스트 대역이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.ledger.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=ledger", "ontop.world.channels[0].name=장부테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext
class DiceLedgerFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("ledger\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private DiceLedgerEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn = com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> spawn.x);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> spawn.z);
    }

    @Test
    void 실제소켓에서굴림_기록_관전자핑_시간초과자동기록을연결한다() throws Exception {
        engine.create("ledger", TABLE, List.of(101L, 202L));
        try (ScenarioClient one = connect("naver", "RESTORED"); ScenarioClient two = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            viewer.request("CHANNEL_JOIN", Map.of("channelId", "ledger"));
            viewer.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
            var watch = viewer.request("GAME_WATCH", Map.of("gameId", "ledger")).path("payload");
            assertThat(watch.path("publicState").path("gameCode").asText()).isEqualTo("DICE_LEDGER");
            long actor = Long.parseLong(watch.path("publicState").path("turnUserId").asText());
            ScenarioClient owner = actor == 101 ? one : two;
            ScenarioClient other = actor == 101 ? two : one;

            assertThat(owner.request("GAME_ACTION_SEND", action("r1", 0, Map.of("kind", "roll", "keepIds", List.of())))
                    .path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            var rolled = viewer.await(message -> version(message, 1)).path("payload").path("publicState");
            assertThat(rolled.path("dice")).hasSize(5);
            assertThat(rolled.path("rollCount").asInt()).isEqualTo(1);

            String categoryPing = UUID.randomUUID().toString();
            var ack = viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger", "eventId", categoryPing,
                    "basedOnVersion", 1, "category", "CHOICE"));
            assertThat(ack.path("type").asText()).isEqualTo("DICE_LEDGER_SPECTATOR_PING");
            assertThat(ack.path("payload").path("category").asText()).isEqualTo("CHOICE");
            assertThat(ack.path("payload").path("senderUserId").asText()).isEqualTo("505");
            // 오목 핑과 같은 사용자별 1초 간격을 공유한다.
            assertThat(code(viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 1, "dieId", 0))))
                    .isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
            Thread.sleep(1100);
            String diePing = UUID.randomUUID().toString();
            viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger", "eventId", diePing,
                    "basedOnVersion", 1, "dieId", 3));
            owner.awaitSpectatorEvent(categoryPing);
            other.awaitSpectatorEvent(categoryPing);
            assertThat(owner.awaitSpectatorEvent(diePing).path("payload").path("dieId").asInt()).isEqualTo(3);

            assertThat(code(viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 0, "category", "CHOICE"))))
                    .isEqualTo("DICE_LEDGER_SPECTATOR_PING_STALE_VERSION");
            assertThat(code(viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 1, "category", "YACHT"))))
                    .isEqualTo("INVALID_PAYLOAD");
            assertThat(code(viewer.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 1, "category", "CHOICE", "dieId", 1))))
                    .isEqualTo("INVALID_PAYLOAD");
            assertThat(code(owner.request("DICE_LEDGER_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 1, "category", "CHOICE"))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", "ledger",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 1, "x", 7, "y", 7))))
                    .isEqualTo("GAME_SPECTATOR_UNSUPPORTED_GAME");

            owner.request("GAME_ACTION_SEND", action("s1", 1, Map.of("kind", "score", "category", "CHOICE")));
            var scored = other.await(message -> version(message, 2)).path("payload").path("publicState");
            assertThat(scored.path("turnUserId").asText()).isEqualTo(Long.toString(actor == 101 ? 202 : 101));
            assertThat(scored.path("lastScored").path("category").asText()).isEqualTo("CHOICE");

            clock.advanceSeconds(20);
            var timeout = viewer.await(message -> version(message, 3)).path("payload").path("publicState");
            assertThat(timeout.path("lastEvent").asText()).isEqualTo("TURN_TIMEOUT");
            assertThat(timeout.path("lastScored").path("auto").asBoolean()).isTrue();
            assertThat(timeout.path("turnUserId").asText()).isEqualTo(Long.toString(actor));

            // heartbeat 응답이 끊겨 연결이 닫혀도 같은 계정으로 돌아오면 같은 장부·마감을 받고 이어서 둔다.
            var before = owner.request("GAME_STATE_CHECK", Map.of("gameId", "ledger")).path("payload");
            owner.stopPong();
            assertThat(owner.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = new ScenarioClient(port, actor == 101 ? "naver" : "ssafy")) {
                var restored = returned.state("RESTORED");
                assertThat(restored.path("gameId").asText()).isEqualTo("ledger");
                assertThat(restored.at("/state/publicState/gameCode").asText()).isEqualTo("DICE_LEDGER");
                assertThat(restored.at("/state/privateState").isEmpty()).isTrue();
                var recovered = returned.request("GAME_STATE_CHECK", Map.of("gameId", "ledger")).path("payload");
                assertThat(recovered.path("version").asLong()).isEqualTo(3);
                assertThat(recovered.path("publicState").path("players"))
                        .isEqualTo(before.path("publicState").path("players"));
                assertThat(recovered.path("publicState").path("turnDeadline"))
                        .isEqualTo(before.path("publicState").path("turnDeadline"));
                var reroll = action("r2", 3, Map.of("kind", "roll", "keepIds", List.of()));
                assertThat(returned.request("GAME_ACTION_SEND", reroll).path("type").asText())
                        .isEqualTo("GAME_ACTION_RESULT");
                assertThat(viewer.await(message -> version(message, 4)).path("payload").path("publicState")
                        .path("rollCount").asInt()).isEqualTo(1);
            }
        }
        System.out.println("[PASS] 주사위 장부 실제엔진/SecureRandom/RawWS: 굴림·기록·관전자 칸/주사위 핑·핑 거절·"
                + "20초 자동 기록·heartbeat 복귀. 인증/시작은대역·제어시계,DB/지급아님.");
    }

    private Map<String, Object> action(String id, long version, Map<String, Object> input) {
        return Map.of("gameId", "ledger", "actionId", id, "expectedVersion", version, "input", input);
    }

    private String code(JsonNode message) { return message.path("payload").path("code").asText(); }

    private ScenarioClient connect(String login, String status) throws Exception {
        var client = new ScenarioClient(port, login);
        client.state(status);
        return client;
    }

    private boolean version(JsonNode message, long value) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("payload").path("version").asLong() == value;
    }
}
