package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.world.service.WorldClock;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

// 태블릿(수동 시작) 경로의 행동 로그. 시작 예약은 대역이며 시계는 TabletStartFlowTests와 같은 방식으로 조작한다.
class TabletBehaviorLogTests {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false);
    private final TabletStartFlowTests.MutableClock clock = new TabletStartFlowTests.MutableClock();
    private final CapturingLog log = new CapturingLog();

    @BeforeEach
    void setup() {
        CommittedGameStartService starts = mock(CommittedGameStartService.class);
        when(starts.start(any())).thenAnswer(call -> GameStartResult.reserved(call.getArgument(0), "tablet-game"));
        hub.configureWorldClock(new WorldClock(clock));
        hub.configureCommittedStarts(Optional.of(starts));
        hub.configureBehaviorLog(log);
    }

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 태블릿_설정은_수동_시작과_정원을_포함해_게임_선택으로_기록한다() throws Exception {
        Peer host = peer(101);
        Peer guest = peer(202);
        prepare(host, guest);

        BehaviorEvent selected = log.find(BehaviorEventType.GAME_SELECTED);
        assertThat(selected.userId()).isEqualTo(101L);
        assertThat(selected.tableId()).isEqualTo("table-1");
        assertThat(selected.props()).containsEntry("gameCode", "DICE")
                .containsEntry("targetScore", 4000)
                .containsEntry("betAmountPerPlayer", 5L)
                .containsEntry("selectedPlayers", 2)
                .containsEntry("startMode", "MANUAL");

        // 같은 설정을 다시 보내면 바뀐 것이 없으므로 기록하지 않는다.
        configure(host);
        assertThat(log.count(BehaviorEventType.GAME_SELECTED)).isEqualTo(1);
    }

    @Test
    void 방장_시작_만료로_빠진_방장은_퇴장으로_기록한다() throws Exception {
        Peer host = peer(101);
        Peer guest = peer(202);
        prepare(host, guest);
        long version = host.request("TABLE_HOST_WAIT_CHECK", Map.of()).path("payload").path("tableVersion").asLong();

        clock.advance(120);
        host.request("TABLE_START", Map.of("actionId", "late", "expectedVersion", version));

        BehaviorEvent left = log.find(BehaviorEventType.TABLE_LEFT);
        assertThat(left.userId()).isEqualTo(101L);
        assertThat(left.tableId()).isEqualTo("table-1");
        assertThat(left.props()).containsEntry("reason", "HOST_START_TIMEOUT")
                .containsEntry("byDisconnect", false);
        assertThat(log.count(BehaviorEventType.TABLE_LEFT)).isEqualTo(1);
    }

    @Test
    void 끊긴_뒤_유예_중에는_좌석을_유지하고_만료될_때만_퇴장으로_기록한다() throws Exception {
        Peer host = peer(101);
        Peer guest = peer(202);
        prepare(host, guest);

        hub.disconnect(guest.id, ConnectionCloseReason.SOCKET_CLOSED);
        clock.advance(10);
        peer(303);
        assertThat(log.count(BehaviorEventType.TABLE_LEFT)).isZero();

        clock.advance(20);
        peer(404);
        BehaviorEvent left = log.find(BehaviorEventType.TABLE_LEFT);
        assertThat(left.userId()).isEqualTo(202L);
        assertThat(left.props()).containsEntry("reason", "RECONNECT_EXPIRED")
                .containsEntry("byDisconnect", true);
        assertThat(log.count(BehaviorEventType.TABLE_LEFT)).isEqualTo(1);
    }

    @Test
    void 직접_퇴장은_사유와_함께_기록한다() throws Exception {
        Peer host = peer(101);
        host.request("TABLE_JOIN", Map.of("tableId", "table-1"));

        host.request("TABLE_LEAVE", Map.of());

        assertThat(log.find(BehaviorEventType.TABLE_LEFT).props()).containsEntry("reason", "LEAVE")
                .containsEntry("byDisconnect", false);
    }

    private void prepare(Peer host, Peer guest) throws Exception {
        host.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        guest.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        configure(host);
        host.ready();
        guest.ready();
    }

    private void configure(Peer host) throws Exception {
        long version = host.state().path("version").asLong();
        host.request("TABLE_CONFIGURE", Map.of("gameCode", "DICE", "targetScore", 4000, "selectedPlayers", 2,
                "betAmountPerPlayer", 5, "expectedVersion", version));
    }

    private Peer peer(long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(peer.id);
        when(socket.isOpen()).thenReturn(true);
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(socket).sendMessage(any());
        assertThat(hub.connectAuthenticated(socket, new VerifiedWebSocketUser(accountId,
                VerifiedWebSocketUser.Provider.NAVER, "00000000-0000-0000-0000-000000000001"))).isTrue();
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

        private BehaviorEvent find(BehaviorEventType type) {
            return events.stream().filter(event -> event.type() == type).findFirst().orElseThrow();
        }

        private long count(BehaviorEventType type) {
            return events.stream().filter(event -> event.type() == type).count();
        }
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        // 착석 중 TABLE_JOIN은 현재 테이블 상태를 다시 돌려준다.
        private JsonNode state() throws Exception {
            return request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
        }

        private void ready() throws Exception {
            JsonNode state = state();
            request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", state.path("betAmountPerPlayer").asLong(),
                    "expectedVersion", state.path("version").asLong()));
        }

        private JsonNode request(String type, Map<String, ?> payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("requestId").asText().equals(requestId)) {
                    return response;
                }
            }
        }
    }
}
