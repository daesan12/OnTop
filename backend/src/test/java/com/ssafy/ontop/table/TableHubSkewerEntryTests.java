package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
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
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
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

    private JsonNode enter(long user, String key, String value) {
        return controller.enter(new AuthenticatedUser(user, LoginProvider.NAVER, TestLoginSessions.ID),
                mapper.valueToTree(Map.of("channelId", "park", key, value))).getBody();
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
