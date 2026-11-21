package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.skewer.coop.controller.SkewerCoopController;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.service.UserProfileService;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TableHubSkewerEntryTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final WorldChannelRegistry channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new WorldChannelProperties.Channel("park", "공원", 10))));
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(30), Duration.ofSeconds(30), channels);
    private final SkewerCoopEngine engine = new SkewerCoopEngine(mapper, Clock.systemUTC(), new GameEngineRouter(),
            event -> { }, user -> { }, (user, channel) -> true, new Random(18), 240);
    private final UserProfileService profiles = mock(UserProfileService.class);
    private final SkewerCoopController controller = new SkewerCoopController(engine, hub, null, profiles);

    @org.junit.jupiter.api.BeforeEach
    void 방장_프로필을_준비한다() {
        when(profiles.findProfile(org.mockito.ArgumentMatchers.anyLong()))
                .thenAnswer(call -> new UserProfileResponse(call.getArgument(0), "공원친구", null));
    }

    @AfterEach
    void 종료한다() {
        hub.shutdown();
    }

    @Test
    void 방장_프로필_실패와_탈퇴는_방을_남기지_않고_같은_키로_재시도할수있다() throws Exception {
        peer(101);
        entranceAt(101);
        for (var error : new RestAuthenticationException.Error[] {
                RestAuthenticationException.Error.STORAGE, RestAuthenticationException.Error.MEMBER_CHANGED}) {
            when(profiles.findProfile(101)).thenThrow(new RestAuthenticationException(error));

            assertThatThrownBy(() -> enter(101, "requestKey", "retry"))
                    .isInstanceOfSatisfying(RestAuthenticationException.class,
                            exception -> assertThat(exception.error()).isEqualTo(error));

            assertThat(engine.rooms(101, "park").path("rooms")).isEmpty();
            assertThat(engine.owns(101, "park")).isFalse();
            doReturn(new UserProfileResponse(101, "서버의 방장", null))
                    .when(profiles).findProfile(101);
        }

        assertThat(enter(101, "requestKey", "retry").at("/publicState/hostNickname").asText())
                .isEqualTo("서버의 방장");
        assertThat(engine.rooms(101, "park").path("rooms").size()).isEqualTo(1);
    }

    @Test
    void 프로필_지연중에도_엔진은_응답하고_연결이_끊기면_방을_만들지_않는다() throws Exception {
        Peer host = peer(101);
        entranceAt(101);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(profiles.findProfile(101)).thenAnswer(call -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return new UserProfileResponse(101, "공원친구", null);
        });

        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = workers.submit(() -> enter(101, "requestKey", "slow"));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(workers.submit(() -> engine.rooms(202, "park")).get(2, TimeUnit.SECONDS)
                        .path("rooms")).isEmpty();
                hub.disconnect(host.id);
            } finally {
                release.countDown();
            }
            assertThatThrownBy(() -> pending.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(IllegalStateException.class);
        }
        assertThat(engine.rooms(101, "park").path("rooms")).isEmpty();
    }

    @Test
    void 프로필은_방_생성시_한번만_조회하고_참가자는_다시_조회하지_않는다() throws Exception {
        peer(101);
        entranceAt(101);
        String id = enter(101, "requestKey", "once").path("gameId").asText();
        peer(202);

        assertThat(enter(202, "gameId", id).path("registered").asBoolean()).isTrue();

        verify(profiles, times(1)).findProfile(101);
        verify(profiles, never()).findProfile(202);
    }

    @Test
    void 방장닉네임은_계정프로필을_사용하고_요청의_닉네임은_거절한다() throws Exception {
        peer(101);
        entranceAt(101);
        var user = new AuthenticatedUser(101, LoginProvider.NAVER, TestLoginSessions.ID);
        var body = mapper.createObjectNode().put("channelId", "park").put("requestKey", "named")
                .put("roomName", "달빛 꼬치집").put("password", "abcd");
        assertThat(controller.enter(user, body).getBody().at("/publicState/hostNickname").asText())
                .isEqualTo("공원친구");
        body.put("hostNickname", "다른사람");
        assertThatThrownBy(() -> controller.enter(user, body)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 입장후_방장이_경계를_조금_벗어나도_입구의_친구는_참가한다() throws Exception {
        peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "create").path("gameId").asText();
        peer(202);
        moveOutside(101);

        assertThat(enter(202, "gameId", game).path("registered").asBoolean()).isTrue();
        assertThat(engine.load(101, game)).isPresent();
        assertThat(engine.load(202, game)).isPresent();
    }

    @Test
    void 새_참가자는_여전히_입구에_있어야_한다() throws Exception {
        peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "create").path("gameId").asText();
        peer(202);
        moveOutside(202);

        assertThatThrownBy(() -> enter(202, "gameId", game)).hasMessageContaining("VR 체험관 입구");
        assertThat(engine.load(202, game)).isEmpty();
    }

    @Test
    void 다른_게임을_이용중인_방장은_거리_면제와_별개로_거절한다() throws Exception {
        Peer host = peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "create").path("gameId").asText();
        Peer guest = peer(202);
        var recovery = mock(GameReconnectService.class);
        when(recovery.canUseLobby(202, guest.id)).thenReturn(true);
        when(recovery.canUseLobby(101, host.id)).thenReturn(false);
        ReflectionTestUtils.setField(hub, "reconnect", Optional.of(recovery));

        assertThatThrownBy(() -> enter(202, "gameId", game)).hasMessageContaining("진행 중인 게임");
        assertThat(engine.load(202, game)).isEmpty();
    }

    @Test
    void 연결이_끊긴_방장에게는_친구가_참가할_수_없다() throws Exception {
        Peer host = peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "create").path("gameId").asText();
        peer(202);
        hub.disconnect(host.id);

        assertThatThrownBy(() -> enter(202, "gameId", game)).hasMessageContaining("연결된 공원");
    }

    @Test
    void 대기자도_같은_채널과_검증된_맵_연결이어야_한다() throws Exception {
        Peer host = peer(101);
        assertThatThrownBy(() -> hub.requireSkewerWaitingPlayer(101, "other"))
                .hasMessageContaining("연결된 공원");
        @SuppressWarnings("unchecked")
        var verified = (java.util.Set<String>) ReflectionTestUtils.getField(hub, "mapVerifiedSessions");
        verified.remove(host.id);
        assertThatThrownBy(() -> hub.requireSkewerWaitingPlayer(101, "park"))
                .hasMessageContaining("연결된 공원");
    }

    @Test
    void 다른_테이블에_앉은_대기자도_참가할_수_없다() throws Exception {
        Peer host = peer(101);
        String table = hub.listTables("park").tables().getFirst().tableId();
        assertThat(host.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText())
                .isEqualTo("TABLE_STATE");
        assertThatThrownBy(() -> hub.requireSkewerWaitingPlayer(101, "park"))
                .hasMessageContaining("진행 중인 게임");
    }

    @Test
    void 꼬치왕_복구참가자의_VR_보호는_로비권한과_분리하고_종료후_창보호도_유지한다() throws Exception {
        Peer chef = peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "vr-protection").path("gameId").asText();
        Peer server = peer(202);
        enter(202, "gameId", game);
        Peer visitor = peer(303);
        var recovery = new GameReconnectService(Optional.of(engine), Optional.empty());
        try {
            recovery.connected(101, chef.id, (id, view) -> { });
            recovery.connected(202, server.id, (id, view) -> { });
            recovery.connected(303, visitor.id, (id, view) -> { });
            await().atMost(Duration.ofSeconds(3)).until(() ->
                    recovery.canResumeUnreservedChannel(101, chef.id, "park")
                            && recovery.canResumeUnreservedChannel(202, server.id, "park")
                            && recovery.canUseLobby(303, visitor.id));
            ReflectionTestUtils.setField(hub, "reconnect", Optional.of(recovery));
            assertThat(recovery.canUseLobby(101, chef.id)).isFalse();

            JsonNode approved = chef.request("WORLD_INTERACTION_SET", Map.of("busy", true, "vrActive", true));

            assertThat(approved.path("type").asText()).isEqualTo("WORLD_INTERACTION_STATE");
            assertThat(approved.at("/payload/vrActive").asBoolean()).isTrue();
            assertThat(channels.carryAvailable("101")).isFalse();
            assertThat(channels.worldState("park").avatars().stream().filter(a -> a.userId().equals("202")))
                    .allMatch(a -> a.vrActive() == null);
            assertThat(visitor.request("WORLD_CARRY_PICKUP", Map.of("targetId", "101"))
                    .at("/payload/code").asText()).isEqualTo("CARRY_ACTIVITY_CONFLICT");
            assertThat(chef.request("WORLD_INTERACTION_SET", Map.of("busy", false))
                    .at("/payload/busy").asBoolean()).isTrue();
            assertThat(channels.carryAvailable("101")).isFalse();
            String table = hub.listTables("park").tables().getFirst().tableId();
            assertThat(chef.request("TABLE_JOIN", Map.of("tableId", table)).at("/payload/code").asText())
                    .isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(chef.request("WORLD_INTERACTION_SET",
                    Map.of("busy", true, "vrActive", true, "userId", "202")).path("type").asText())
                    .isEqualTo("ERROR");

            JsonNode ended = chef.request("WORLD_INTERACTION_SET", Map.of("busy", true, "vrActive", false));
            assertThat(ended.path("type").asText()).isEqualTo("WORLD_INTERACTION_STATE");
            assertThat(ended.at("/payload/vrActive").asBoolean()).isFalse();
            assertThat(ended.at("/payload/busy").asBoolean()).isTrue();
            assertThat(channels.carryAvailable("101")).isFalse();
        } finally {
            recovery.shutdown();
        }
    }

    @Test
    void 일반게임_화면점유는_복구확인중에도_갱신하지만_VR시작은_기존게이트를_따른다() throws Exception {
        Peer player = peer(101);
        var recovery = mock(GameReconnectService.class);
        when(recovery.canUseLobby(101, player.id)).thenReturn(false);
        ReflectionTestUtils.setField(hub, "reconnect", Optional.of(recovery));

        JsonNode occupied = player.request("WORLD_INTERACTION_SET", Map.of("busy", true));

        assertThat(occupied.path("type").asText()).isEqualTo("WORLD_INTERACTION_STATE");
        assertThat(occupied.at("/payload/busy").asBoolean()).isTrue();
        assertThat(channels.carryAvailable("101")).isFalse();
        verify(recovery, never()).canUseLobby(101, player.id);

        JsonNode vrStart = player.request("WORLD_INTERACTION_SET", Map.of("busy", true, "vrActive", true));

        assertThat(vrStart.at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
        verify(recovery).canUseLobby(101, player.id);
    }

    @Test
    void 복구가_완료된_현재연결의_원래채널이_아니면_VR_보호요청을_허용하지_않는다() throws Exception {
        Peer chef = peer(101);
        for (var scope : List.of(new String[] { "old-session", "park" }, new String[] { chef.id, "other" })) {
            var recovery = mock(GameReconnectService.class);
            when(recovery.canResumeUnreservedChannel(101, scope[0], scope[1])).thenReturn(true);
            ReflectionTestUtils.setField(hub, "reconnect", Optional.of(recovery));

            JsonNode denied = chef.request("WORLD_INTERACTION_SET", Map.of("busy", true, "vrActive", true));

            assertThat(denied.at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(channels.worldState("park").avatars()).allMatch(a -> a.vrActive() == null);
        }
    }

    @Test
    void 종료한_참가자는_복구중에도_결과방을_조회하지만_새입장은_제한한다() throws Exception {
        peer(101);
        entranceAt(101);
        String game = enter(101, "requestKey", "terminal-read").path("gameId").asText();
        Peer guest = peer(202);
        enter(202, "gameId", game);
        engine.leaveWaiting(101, game);
        var recovery = mock(GameReconnectService.class);
        when(recovery.canUseLobby(202, guest.id)).thenReturn(false);
        ReflectionTestUtils.setField(hub, "reconnect", Optional.of(recovery));

        JsonNode result = controller.rooms(
                new AuthenticatedUser(202, LoginProvider.NAVER, TestLoginSessions.ID), "park").getBody();

        assertThat(result.at("/mine/gameId").asText()).isEqualTo(game);
        assertThat(result.at("/mine/publicState/phase").asText()).isEqualTo("FINISHED");
        assertThatThrownBy(() -> enter(202, "requestKey", "new-room"))
                .hasMessageContaining("진행 중인 게임");
        engine.leaveWaiting(202, game);
        assertThatThrownBy(() -> controller.rooms(
                new AuthenticatedUser(202, LoginProvider.NAVER, TestLoginSessions.ID), "park"))
                .hasMessageContaining("진행 중인 게임");
    }

    private JsonNode enter(long user, String key, String value) {
        return controller.enter(new AuthenticatedUser(user, LoginProvider.NAVER, TestLoginSessions.ID),
                mapper.valueToTree(Map.of("channelId", "park", key, value))).getBody();
    }

    @Test
    void 윷놀이는_전통놀이존의_서버_접근점과_높이를_확인한다() throws Exception {
        peer(101);
        var position = channels.positionOf("101");
        var park = mock(PreparedParkMap.class);
        var sites = mapper.createArrayNode();
        var folk = sites.addObject().put("id", "folk").put("radius", 3).put("heightTolerance", .7);
        folk.putArray("reachPosition").add(position.x()).add(position.y()).add(position.z());
        when(park.constructionSites()).thenReturn(sites);
        ReflectionTestUtils.setField(hub, "preparedPark", park);

        hub.requireYutEntry(101, "park", false);
        // 실제 이동 엔진의 바닥 보정과 분리해 접근점의 높이 경계를 검증한다.
        folk.withArray("reachPosition").set(1, mapper.getNodeFactory().numberNode(position.y() + .71));
        assertThatThrownBy(() -> hub.requireYutEntry(101, "park", false)).hasMessageContaining("전통놀이존");
        // 이미 입장한 방은 거리만 면제하고 인증 소켓·채널 검사는 계속한다.
        hub.requireYutEntry(101, "park", true);
        assertThatThrownBy(() -> hub.requireYutEntry(101, "other", true)).hasMessageContaining("연결된 공원");
    }

    @Test
    void 전통놀이존이_없는_맵은_윷놀이_진입을_허용하지_않는다() throws Exception {
        peer(101);
        var park = mock(PreparedParkMap.class);
        when(park.constructionSites()).thenReturn(mapper.createArrayNode());
        ReflectionTestUtils.setField(hub, "preparedPark", park);

        assertThatThrownBy(() -> hub.requireYutEntry(101, "park", false)).hasMessageContaining("전통놀이존");
    }

    private void entranceAt(long user) {
        var position = channels.positionOf(Long.toString(user));
        var park = mock(PreparedParkMap.class);
        when(park.vrEntrance()).thenReturn(Optional.of(new PreparedParkMap.Reach(
                new Pose(position.x(), position.y(), position.z(), 0), 2.8, .9, false)));
        ReflectionTestUtils.setField(hub, "preparedPark", park);
    }

    private void moveOutside(long user) {
        var position = channels.positionOf(Long.toString(user));
        channels.releaseFacility(Long.toString(user), new Pose(position.x() + 2.81, position.y(), position.z(), 0));
    }

    private Peer peer(long user) throws Exception {
        Peer peer = new Peer();
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage message) {
                peer.messages.add(mapper.readTree(message.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(user,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
        JsonNode connected = peer.messages.poll(3, TimeUnit.SECONDS);
        assertThat(connected).isNotNull();
        assertThat(peer.request("WORLD_MAP_CONFIRM", connected.at("/payload/map")).path("type").asText())
                .isEqualTo("WORLD_MAP_STATE");
        assertThat(peer.request("CHANNEL_JOIN", Map.of("channelId", "park")).path("type").asText())
                .isNotEqualTo("ERROR");
        return peer;
    }

    private final class Peer {
        final String id = UUID.randomUUID().toString();
        final LinkedBlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        JsonNode request(String type, Object payload) throws Exception {
            String id = UUID.randomUUID().toString();
            hub.receive(this.id, mapper.writeValueAsString(Map.of("requestId", id, "type", type, "payload", payload)));
            JsonNode response;
            do {
                response = messages.poll(3, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
            } while (!id.equals(response.path("requestId").asText()));
            return response;
        }
    }
}
