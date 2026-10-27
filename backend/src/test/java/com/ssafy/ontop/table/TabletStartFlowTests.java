package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.world.service.WorldClock;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
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

// 실제 Hub/직렬화/비동기 송신 검증. 인증과 DB 예약 경계는 대역이며 DB 성공 검증이 아니다.
class TabletStartFlowTests {
    final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    TableHub hub = new TableHub(mapper, Optional.empty(), false);
    final MutableClock clock = new MutableClock();
    final CommittedGameStartService starts = mock(CommittedGameStartService.class);
    final AtomicInteger reservations = new AtomicInteger();
    @BeforeEach void setup() {
        hub.configureWorldClock(new WorldClock(clock));
        hub.configureCommittedStarts(Optional.of(starts));
        when(starts.start(any())).thenAnswer(call -> {
            reservations.incrementAndGet();
            return GameStartResult.reserved(call.getArgument(0), "tablet-game");
        });
    }
    @AfterEach void close() { hub.shutdown(); }

    @Test void 전원준비는_시작하지않고_방장만_동일요청을_한번예약한다() throws Exception {
        Peer a=peer(101), b=peer(202); prepare(a,b);
        assertThat(reservations).hasValue(0);
        long version=hub.listTables().tables().getFirst().readyCount();
        var state=a.request("TABLE_JOIN", Map.of("tableId","table-1")).path("payload");
        version=state.path("version").asLong();
        var payload=Map.of("actionId","start-1","expectedVersion",version);
        assertThat(b.request("TABLE_START",payload).path("payload").path("code").asText()).isEqualTo("NOT_GAME_SELECTOR");
        assertThat(a.request("TABLE_START",payload).path("type").asText()).isEqualTo("GAME_START_STATE");
        a.awaitType("GAME_START_STATE", m -> m.path("payload").path("phase").asText().equals("PLAYING"));
        a.request("TABLE_START",payload);
        assertThat(reservations).hasValue(1);
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("cancelReason").asText()).isEqualTo("START_APPROVED");
    }

    @Test void 만료는_방장만_퇴장시키고_준비를풀며_이전시작을_거절한다() throws Exception {
        Peer a=peer(101), b=peer(202); prepare(a,b);
        var wait=a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload");
        assertThat(wait.path("expiresAt").asLong()-wait.path("serverNow").asLong()).isEqualTo(120000);
        clock.advance(120);
        var result=a.request("TABLE_START",Map.of("actionId","late","expectedVersion",wait.path("tableVersion").asLong()));
        assertThat(result.path("type").asText()).isEqualTo("ERROR");
        var timeout=b.awaitType("TABLE_HOST_TIMEOUT",m -> true).path("payload");
        assertThat(timeout.path("previousHostUserId").asText()).isEqualTo("101");
        assertThat(timeout.path("nextHostUserId").asText()).isEqualTo("202");
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(reservations).hasValue(0);
    }

    @Test void 준비취소와_설정변경은_이전기한을_취소하고_새준비만_기한을만든다() throws Exception {
        Peer a=peer(101), b=peer(202); prepare(a,b);
        long first=a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").asLong();
        clock.advance(15); b.request("READY_SET",Map.of("ready",false));
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").isNull()).isTrue();
        b.request("READY_SET",Map.of("ready",true));
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").asLong()).isEqualTo(first+15000);
        var state=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload");
        a.request("TABLE_CONFIGURE",Map.of("gameCode","DICE","targetScore",4000,"selectedPlayers",2,"betAmountPerPlayer",5,"expectedVersion",state.path("version").asLong()));
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        assertThat(hub.listTables().tables().getFirst().targetScore()).isEqualTo(4000);
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").isNull()).isTrue();
        assertThat(a.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",1)).path("payload").path("code").asText()).isEqualTo("TABLE_CONFIGURATION_REQUIRED");
    }

    @Test void 재접속은_같은기한을_유지하고_유예만료와_로그아웃은_좌석을정리한다() throws Exception {
        Peer a=peer(101), b=peer(202); prepare(a,b);
        long deadline=a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").asLong();
        hub.disconnect(a.id,ConnectionCloseReason.SOCKET_CLOSED); clock.advance(10);
        a=peer(101);
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").asLong()).isEqualTo(deadline);
        hub.disconnect(a.id,ConnectionCloseReason.LOGOUT);
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        hub.disconnect(b.id,ConnectionCloseReason.SOCKET_CLOSED); clock.advance(30);
        b=peer(202);
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isZero();
    }

    @Test void 정산확정_전에는_승계하지않고_확정후_승자가_다음방장이다() throws Exception {
        Peer a=peer(101), b=peer(202); prepare(a,b);
        long version=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong();
        a.request("TABLE_START",Map.of("actionId","start","expectedVersion",version));
        a.awaitType("GAME_START_STATE",m -> m.path("payload").path("phase").asText().equals("PLAYING"));
        hub.roundEnded("table-1","tablet-game");
        assertThat(hub.listTables().tables().getFirst().selectorUserId()).isEqualTo("101");
        var result=new GameResultView(101,1,"tablet-game","OMOK",GameResultView.Status.FINISHED,"NORMAL",
                GameResultView.SettlementStatus.SETTLED,1,List.of(new GameResultView.Participant("101","LOSE"),
                new GameResultView.Participant("202","WIN")),-1L,clock.instant());
        hub.roundSettled(new GameResultCommitted(result));
        assertThat(hub.listTables().tables().getFirst().selectorUserId()).isEqualTo("202");
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        long revision=b.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong();
        hub.roundSettled(new GameResultCommitted(result));
        assertThat(b.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong()).isEqualTo(revision);
    }

    @Test void 맵미확인_재접속뒤_로그아웃한_과거유예는_새좌석을_지우지않는다() throws Exception {
        hub.shutdown();
        var maps=new com.ssafy.ontop.world.service.WorldMapCompatibility(true);
        var channels=mock(com.ssafy.ontop.world.service.WorldChannelRegistry.class);
        hub=new TableHub(mapper,Optional.empty(),false,Optional.empty(),Duration.ofSeconds(10),Duration.ofSeconds(10),
                channels,mock(com.ssafy.ontop.world.service.WorldChatService.class),mock(com.ssafy.ontop.world.service.WorldEmoteService.class),
                Optional.empty(),Optional.empty(),Optional.empty(),mock(com.ssafy.ontop.world.service.WorldProximity.class),maps);
        hub.configureWorldClock(new WorldClock(clock));
        Peer a=peer(101),b=peer(202);
        var metadata=Map.of("mapId",maps.metadata().mapId(),"schemaVersion",1,"mapVersion",maps.metadata().mapVersion());
        a.request("WORLD_MAP_CONFIRM",metadata);b.request("WORLD_MAP_CONFIRM",metadata);prepare(a,b);
        hub.disconnect(a.id,ConnectionCloseReason.SOCKET_CLOSED);
        Peer pending=peer(101);
        hub.disconnect(pending.id,ConnectionCloseReason.LOGOUT);
        Peer fresh=peer(101);fresh.request("WORLD_MAP_CONFIRM",metadata);
        fresh.request("TABLE_JOIN",Map.of("tableId","table-2"));clock.advance(31);
        assertThat(fresh.request("TABLE_JOIN",Map.of("tableId","table-2")).path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(hub.listTables().tables().get(1).occupiedSeats()).isEqualTo(1);
    }

    @Test void 시작승인뒤_만료확인은_진행경기의_방장을_퇴장시키지않는다() throws Exception {
        Peer a=peer(101),b=peer(202);prepare(a,b);clock.advance(119);
        long version=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong();
        a.request("TABLE_START",Map.of("actionId","edge","expectedVersion",version));
        // 시작 알림이 조회 응답보다 먼저 도착하는 CI 실행 순서를 고정한다.
        assertThat(a.playingDelivered.await(5, TimeUnit.SECONDS)).isTrue();
        clock.advance(1);
        var wait = a.request("TABLE_HOST_WAIT_CHECK", Map.of()).path("payload");
        assertThat(wait.path("cancelReason").asText()).isEqualTo("START_APPROVED");
        assertThat(wait.path("expiresAt").isNull()).isTrue();
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
        a.awaitType("GAME_START_STATE",m->m.path("payload").path("phase").asText().equals("PLAYING"));
        assertThat(reservations).hasValue(1);
    }

    @Test
    void 만료조회_응답뒤_예약이_완료돼도_시작알림과_좌석을_유지한다() throws Exception {
        var reservationEntered = new CountDownLatch(1);
        var releaseReservation = new CountDownLatch(1);
        doAnswer(call -> {
            reservations.incrementAndGet();
            reservationEntered.countDown();
            if (!releaseReservation.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("예약 결과 해제 신호가 도착하지 않았습니다.");
            }
            return GameStartResult.reserved(call.getArgument(0), "tablet-game");
        }).when(starts).start(any());
        Peer a = peer(101);
        Peer b = peer(202);
        prepare(a, b);
        clock.advance(119);
        long version = a.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                .path("payload").path("version").asLong();
        try {
            a.request("TABLE_START", Map.of("actionId", "delayed", "expectedVersion", version));
            assertThat(reservationEntered.await(5, TimeUnit.SECONDS)).isTrue();
            clock.advance(1);
            var wait = a.request("TABLE_HOST_WAIT_CHECK", Map.of()).path("payload");
            assertThat(wait.path("cancelReason").asText()).isEqualTo("START_APPROVED");
            assertThat(wait.path("expiresAt").isNull()).isTrue();
            assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
            releaseReservation.countDown();
            a.awaitType("GAME_START_STATE", message ->
                    message.path("payload").path("phase").asText().equals("PLAYING"));
            assertThat(reservations).hasValue(1);
        } finally {
            releaseReservation.countDown();
        }
    }

    @Test void 예약거절은_전원준비를_해제하고_새시작요청만_새예약을한다() throws Exception {
        doAnswer(call -> {reservations.incrementAndGet();
            GameStartCommand command=call.getArgument(0);return GameStartResult.rejected(command.startAttemptId(),"BALANCE");}).when(starts).start(any());
        Peer a=peer(101),b=peer(202);prepare(a,b);
        long version=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong();
        var payload=Map.of("actionId","reject","expectedVersion",version);
        String attemptId = a.request("TABLE_START", payload).path("payload").path("startAttemptId").asText();
        assertThat(attemptId).isNotBlank();
        a.awaitType("GAME_START_STATE", message ->
                message.path("payload").path("phase").asText().equals("WAITING")
                        && message.path("payload").path("startAttemptId").asText().equals(attemptId));
        a.request("TABLE_START",payload);
        assertThat(reservations).hasValue(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        assertThat(a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").isNull()).isTrue();
    }

    @Test void 만료시점_시작요청과_기한확인이_겹쳐도_한번만_퇴장확정한다() throws Exception {
        Peer a=peer(101),b=peer(202);prepare(a,b);
        long version=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload").path("version").asLong();
        var gate=new CountDownLatch(1);clock.advance(120);
        var start=CompletableFuture.supplyAsync(()->{try{gate.await();return a.request("TABLE_START",Map.of("actionId","race","expectedVersion",version));}catch(Exception e){throw new CompletionException(e);}});
        var check=CompletableFuture.supplyAsync(()->{try{gate.await();return b.request("TABLE_HOST_WAIT_CHECK",Map.of());}catch(Exception e){throw new CompletionException(e);}});
        gate.countDown();assertThat(start.get(5,TimeUnit.SECONDS).path("type").asText()).isEqualTo("ERROR");
        assertThat(check.get(5,TimeUnit.SECONDS).path("payload").path("hostUserId").asText()).isEqualTo("202");
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();assertThat(reservations).hasValue(0);
    }

    void prepare(Peer a,Peer b) throws Exception {
        a.request("TABLE_JOIN",Map.of("tableId","table-1")); b.request("TABLE_JOIN",Map.of("tableId","table-1"));
        var state=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload");
        a.request("TABLE_CONFIGURE",Map.of("gameCode","OMOK","selectedPlayers",2,"betAmountPerPlayer",1,"expectedVersion",state.path("version").asLong()));
        a.request("READY_SET",Map.of("ready",true)); b.request("READY_SET",Map.of("ready",true));
    }
    Peer peer(long user) throws Exception {
        var socket = mock(WebSocketSession.class);
        String id = UUID.randomUUID().toString();
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        var queue = new LinkedBlockingQueue<JsonNode>();
        var playingDelivered = new CountDownLatch(1);
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage text) {
                JsonNode message = mapper.readTree(text.getPayload());
                queue.add(message);
                if (message.path("type").asText().equals("GAME_START_STATE")
                        && message.path("payload").path("phase").asText().equals("PLAYING")) {
                    playingDelivered.countDown();
                }
            }
            return null;
        }).when(socket).sendMessage(any());
        var userIdentity = new VerifiedWebSocketUser(user, VerifiedWebSocketUser.Provider.NAVER,
                "00000000-0000-0000-0000-000000000001");
        assertThat(hub.connectAuthenticated(socket, userIdentity)).isTrue();
        return new Peer(id, queue, playingDelivered);
    }

    class Peer {
        final String id;
        final BlockingQueue<JsonNode> messages;
        final CountDownLatch playingDelivered;
        final Deque<JsonNode> deferredMessages = new ArrayDeque<>();

        Peer(String id, BlockingQueue<JsonNode> messages, CountDownLatch playingDelivered) {
            this.id = id;
            this.messages = messages;
            this.playingDelivered = playingDelivered;
        }
        JsonNode request(String type,Map<String,?> payload) throws Exception {
            if (type.equals("READY_SET") && Boolean.TRUE.equals(payload.get("ready"))) {
                var state=request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload");
                payload=Map.of("ready",true,"betAmountPerPlayer",state.path("betAmountPerPlayer").asLong(),"expectedVersion",state.path("version").asLong());
            }
            String request=UUID.randomUUID().toString();
            hub.receive(id,mapper.writeValueAsString(Map.of("requestId",request,"type",type,"payload",payload)));
            return awaitType(null,m -> m.path("requestId").asText().equals(request));
        }
        JsonNode awaitType(String type, Predicate<JsonNode> condition) throws Exception {
            Predicate<JsonNode> matches = message ->
                    (type == null || type.equals(message.path("type").asText())) && condition.test(message);
            var deferred = deferredMessages.iterator();
            while (deferred.hasNext()) {
                JsonNode message = deferred.next();
                if (matches.test(message)) {
                    deferred.remove();
                    return message;
                }
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            long remaining;
            while ((remaining = deadline - System.nanoTime()) > 0) {
                JsonNode message = messages.poll(remaining, TimeUnit.NANOSECONDS);
                if (message == null) {
                    break;
                }
                if (matches.test(message)) {
                    return message;
                }
                // 다른 요청의 응답이나 방송은 다음 검증까지 도착 순서대로 보존한다.
                deferredMessages.addLast(message);
            }
            throw new AssertionError("missing message " + type);
        }
    }
    static class MutableClock extends Clock {
        volatile Instant now=Instant.parse("2026-10-27T00:00:00Z");
        void advance(long seconds){now=now.plusSeconds(seconds);}
        public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return now;}
    }
}
