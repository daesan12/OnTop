package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.BufferedBehaviorLog;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableHubBehaviorTests {

    // 시설 상태의 시각(Instant)을 운영 Spring 설정처럼 직렬화한다.
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3))), Duration.ofNanos(1), () -> 0L);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry,
            new WorldChatService(Duration.ofSeconds(1)),
            new WorldEmoteService(new WorldEmoteProperties(List.of("WAVE")), Duration.ofSeconds(1),
                    Clock.systemUTC(), System::nanoTime));
    private final CapturingLog log = new CapturingLog();

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 광장_행동은_성공한_요청만_사용자_번호와_함께_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer user = peer(101);
        user.join("one");
        registry.move(user.userId, new WorldChannelRegistry.Position(0, 0, 0, 0, 0));

        user.request("WORLD_CHAT_SEND", Map.of("text", "안녕 👋"));
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "너무 빠름"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        user.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
        user.request("CHANNEL_LEAVE", Map.of());
        hub.disconnect(user.id, ConnectionCloseReason.SOCKET_CLOSED);

        assertThat(log.types()).containsExactly(BehaviorEventType.WS_CONNECTED, BehaviorEventType.CHANNEL_JOINED,
                BehaviorEventType.CHAT_SENT, BehaviorEventType.EMOTE_SENT, BehaviorEventType.CHANNEL_LEFT,
                BehaviorEventType.WS_DISCONNECTED);
        assertThat(log.events).allSatisfy(event -> assertThat(event.userId()).isEqualTo(101L));
        BehaviorEvent chat = log.find(BehaviorEventType.CHAT_SENT);
        assertThat(chat.channelId()).isEqualTo("one");
        assertThat(chat.props()).containsOnlyKeys("length", "recipients")
                .containsEntry("length", 4)
                .containsEntry("recipients", 0);
        assertThat(log.find(BehaviorEventType.EMOTE_SENT).props()).containsEntry("emoteCode", "WAVE");
        assertThat(log.find(BehaviorEventType.CHANNEL_LEFT).props()).containsEntry("byDisconnect", false);
        assertThat(log.find(BehaviorEventType.WS_DISCONNECTED).props()).containsEntry("reason", "SOCKET_CLOSED");
    }

    @Test
    void 테이블_착석부터_끊김_정리까지_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer user = peer(101);
        user.join("one");
        String tableId = hub.listTables("one").tables().getFirst().tableId();

        user.request("TABLE_JOIN", Map.of("tableId", tableId));
        user.drain();
        user.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
        user.drain();
        user.request("READY_SET", Map.of("ready", true));
        user.drain();
        user.request("TABLE_LEAVE", Map.of());
        user.drain();
        user.request("TABLE_JOIN", Map.of("tableId", tableId));
        hub.disconnect(user.id, ConnectionCloseReason.HEARTBEAT_TIMEOUT);

        assertThat(log.types()).containsSubsequence(BehaviorEventType.TABLE_JOINED, BehaviorEventType.GAME_SELECTED,
                BehaviorEventType.TABLE_READY_SET, BehaviorEventType.TABLE_LEFT, BehaviorEventType.TABLE_JOINED,
                BehaviorEventType.WS_DISCONNECTED, BehaviorEventType.CHANNEL_LEFT, BehaviorEventType.TABLE_LEFT);
        assertThat(log.find(BehaviorEventType.GAME_SELECTED).props()).containsEntry("gameCode", "OMOK");
        assertThat(log.find(BehaviorEventType.TABLE_READY_SET).props()).containsEntry("ready", true);
        assertThat(log.events.stream().filter(event -> event.type() == BehaviorEventType.TABLE_LEFT)
                .map(event -> event.props().get("byDisconnect"))).containsExactly(false, true);
        assertThat(log.events.stream().filter(event -> event.type() == BehaviorEventType.TABLE_LEFT))
                .allSatisfy(event -> assertThat(event.tableId()).isEqualTo(tableId));
    }

    @Test
    void 시설_이용은_실제_점유와_해제만_한번씩_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer user = peer(101);
        user.join("one");
        user.locate(-9, .8, 34.75);
        Map<String, Object> use = Map.of("facilityId", "bench-0", "seatIndex", 0);

        assertThat(user.request("WORLD_FACILITY_USE", use, "use-1").path("type").asText())
                .isEqualTo("WORLD_FACILITY_STATE");
        user.request("WORLD_FACILITY_USE", use, "use-1");
        assertThat(user.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", "other")).path("payload").path("code")
                .asText()).isEqualTo("FACILITY_LEASE_MISMATCH");
        BehaviorEvent used = log.find(BehaviorEventType.FACILITY_USED);
        String leaseId = (String) used.props().get("leaseId");
        assertThat(user.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", leaseId)).path("type").asText())
                .isEqualTo("WORLD_FACILITY_STATE");

        assertThat(log.types()).filteredOn(type -> type.name().startsWith("FACILITY_"))
                .containsExactly(BehaviorEventType.FACILITY_USED, BehaviorEventType.FACILITY_RELEASED);
        assertThat(used.userId()).isEqualTo(101L);
        assertThat(used.channelId()).isEqualTo("one");
        assertThat(used.props()).containsOnlyKeys("leaseId", "facilityId", "kind", "seatIndex")
                .containsEntry("facilityId", "bench-0")
                .containsEntry("kind", "BENCH")
                .containsEntry("seatIndex", 0);
        BehaviorEvent released = log.find(BehaviorEventType.FACILITY_RELEASED);
        assertThat(released.channelId()).isEqualTo("one");
        assertThat(released.props()).containsEntry("leaseId", leaseId)
                .containsEntry("facilityId", "bench-0")
                .containsEntry("endReason", "RELEASED");
        assertThat((Long) released.props().get("durationMs")).isNotNegative();
    }

    @Test
    void 채널_퇴장과_끊김으로_풀린_시설은_종료를_한번만_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer leaving = peer(101);
        leaving.join("one");
        leaving.locate(-9, .8, 34.75);
        leaving.request("WORLD_FACILITY_USE", Map.of("facilityId", "bench-0", "seatIndex", 0));
        leaving.request("CHANNEL_LEAVE", Map.of());
        Peer dropped = peer(102);
        dropped.join("one");
        dropped.locate(-9, .8, 34.75);
        dropped.request("WORLD_FACILITY_USE", Map.of("facilityId", "bench-0", "seatIndex", 1));
        hub.disconnect(dropped.id, ConnectionCloseReason.SOCKET_CLOSED);

        assertThat(log.events.stream().filter(event -> event.type() == BehaviorEventType.FACILITY_RELEASED)
                .map(event -> List.of(event.userId(), event.props().get("endReason"), event.props().get("seatIndex"))))
                .containsExactly(List.of(101L, "CHANNEL_LEFT", 0), List.of(102L, "DISCONNECTED", 1));
    }

    @Test
    void 로그_큐가_가득_차도_요청은_정상_처리된다() throws Exception {
        BufferedBehaviorLog full = new BufferedBehaviorLog((events, positions) -> { },
                new BehaviorLogProperties(true, 1, 1, Duration.ofSeconds(1), Duration.ofSeconds(1)));
        hub.configureBehaviorLog(full);
        Peer user = peer(101);

        JsonNode joined = user.request("CHANNEL_JOIN", Map.of("channelId", "one"));

        assertThat(joined.path("type").asText()).isEqualTo("CHANNEL_STATE");
        assertThat(full.dropped(DropReason.QUEUE_FULL)).isEqualTo(1);
        full.close();
    }

    @Test
    void NPC정리_HTTP_없이도_자리이탈이_예약을_해제한다(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
        try(var ai=new com.ssafy.ontop.ai.LocalWorldAi(mapper,directory,new com.ssafy.ontop.ai.OfflineDecisions(),
                (id,kind,text)->"fixture",hub,null,true)) {
            Peer owner=peer(101);owner.join("one");
            String table=hub.listTables("one").tables().getFirst().tableId();
            owner.request("TABLE_JOIN",Map.of("tableId",table));
            owner.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",1));
            assertThat(hub.aiReserveOmok(hub.aiWaitingOmok().getFirst(),"npc:leave")).isTrue();
            hub.aiBindPracticeGame(table,"npc:leave","practice-leave");
            assertThat(owner.request("TABLE_LEAVE",Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            assertThat(hub.aiPracticeChatGame(owner.userId)).isEmpty();
            assertThat(owner.request("TABLE_JOIN",Map.of("tableId",table)).path("type").asText()).isEqualTo("TABLE_STATE");
            owner.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",1));
            assertThat(hub.aiWaitingOmok()).anySatisfy(t->assertThat(t.tableId()).isEqualTo(table));
        }
    }

    @Test
    void NPC오목_MM은_발언당시_참가자와_관전자_닉네임을_사용한다(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
        var sent=new CopyOnWriteArrayList<String>();
        try(var ai=new com.ssafy.ontop.ai.LocalWorldAi(mapper,directory,new com.ssafy.ontop.ai.OfflineDecisions(),
                (id,kind,text) -> {sent.add(text);return "fixture";},hub,null,true)) {
            Peer owner=peer(101),viewer=peer(102);owner.join("one");viewer.join("one");
            registry.profile(owner.userId,new com.ssafy.ontop.world.service.WorldProfileGateway.Profile("동네친구","MALE"));
            registry.profile(viewer.userId,new com.ssafy.ontop.world.service.WorldProfileGateway.Profile("관전친구","FEMALE"));
            String table=hub.listTables("one").tables().getFirst().tableId(),game="npc-nickname-regression";
            assertThat(owner.request("TABLE_JOIN",Map.of("tableId",table)).path("type").asText()).isEqualTo("TABLE_STATE");
            owner.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",1));
            assertThat(hub.aiReserveOmok(hub.aiWaitingOmok().getFirst(),"npc:test")).isTrue();
            hub.aiBindPracticeGame(table,"npc:test",game);
            var position=registry.positionOf(owner.userId);viewer.locate(position.x(),position.y(),position.z());
            var proximity=(com.ssafy.ontop.world.service.WorldProximity)org.springframework.test.util.ReflectionTestUtils.getField(hub,"proximity");
            proximity.registerTable(table,new com.ssafy.ontop.world.config.WorldProximityProperties.Point(position.x(),position.z()));
            assertThat(viewer.request("TABLE_WATCH",Map.of("tableId",table)).path("type").asText()).isEqualTo("TABLE_WATCH_STATE");
            var message=Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"text","씨발");
            assertThat(owner.request("GAME_SPECTATOR_CHAT_SEND",message).path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            registry.profile(owner.userId,new com.ssafy.ontop.world.service.WorldProfileGateway.Profile("변경된별명","MALE"));
            owner.request("GAME_SPECTATOR_CHAT_SEND",message); // Same event must not overwrite its original display name.
            assertThat(viewer.request("GAME_SPECTATOR_CHAT_SEND",Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"text","병신"))
                    .path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            ai.flush();ai.step();
            assertThat(sent).hasSize(2);
            assertThat(String.join("\n",sent)).contains("동네친구: 씨발","관전친구: 병신","경기 채팅 안내")
                    .doesNotContain("101: 씨발","102: 병신","변경된별명: 씨발","경찰 출동 요청");
        }
    }

    @Test
    void NPC관전자의_추천은_같은_판에만_전달되고_들기와_오래된_추천은_거절한다(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
        try(var ai=new com.ssafy.ontop.ai.LocalWorldAi(mapper,directory,new com.ssafy.ontop.ai.OfflineDecisions(),(id,kind,text)->"fixture",hub,null,true)) {
            Peer owner=peer(101),viewer=peer(102),outside=peer(103);
            owner.join("one");viewer.join("one");outside.join("one");
            String table=hub.listTables("one").tables().getFirst().tableId(),game="npc-ping";
            owner.request("TABLE_JOIN",Map.of("tableId",table));
            owner.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",1));
            assertThat(hub.aiReserveOmok(hub.aiWaitingOmok().getFirst(),"npc:ping")).isTrue();
            hub.aiBindPracticeGame(table,"npc:ping",game);
            hub.aiUpdatePracticeState(table,"npc:ping",game,3,true);
            var position=registry.positionOf(owner.userId);
            viewer.locate(position.x(),position.y(),position.z());outside.locate(position.x(),position.y(),position.z());
            var proximity=(com.ssafy.ontop.world.service.WorldProximity)org.springframework.test.util.ReflectionTestUtils.getField(hub,"proximity");
            proximity.registerTable(table,new com.ssafy.ontop.world.config.WorldProximityProperties.Point(position.x(),position.z()));
            viewer.request("TABLE_WATCH",Map.of("tableId",table));
            owner.drain();outside.drain();viewer.drain();
            var ping=Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"basedOnVersion",3,"x",7,"y",6);
            assertThat(owner.request("OMOK_SPECTATOR_PING_SEND",ping).at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(outside.request("OMOK_SPECTATOR_PING_SEND",ping).at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(viewer.request("WORLD_CARRY_PICKUP",Map.of("targetId",outside.userId)).at("/payload/code").asText()).isEqualTo("CARRY_ACTIVITY_CONFLICT");
            assertThat(outside.request("WORLD_CARRY_PICKUP",Map.of("targetId",viewer.userId)).at("/payload/code").asText()).isEqualTo("CARRY_ACTIVITY_CONFLICT");
            var accepted=viewer.request("OMOK_SPECTATOR_PING_SEND",ping);
            assertThat(accepted.path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
            assertThat(owner.next("OMOK_SPECTATOR_PING").at("/payload/x").asInt()).isEqualTo(7);
            assertThat(outside.messages).noneMatch(m->m.path("type").asText().equals("OMOK_SPECTATOR_PING"));
            owner.drain();
            var retry=viewer.request("OMOK_SPECTATOR_PING_SEND",ping);
            assertThat(retry.at("/payload/sentAt")).isEqualTo(accepted.at("/payload/sentAt"));
            assertThat(owner.messages).noneMatch(m->m.path("type").asText().equals("OMOK_SPECTATOR_PING"));
            hub.aiUpdatePracticeState(table,"npc:ping",game,4,true);
            assertThat(viewer.request("OMOK_SPECTATOR_PING_SEND",Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"basedOnVersion",3,"x",7,"y",6))
                    .at("/payload/code").asText()).isEqualTo("OMOK_SPECTATOR_PING_STALE_VERSION");
            assertThat(viewer.request("OMOK_SPECTATOR_PING_SEND",Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"basedOnVersion",4,"x",7,"y",6))
                    .at("/payload/code").asText()).isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
            hub.aiUpdatePracticeState(table,"npc:ping",game,4,false);
            assertThat(viewer.request("OMOK_SPECTATOR_PING_SEND",Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"basedOnVersion",4,"x",7,"y",6))
                    .at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_GAME_NOT_PLAYING");
        }
    }

    private Peer peer(long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(ReadyConsent.received(peer, mapper.readTree(text.getPayload())));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session,
                new VerifiedWebSocketUser(accountId, Provider.NAVER, TestLoginSessions.ID))).isTrue();
        peer.userId = peer.next("CONNECTED").path("payload").path("userId").asText();
        return peer;
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new CopyOnWriteArrayList<>();

        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }

        private List<BehaviorEventType> types() {
            return events.stream().map(BehaviorEvent::type).toList();
        }

        private BehaviorEvent find(BehaviorEventType type) {
            return events.stream().filter(event -> event.type() == type).findFirst().orElseThrow();
        }
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private String userId;

        private void join(String channel) throws Exception {
            request("CHANNEL_JOIN", Map.of("channelId", channel));
            next("WORLD_STATE");
        }

        private void locate(double x, double y, double z) {
            long sequence = registry.positionOf(userId).sequence() + 1;
            registry.move(userId, new WorldChannelRegistry.Position(sequence, x, y, z, 0));
        }

        private JsonNode request(String type, Object payload) throws Exception {
            return request(type, payload, UUID.randomUUID().toString());
        }

        private JsonNode request(String type, Object payload, String requestId) throws Exception {
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", ReadyConsent.payload(this, type, payload))));
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("requestId").asText().equals(requestId)) {
                    return response;
                }
            }
        }

        private JsonNode next(String type) throws Exception {
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("type").asText().equals(type)) {
                    return response;
                }
            }
        }

        private void drain() {
            messages.clear();
        }
    }
}
