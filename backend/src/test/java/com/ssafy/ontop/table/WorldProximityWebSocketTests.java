package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.movement.minimum-interval=1ms", "ontop.world.chat.minimum-interval=1ms",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=5",
        "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
        "ontop.world.channels[1].capacity=5"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, WorldProximityWebSocketTests.Fixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldProximityWebSocketTests {
    private static final String TABLE = tableId("one", 1);
    private static final String UNSET = tableId("one", 2);
    private static final String OTHER = tableId("two", 1);
    @LocalServerPort
    private int port;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private Fixture fixture;
    @Autowired private com.ssafy.ontop.world.service.WorldChannelRegistry positions;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
        properties.add("ontop.world.proximity.tables[" + OTHER + "].x", () -> 0);
        properties.add("ontop.world.proximity.tables[" + OTHER + "].z", () -> 0);
    }

    @Test
    void 채팅은_50m경계까지_수신하고_멀거나_다른채널_사용자에게_전송하지않는다() throws Exception {
        try (ScenarioClient sender = connect("naver"); ScenarioClient receiver = connect("ssafy");
                ScenarioClient unknown = connect("spectator")) {
            join(sender, "one");
            join(receiver, "one");
            join(unknown, "one");
            assertThat(positions.positionOf(sender.userId)).isNotNull(); // 입장 시 서버 스폰을 부여한다.
            move(sender, 0, 0, 0);
            move(receiver, 0, 30, 40);
            move(unknown, 0, -50.001, 0);
            JsonNode sent = sender.request("WORLD_CHAT_SEND", Map.of("text", "50m 경계"));
            assertThat(receiver.await(m -> type(m, "WORLD_CHAT_MESSAGE")).path("payload"))
                    .isEqualTo(sent.path("payload"));
            unknown.assertNoMessage(m -> type(m, "WORLD_CHAT_MESSAGE"));
            move(receiver, 1, 50.001, 0);
            receiver.assertNoMessageDuring(m -> type(m, "WORLD_CHAT_MESSAGE"),
                    () -> sender.request("WORLD_CHAT_SEND", Map.of("text", "범위 밖")));
            receiver.request("CHANNEL_LEAVE", Map.of());
            join(receiver, "two");
            move(receiver, 0, 0, 0);
            receiver.assertNoMessageDuring(m -> type(m, "WORLD_CHAT_MESSAGE"),
                    () -> sender.request("WORLD_CHAT_SEND", Map.of("text", "채널 격리")));
        }
    }

    @Test
    void 테이블_보기는_설정좌표_근처에서만_허용하고_이동하면_자동해제한다() throws Exception {
        try (ScenarioClient viewer = connect("ssafy")) {
            join(viewer, "one");
            assertThat(code(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))))
                    .isEqualTo("TABLE_OUT_OF_RANGE");
            move(viewer, 0, 20, 0);
            assertThat(code(viewer.request("TABLE_WATCH", Map.of("tableId", UNSET))))
                    .isEqualTo("TABLE_OUT_OF_RANGE");
            assertThat(type(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE)), "TABLE_WATCH_STATE"))
                    .isTrue();
            move(viewer, 1, 21, 0);
            viewer.await(m -> type(m, "TABLE_WATCH_LEFT"));
            assertThat(code(viewer.request("TABLE_UNWATCH", Map.of()))).isEqualTo("NOT_WATCHING");
        }
    }

    @Test
    void 경기_단건조회와_자동관전은_같은범위를_검사하고_개인정보와_내부좌표키를_노출하지않는다() throws Exception {
        try (ScenarioClient viewer = connect("ssafy")) {
            join(viewer, "one");
            move(viewer, 0, 21, 0);
            assertThat(code(viewer.request("GAME_STATE_CHECK", Map.of("gameId", "game"))))
                    .isEqualTo("GAME_STATE_ACCESS_DENIED");
            assertThat(code(viewer.request("GAME_WATCH", Map.of("gameId", "game"))))
                    .isEqualTo("GAME_STATE_ACCESS_DENIED");
            move(viewer, 1, 20, 0);
            for (String game : new String[]{"unset", "other", "missing"}) {
                assertThat(code(viewer.request("GAME_STATE_CHECK", Map.of("gameId", game))))
                        .isEqualTo("GAME_STATE_ACCESS_DENIED");
            }
            JsonNode initial = viewer.request("GAME_WATCH", Map.of("gameId", "game"));
            assertThat(type(initial, "GAME_STATE")).isTrue();
            assertThat(initial.path("payload").path("privateState").isEmpty()).isTrue();
            assertThat(initial.path("payload").has("tableId")).isFalse();
            fixture.version.set(2);
            events.publishEvent(new GameStateChanged("game", 2));
            assertThat(viewer.await(m -> type(m, "GAME_STATE")).path("payload").path("version").asLong())
                    .isEqualTo(2);
            move(viewer, 2, 21, 0);
            viewer.await(m -> type(m, "GAME_WATCH_LEFT"));
            events.publishEvent(new GameStateChanged("game", 3));
            viewer.assertNoMessage(m -> type(m, "GAME_STATE"));
            assertThat(code(viewer.request("GAME_UNWATCH", Map.of()))).isEqualTo("GAME_NOT_WATCHING");
        }
    }

    @Test
    void 관전조회중_범위를_벗어나면_지연된_최초상태를_전송하지않는다() throws Exception {
        try (ScenarioClient viewer = connect("ssafy")) {
            join(viewer, "one");
            move(viewer, 0, 0, 0);
            String id = viewer.sendRequest("GAME_WATCH", Map.of("gameId", "delayed"));
            try {
                assertThat(fixture.entered.await(5, TimeUnit.SECONDS)).isTrue();
                move(viewer, 1, 21, 0);
                fixture.release.countDown();
                assertThat(code(viewer.await(m -> m.path("requestId").asText().equals(id))))
                        .isEqualTo("GAME_STATE_ACCESS_DENIED");
                viewer.assertNoMessage(m -> type(m, "GAME_STATE"));
            } finally {
                fixture.release.countDown();
            }
        }
    }

    @Test
    void 채널퇴장과_착석은_성립한_경기관전을_즉시_해제한다() throws Exception {
        try (ScenarioClient viewer = connect("ssafy")) {
            join(viewer, "one");
            move(viewer, 0, 0, 0);
            viewer.request("GAME_WATCH", Map.of("gameId", "game"));
            viewer.sendRequest("CHANNEL_LEAVE", Map.of());
            viewer.await(m -> type(m, "GAME_WATCH_LEFT"));
            assertThat(code(viewer.request("GAME_STATE_CHECK", Map.of("gameId", "game"))))
                    .isEqualTo("GAME_STATE_ACCESS_DENIED");
            join(viewer, "one");
            move(viewer, 0, 0, 0);
            viewer.request("GAME_WATCH", Map.of("gameId", "game"));
            viewer.sendRequest("TABLE_JOIN", Map.of("tableId", TABLE));
            viewer.await(m -> type(m, "GAME_WATCH_LEFT"));
            assertThat(code(viewer.request("GAME_STATE_CHECK", Map.of("gameId", "game"))))
                    .isEqualTo("GAME_STATE_ACCESS_DENIED");
        }
    }

    @Test
    void 채팅과관전_거리이탈부터_재접속까지_연속확인한다() throws Exception {
        System.out.println("[SIMULATED] 실제 임시 Spring 서버·TCP/WebSocket 사용. 인증·경기 상태는 대역, 테이블 원점은 테스트 좌표. 서버 내부 경계 위치 주입·물리 시계 정지, 채팅 제한1ms, heartbeat 200ms/2초.");
        try (ScenarioClient sender = connect("naver"); ScenarioClient viewer = connect("ssafy")) {
            join(sender, "one");
            join(viewer, "one");
            move(sender, 0, 0, 0);
            move(viewer, 0, 49, 0);
            assertChat(sender, viewer, "49m 안");
            move(viewer, 1, 50, 0);
            assertChat(sender, viewer, "50m 경계");
            move(viewer, 2, 51, 0);
            viewer.assertNoMessageDuring(m -> type(m, "WORLD_CHAT_MESSAGE"),
                    () -> sender.request("WORLD_CHAT_SEND", Map.of("text", "51m 밖")));
            move(viewer, 3, 20, 0);
            assertChat(sender, viewer, "20m 관전 범위로 복귀");
            System.out.println("[PASS] 채팅 49m·50m 수신 → 51m 미수신 → 20m 관전 범위 복귀 수신");

            assertThat(type(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE)), "TABLE_WATCH_STATE"))
                    .isTrue();
            assertSpectator(viewer.request("GAME_WATCH", Map.of("gameId", "game")), 1);
            move(viewer, 4, 21, 0);
            var ended = new HashSet<String>();
            for (int index = 0; index < 2; index++) {
                JsonNode notice = viewer.await(m -> type(m, "TABLE_WATCH_LEFT") || type(m, "GAME_WATCH_LEFT"));
                assertThat(notice.path("requestId").isNull()).isTrue();
                ended.add(notice.path("type").asText());
            }
            assertThat(ended).containsExactlyInAnyOrder("TABLE_WATCH_LEFT", "GAME_WATCH_LEFT");
            assertThat(code(viewer.request("TABLE_UNWATCH", Map.of()))).isEqualTo("NOT_WATCHING");
            assertThat(code(viewer.request("GAME_UNWATCH", Map.of()))).isEqualTo("GAME_NOT_WATCHING");
            assertThat(code(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))))
                    .isEqualTo("TABLE_OUT_OF_RANGE");
            assertThat(code(viewer.request("GAME_WATCH", Map.of("gameId", "game"))))
                    .isEqualTo("GAME_STATE_ACCESS_DENIED");
            viewer.assertNoMessageDuring(WorldProximityWebSocketTests::watchState, () -> {
                fixture.version.set(2);
                events.publishEvent(new GameStateChanged("game", 2));
                return sender.request("TABLE_JOIN", Map.of("tableId", TABLE));
            });
            System.out.println("[PASS] 21m 이탈 → 대기/경기 관전 해제·재요청 거절·상태 미전송");

            viewer.assertNoMessageDuring(WorldProximityWebSocketTests::watchState, () -> {
                move(viewer, 5, 20, 0);
                fixture.version.set(3);
                events.publishEvent(new GameStateChanged("game", 3));
                return sender.request("TABLE_LEAVE", Map.of());
            });
            assertThat(type(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE)), "TABLE_WATCH_STATE"))
                    .isTrue();
            assertSpectator(viewer.request("GAME_WATCH", Map.of("gameId", "game")), 3);
            sender.request("TABLE_JOIN", Map.of("tableId", TABLE));
            viewer.await(m -> type(m, "TABLE_WATCH_STATE")
                    && m.path("payload").path("seats").findValuesAsText("userId").contains("101"));
            fixture.version.set(4);
            events.publishEvent(new GameStateChanged("game", 4));
            assertSpectator(viewer.await(m -> type(m, "GAME_STATE")), 4);
            System.out.println("[PASS] 20m 복귀만으로 자동 관전 없음 → 재구독 후 좌석·공개 경기 상태 수신");

            viewer.stopPong();
            assertThat(viewer.awaitClose()).isEqualTo(1001);
            sender.await(m -> type(m, "CHANNEL_STATE") && m.path("payload").path("currentUsers").asInt() == 1);
            try (ScenarioClient reconnected = connect("ssafy")) {
                join(reconnected, "one");
                assertThat(code(reconnected.request("WORLD_CHAT_SEND", Map.of("text", "위치 재보고 전"))))
                        .isNullOrEmpty();
                assertThat(code(reconnected.request("TABLE_WATCH", Map.of("tableId", TABLE))))
                        .isEqualTo("TABLE_OUT_OF_RANGE");
                assertThat(code(reconnected.request("GAME_WATCH", Map.of("gameId", "game"))))
                        .isEqualTo("GAME_STATE_ACCESS_DENIED");
                reconnected.assertNoMessageDuring(WorldProximityWebSocketTests::watchState, () -> {
                    move(reconnected, 0, 20, 0);
                    fixture.version.set(5);
                    events.publishEvent(new GameStateChanged("game", 5));
                    return sender.request("TABLE_LEAVE", Map.of());
                });
                assertChat(sender, reconnected, "재접속 후 채팅");
                assertThat(type(reconnected.request("TABLE_WATCH", Map.of("tableId", TABLE)), "TABLE_WATCH_STATE"))
                        .isTrue();
                assertSpectator(reconnected.request("GAME_WATCH", Map.of("gameId", "game")), 5);
                sender.request("TABLE_JOIN", Map.of("tableId", TABLE));
                reconnected.await(m -> type(m, "TABLE_WATCH_STATE")
                        && m.path("payload").path("seats").findValuesAsText("userId").contains("101"));
                fixture.version.set(6);
                events.publishEvent(new GameStateChanged("game", 6));
                assertSpectator(reconnected.await(m -> type(m, "GAME_STATE")), 6);
                System.out.println("[PASS] Pong 중단 종료 → 동일 계정 재접속 → 서버 스폰·경계 위치 주입·채팅·관전 재구독 성공");
            }
        }
    }

    private static boolean watchState(JsonNode message) {
        return type(message, "TABLE_WATCH_STATE") || type(message, "GAME_STATE");
    }

    private void assertChat(ScenarioClient sender, ScenarioClient receiver, String text) throws Exception {
        JsonNode sent = sender.request("WORLD_CHAT_SEND", Map.of("text", text));
        assertThat(type(sent, "WORLD_CHAT_MESSAGE")).isTrue();
        JsonNode received = receiver.await(m -> type(m, "WORLD_CHAT_MESSAGE"));
        assertThat(received.path("requestId").isNull()).isTrue();
        assertThat(received.path("payload")).isEqualTo(sent.path("payload"));
    }

    private void assertSpectator(JsonNode message, long version) {
        assertThat(type(message, "GAME_STATE")).isTrue();
        assertThat(message.path("payload").path("version").asLong()).isEqualTo(version);
        assertThat(message.path("payload").path("privateState").isEmpty()).isTrue();
        assertThat(message.path("payload").has("tableId")).isFalse();
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(m -> type(m, "CONNECTED"));
        return client;
    }

    private void join(ScenarioClient client, String channel) throws Exception {
        assertThat(type(client.request("CHANNEL_JOIN", Map.of("channelId", channel)), "CHANNEL_STATE")).isTrue();
    }

    private void move(ScenarioClient client, long sequence, double x, double z) throws Exception {
        // This suite isolates distance contracts: trusted server pose fixture, no client coordinate API.
        positions.move(client.userId, new com.ssafy.ontop.world.service.WorldChannelRegistry.Position(
                sequence * 2 + 1, x, .8, z, 0));
        assertThat(type(client.request("WORLD_MOVE", Map.of("seq", sequence * 2 + 1,
                "dx", 0, "dz", 0, "run", false)), "WORLD_STATE")).isTrue();
    }

    private static boolean type(JsonNode message, String type) {
        return message.path("type").asText().equals(type);
    }

    private String code(JsonNode message) {
        return message.path("payload").path("code").asText();
    }

    private static String tableId(String channel, int number) {
        return "table-" + UUID.nameUUIDFromBytes((channel + "\0table-" + number).getBytes(StandardCharsets.UTF_8));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        private final AtomicLong version = new AtomicLong(1);
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        @Bean
        GameStateGateway states() {
            ObjectMapper mapper = new ObjectMapper();
            return (userId, gameId) -> {
                if (gameId.equals("delayed")) {
                    entered.countDown();
                    try {
                        if (!release.await(5, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("test timeout");
                        }
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(exception);
                    }
                }
                String table = switch (gameId) {
                    case "missing" -> null;
                    case "unset" -> UNSET;
                    case "other" -> OTHER;
                    default -> TABLE;
                };
                return Optional.of(new GameStateView(userId, gameId, version.get(), GameStateView.Role.SPECTATOR,
                        mapper.createObjectNode().put("turn", 101), mapper.createObjectNode(), table));
            };
        }
    }
}
