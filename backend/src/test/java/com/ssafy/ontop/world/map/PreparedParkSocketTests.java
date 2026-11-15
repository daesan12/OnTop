package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import com.ssafy.ontop.world.service.WorldMapCompatibility;
import com.ssafy.ontop.world.service.WorldProximity;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 별도 랜덤 포트 서버. 회원 검증은 고정 fixture이며 실제 인증·DB·기본 서버를 변경하지 않는다. */
@SpringBootTest(classes = PreparedParkSocketTests.TestServer.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
@ActiveProfiles("prepared-park-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class PreparedParkSocketTests {
    @LocalServerPort
    private int port;
    @Autowired
    private TableHub hub;
    @Autowired
    private WorldChannelRegistry channels;
    @Autowired
    private PreparedParkMap park;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 리뉴얼_선착장_오리배를_서버에서_운항하고_반납한다() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(park.createScene().duckBoatCourse() != null);
        var dock = park.collisionData().path("duckBoatDock").path("reachPosition");
        var stand = new com.ssafy.ontop.world.service.WorldFacilityService.Pose(
                dock.path(0).asDouble(), dock.path(1).asDouble(), dock.path(2).asDouble(), 0);
        try (Client driver = new Client(); Client visitor = new Client()) {
            driver.confirm();
            visitor.confirm();
            var channel = Map.of("channelId", "channel-1");
            driver.request("CHANNEL_JOIN", channel);
            visitor.request("CHANNEL_JOIN", channel);
            var driverId = driver.connected.path("payload").path("userId").asText();
            var visitorId = visitor.connected.path("payload").path("userId").asText();
            var tooFar = driver.request("WORLD_DUCK_BOAT_RENT", Map.of());
            assertThat(tooFar.path("payload").path("code").asText()).isEqualTo("DUCK_BOAT_OUT_OF_RANGE");

            channels.releaseFacility(driverId, stand);
            channels.releaseFacility(visitorId, stand);
            var boarded = driver.request("WORLD_DUCK_BOAT_RENT", Map.of()).path("payload").path("duckBoat");
            assertThat(boarded.path("userId").asText()).isEqualTo(driverId);
            double startZ = boarded.path("pose").path("z").asDouble();
            var occupied = visitor.request("WORLD_DUCK_BOAT_RENT", Map.of());
            assertThat(occupied.path("payload").path("code").asText()).isEqualTo("DUCK_BOAT_OCCUPIED");
            visitor.request("WORLD_DUCK_BOAT_RETURN", Map.of());
            assertThat(channels.ridingDuckBoat(driverId)).isTrue();

            driver.request("WORLD_DUCK_BOAT_INPUT", Map.of("turn", 0, "throttle", 1));
            await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(
                    channels.worldState("channel-1").duckBoat().pose().z()).isLessThan(startZ - .2));
            driver.request("WORLD_DUCK_BOAT_RETURN", Map.of());
            assertThat(channels.ridingDuckBoat(driverId)).isFalse();
            assertThat(channels.worldState("channel-1").duckBoat()).isNull();
            assertThat(channels.positionOf(driverId).x()).isCloseTo(stand.x(), org.assertj.core.data.Offset.offset(.01));
            driver.request("WORLD_MOVE", Map.of("seq", 1, "dx", -1, "dz", 0, "run", false, "jump", false));
            await().atMost(Duration.ofSeconds(3)).untilAsserted(() ->
                    assertThat(channels.positionOf(driverId).x()).isLessThan(stand.x() - .15));
        }
    }

    @Test
    void 최신맵_운동기구_탑승과_하차와_접속종료만_서버_보상에_전달한다() throws Exception {
        var rewards = mock(com.ssafy.ontop.world.fitness.FitnessRewardService.class);
        when(rewards.enabled()).thenReturn(true);
        hub.configureFitnessRewards(rewards);
        var facility = park.facilities().facilities().stream()
                .filter(item -> item.kind().equals("FITNESS")).findFirst().orElseThrow();
        try (Client client = new Client()) {
            client.confirm();
            client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            String user = client.connected.path("payload").path("userId").asText();
            assertThat(client.request("WORLD_FACILITY_CATALOG", Map.of()).path("payload")
                    .path("fitnessRewardsEnabled").asBoolean()).isTrue();
            channels.holdFacility(user, facility.center());
            var used = client.request("WORLD_FACILITY_USE", Map.of("facilityId", facility.facilityId(), "seatIndex", 0));
            assertThat(used.path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
            await().atMost(Duration.ofSeconds(3))
                    .untilAsserted(() -> verify(rewards).started(eq(Long.parseLong(user)), any()));
            String lease = used.path("payload").path("occupancies").get(0).path("leaseId").asText();
            assertThat(client.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", lease))
                    .path("payload").path("occupancies").isEmpty()).isTrue();
            await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> verify(rewards).ended(any()));
            channels.holdFacility(user, facility.center());
            var reused = client.request("WORLD_FACILITY_USE",
                    Map.of("facilityId", facility.facilityId(), "seatIndex", 0));
            assertThat(reused.path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
            await().atMost(Duration.ofSeconds(3))
                    .untilAsserted(() -> verify(rewards, times(2)).started(eq(Long.parseLong(user)), any()));

            // abort의 서버 감지 시점에 의존하지 않고 Close 프레임으로 접속 종료를 전달한다.
            client.socket.sendClose(WebSocket.NORMAL_CLOSURE, "test done").get(5, TimeUnit.SECONDS);
            // synchronized mock 메서드 안에서 timeout 검증을 대기하면 서버의 ended 호출도 막힌다.
            await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> verify(rewards, times(2)).ended(any()));
        }
    }

    @Test
    void 새맵_확인과_채널별_모든_테이블_착석_게임선택_준비를_실제소켓으로_처리한다() throws Exception {
        try (Client first = new Client(); Client second = new Client()) {
            assertThat(first.connected.path("payload").path("map")).isEqualTo(mapper.valueToTree(park.metadata()));
            assertThat(first.request("WORLD_MAP_CONFIRM", ParkScene.load().metadata())
                    .path("payload").path("code").asText()).isEqualTo("MAP_VERSION_MISMATCH");
            first.confirm();
            second.confirm();
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            int tableCount = park.bindings().size() / 2;
            assertThat(hub.listTables("channel-1").tables()).hasSize(tableCount);
            assertThat(hub.listTables("channel-2").tables()).hasSize(tableCount);
            for (int number = 1; number <= tableCount; number++) {
                String table = PreparedParkMap.serverTableId("channel-1", number);
                assertThat(first.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText())
                        .isEqualTo("TABLE_STATE");
                assertThat(first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 1))
                        .path("type").asText()).isEqualTo("TABLE_STATE");
                second.request("TABLE_JOIN", Map.of("tableId", table));
                first.ready(table);
                assertThat(second.ready(table).path("payload").path("allReady").asBoolean()).isTrue();
                assertThat(hub.listTables("channel-2").tables()).allMatch(item -> item.occupiedSeats() == 0);
                first.request("TABLE_LEAVE", Map.of());
                second.request("TABLE_LEAVE", Map.of());
            }
            assertThat(channels.worldState("channel-1").mapVersion()).isEqualTo(park.metadata().mapVersion());
            assertThat(ParkScene.load().metadata().schemaVersion()).isEqualTo(1);
        }
    }

    @Test
    void 새시설_이용과_반납_메모함_접근은_같은_새맵_좌표를_사용한다() throws Exception {
        try (Client client = new Client()) {
            client.confirm();
            client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            String user = client.connected.path("payload").path("userId").asText();
            long userId = Long.parseLong(user);
            var facility = park.facilities().facilities().getFirst();
            // 서버 fixture 위치만 변경한다. WebSocket 입력에 임의 좌표를 보내지 않는다.
            channels.holdFacility(user, facility.center());
            JsonNode used = client.request("WORLD_FACILITY_USE",
                    Map.of("facilityId", facility.facilityId(), "seatIndex", 0));
            assertThat(used.path("type").asText()).as(used.toString()).isEqualTo("WORLD_FACILITY_STATE");
            assertThat(used.path("payload").path("mapVersion").asText()).isEqualTo(park.metadata().mapVersion());
            String lease = used.path("payload").path("occupancies").get(0).path("leaseId").asText();
            assertThat(client.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", lease))
                    .path("payload").path("occupancies").isEmpty()).isTrue();
            channels.holdFacility(user, park.notes().center());
            assertThatCode(() -> hub.requireNotesAccess(userId, "channel-1", 0, 0, 0)).doesNotThrowAnyException();
            channels.holdFacility(user, park.feedback().center());
            assertThatCode(() -> hub.requireFeedbackAccess(userId, "channel-1", 0, 0, 0)).doesNotThrowAnyException();
            assertThatThrownBy(() -> hub.requireNotesAccess(userId, "channel-1", 0, 0, 0))
                    .hasMessageContaining("익명 메모함");
        }
    }

    private class Client implements WebSocket.Listener, AutoCloseable {
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();
        private final WebSocket socket;
        private final JsonNode connected;

        Client() throws Exception {
            socket = HttpClient.newHttpClient().newWebSocketBuilder().buildAsync(
                    URI.create("ws://127.0.0.1:" + port + "/test/park"), this).get(10, TimeUnit.SECONDS);
            connected = await(null);
            assertThat(connected.path("type").asText()).isEqualTo("CONNECTED");
        }

        @Override
        public void onOpen(WebSocket webSocket) { webSocket.request(1); }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) {
                messages.add(fragments.toString());
                fragments.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        JsonNode request(String type, Object payload) throws Exception {
            String id = UUID.randomUUID().toString();
            socket.sendText(mapper.writeValueAsString(Map.of("requestId", id, "type", type, "payload", payload)), true)
                    .get(5, TimeUnit.SECONDS);
            return await(id);
        }

        void confirm() throws Exception {
            assertThat(request("WORLD_MAP_CONFIRM", park.metadata()).path("type").asText())
                    .isEqualTo("WORLD_MAP_STATE");
        }

        JsonNode ready(String tableId) throws Exception {
            // 각 클라이언트가 직접 받은 최신 공개 상태의 금액·버전에 동의한다.
            JsonNode observed = request("TABLE_JOIN", Map.of("tableId", tableId)).path("payload");
            return request("READY_SET", Map.of("ready", true,
                    "betAmountPerPlayer", observed.path("betAmountPerPlayer").longValue(),
                    "expectedVersion", observed.path("version").longValue()));
        }

        JsonNode await(String requestId) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
            while (System.nanoTime() < deadline) {
                String raw = messages.poll(100, TimeUnit.MILLISECONDS);
                if (raw != null) {
                    JsonNode message = mapper.readTree(raw);
                    if (requestId == null || requestId.equals(message.path("requestId").asText())) {
                        return message;
                    }
                }
            }
            throw new AssertionError("WebSocket 응답 시간 초과: " + requestId);
        }

        @Override
        public void close() { socket.abort(); }
    }

    @Configuration(proxyBeanMethods = false)
    @Profile("prepared-park-test")
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class, SecurityAutoConfiguration.class,
            ManagementWebSecurityAutoConfiguration.class})
    @EnableWebSocket
    static class TestServer {
        @Bean
        com.ssafy.ontop.behavior.service.BehaviorLog behaviorLog() {
            return com.ssafy.ontop.behavior.service.BehaviorLog.disabled();
        }

        @Bean
        PreparedParkMap park() throws Exception {
            Path input = Path.of(System.getenv("TEST_GENERATED_MAP_DIR"));
            return PreparedParkMap.load(input.resolve("server-map.json"), input.resolve("manifest.json"),
                    Set.of("channel-1", "channel-2"));
        }

        @Bean
        WorldChannelRegistry channels(PreparedParkMap park) {
            ParkScene scene = park.createScene();
            return new WorldChannelRegistry(new WorldChannelProperties(List.of(
                    new WorldChannelProperties.Channel("channel-1", "새 맵 검증1", 4),
                    new WorldChannelProperties.Channel("channel-2", "새 맵 검증2", 4))),
                    Duration.ofMillis(50), System::nanoTime, scene);
        }

        @Bean(destroyMethod = "shutdown")
        TableHub hub(PreparedParkMap park, WorldChannelRegistry channels) {
            return new TableHub(new ObjectMapper().findAndRegisterModules(), Optional.empty(), false, Optional.empty(),
                    Duration.ofSeconds(10), Duration.ofSeconds(10), channels,
                    new WorldChatService(Duration.ofSeconds(1)),
                    new WorldEmoteService(new WorldEmoteProperties(null, null), Duration.ofSeconds(1)),
                    Optional.empty(), Optional.empty(), Optional.empty(),
                    new WorldProximity(channels, park.proximity()),
                    new WorldMapCompatibility(true, park.metadata()), park);
        }

        @Bean
        WebSocketConfigurer sockets(TableHub hub) {
            AtomicLong users = new AtomicLong(100);
            return registry -> registry.addHandler(new TextWebSocketHandler() {
                @Override
                public void afterConnectionEstablished(WebSocketSession session) {
                    hub.connectAuthenticated(session, new VerifiedWebSocketUser(users.incrementAndGet(),
                            VerifiedWebSocketUser.Provider.NAVER, UUID.randomUUID().toString()));
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                    hub.receive(session.getId(), message.getPayload());
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session,
                        org.springframework.web.socket.CloseStatus status) { hub.disconnect(session.getId()); }
            }, "/test/park");
        }
    }
}
