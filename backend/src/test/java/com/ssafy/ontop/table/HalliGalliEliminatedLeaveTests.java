package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.persistence.GameSettlementCalculation;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

/**
 * S15P31B105-241. 실제 Hub·복구 서비스·할리갈리 엔진·라우터로 자연 탈락자의 경기 중 TABLE_LEAVE와
 * 미정산 참가자의 착석 사전 거절·관전 허용을 검증한다. 예약/DB 참가 상태(active_user_id)는 대역이다.
 */
class HalliGalliEliminatedLeaveTests {
    private static final long BET = 1;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final GameReconnectTests.TestClock clock = new GameReconnectTests.TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = spy(new GameEngineRouter());
    private final CommittedGameStartService starts = mock(CommittedGameStartService.class);
    // active_user_id 대역: 예약 시 참가자 전원에게 생기고, 정산 커밋 때만 사라진다.
    private final Map<Long, ActiveGameRecord> unsettled = new ConcurrentHashMap<>();
    private final AtomicInteger lookups = new AtomicInteger();
    private final AtomicInteger reservations = new AtomicInteger();
    private final List<String> games = new CopyOnWriteArrayList<>();
    private HalliGalliEngine engine;
    private GameReconnectService reconnect;
    private TableHub hub;

    @BeforeEach
    void setup() {
        // 셔플하지 않은 기본 덱: 첫 좌석의 첫 공개 카드는 딸기 1개라 이 창의 종은 언제나 틀린 종(벌칙)이다.
        engine = new HalliGalliEngine(mapper, clock, this::publish, router, cards -> { }, new Random(7),
                HalliGalliTiming.DEFAULT);
        reconnect = new GameReconnectService(Optional.of(router), Optional.of(clock));
        var channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(new Channel("one", "하나", 8))));
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(10), Duration.ofSeconds(10), channels, new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)),
                Optional.of(router), Optional.of(router), Optional.empty(), AllowedWatchFixture.allowed());
        hub.configureCommittedStarts(Optional.of(starts));
        hub.configureActiveGames(Optional.of(user -> {
            lookups.incrementAndGet();
            return Optional.ofNullable(unsettled.get(user));
        }));
        when(starts.start(any())).thenAnswer(call -> {
            GameStartCommand command = call.getArgument(0);
            long id = 70 + reservations.incrementAndGet();
            List<Long> players = command.participants().stream().map(p -> Long.parseLong(p.userId())).toList();
            engine.create(Long.toString(id), command.tableId(), players);
            for (long user : players) {
                unsettled.put(user, new ActiveGameRecord(id, "HALLI_GALLI", command.tableId(), GameSession.Status.RUNNING,
                        GameSession.SettlementStatus.PENDING, "test", UUID.randomUUID(), clock.instant(),
                        clock.instant(), null));
            }
            games.add(Long.toString(id));
            return GameStartResult.reserved(command, Long.toString(id));
        });
    }

    @AfterEach
    void close() {
        hub.shutdown();
        reconnect.shutdown();
    }

    // 엔진 알림은 운영처럼 잠금 밖에서 전달한다. 기권의 참가 종료 알림만 Hub 좌석 정리에 연결한다.
    private void publish(Object event) {
        events.add(event);
        if (event instanceof GameParticipantLeft left) { hub.gameParticipantActivityEnded(left); }
    }

    @Test
    void 세명_경기의_자연탈락자는_좌석만_놓고_LOSE로_남으며_남은_경기는_계속된다() throws Exception {
        Peer a = peer(101), b = peer(202), c = peer(303);
        String table = table(0);
        JsonNode standing = position(c, c.request("WORLD_MOVE", move(1)));
        play(table, a, b, c);
        String game = games.getFirst();

        flip(101, game);
        eliminateByWrongBells(303, game);
        assertThat(c.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
        c.start("NOT_SEATED");
        c.recovery("LOBBY");

        assertThat(watched(c, table)).containsExactly("101", "202");
        // 경기 참가·탈락 상태와 예약은 그대로다. 기권 이벤트를 만들지 않는다.
        JsonNode out = player(303, game);
        assertThat(out.path("eliminated").asBoolean()).isTrue();
        assertThat(out.path("forfeited").asBoolean()).isFalse();
        assertThat(events).noneMatch(GameParticipantLeft.class::isInstance);
        assertThat(unsettled).containsKey(303L);
        // 좌석 해제 뒤 같은 월드 좌표에서 바로 일반 이동한다(공원 입장 위치로 옮기지 않는다).
        JsonNode moved = c.request("WORLD_MOVE", move(2));
        assertThat(moved.path("type").asText()).isEqualTo("WORLD_STATE");
        JsonNode after = position(c, moved);
        assertThat(after.path("x").asDouble()).isCloseTo(standing.path("x").asDouble(), org.assertj.core.data.Offset.offset(0.05));
        assertThat(after.path("z").asDouble()).isCloseTo(standing.path("z").asDouble(), org.assertj.core.data.Offset.offset(0.05));
        assertThat(code(c.request("TABLE_LEAVE", Map.of()))).isEqualTo("NOT_SEATED");

        // 남은 참가자는 계속 공개할 수 있고, 활성 참가자의 경기 중 퇴장은 기존처럼 거절한다.
        long version = state(202, game).path("version").asLong();
        flip(202, game);
        assertThat(state(202, game).path("version").asLong()).isGreaterThan(version);
        assertThat(code(a.request("TABLE_LEAVE", Map.of()))).isEqualTo("GAME_RECOVERY_REQUIRED");
        assertThat(watched(c, table)).containsExactly("101", "202");

        // 기권은 기존 GAME_FORFEIT로만 FORFEIT이 된다. 자연 탈락자는 LOSE이고 −판돈으로 정산된다.
        assertThat(a.request("GAME_FORFEIT", Map.of("gameId", game, "actionId", UUID.randomUUID().toString()))
                .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
        GameFinished finished = only(GameFinished.class);
        assertThat(finished.participants()).extracting(GameFinished.Participant::result).containsExactly(
                GameFinished.Result.FORFEIT, GameFinished.Result.WIN, GameFinished.Result.LOSE);
        assertThat(finished.participants().get(2).leaveReason()).isNull();
        assertThat(finished.participants().get(2).leftAt()).isNull();
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance).map(GameParticipantLeft.class::cast))
                .extracting(GameParticipantLeft::userId).containsExactly(101L);
        var awards = GameSettlementCalculation.calculate(BET, finished.participants().stream()
                .map(GameFinished.Participant::result).toList()).awards();
        assertThat(awards.get(2).netDelta()).isEqualTo(-BET);
    }

    @Test
    void 네명_경기의_자연탈락자_둘이_차례로_나가도_남은_두명의_경기가_이어진다() throws Exception {
        Peer a = peer(101), b = peer(202), c = peer(303), d = peer(404);
        String table = table(0);
        play(table, a, b, c, d);
        String game = games.getFirst();

        flip(101, game);
        eliminateByWrongBells(303, game);
        eliminateByWrongBells(404, game);
        assertThat(c.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
        assertThat(d.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
        c.recovery("LOBBY");
        d.recovery("LOBBY");
        assertThat(watched(c, table)).containsExactly("101", "202");
        assertThat(state(101, game).path("status").asText()).isEqualTo("PLAYING");
        flip(202, game);
        assertThat(events).noneMatch(GameParticipantLeft.class::isInstance);

        assertThat(b.request("GAME_FORFEIT", Map.of("gameId", game, "actionId", UUID.randomUUID().toString()))
                .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
        assertThat(only(GameFinished.class).participants()).extracting(GameFinished.Participant::result).containsExactly(
                GameFinished.Result.WIN, GameFinished.Result.FORFEIT, GameFinished.Result.LOSE, GameFinished.Result.LOSE);
    }

    @Test
    void 미정산_참가자는_다른테이블_착석만_본인에게_거절되고_관전은_그대로_허용된다() throws Exception {
        Peer a = peer(101), b = peer(202), c = peer(303), e = peer(505), f = peer(606);
        String first = table(0), second = table(1);
        play(first, a, b, c);
        String game = games.getFirst();
        flip(101, game);
        eliminateByWrongBells(303, game);
        assertThat(c.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
        c.recovery("LOBBY");
        // 기권자는 기존 이탈 경로로 좌석이 풀린다. 엔진 경기가 끝나도 정산 커밋 전까지 예약 표시는 남는다.
        assertThat(a.request("GAME_FORFEIT", Map.of("gameId", game, "actionId", UUID.randomUUID().toString()))
                .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
        a.recovery("LOBBY");

        // 다른 테이블의 참가자: 일반 회원은 그대로 착석·준비한다.
        assertThat(e.request("TABLE_JOIN", Map.of("tableId", second)).path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(f.request("TABLE_JOIN", Map.of("tableId", second)).path("type").asText()).isEqualTo("TABLE_STATE");
        e.request("GAME_SELECT", Map.of("gameCode", "HALLI_GALLI", "betAmountPerPlayer", BET));
        f.request("TABLE_JOIN", Map.of("tableId", second));
        e.request("READY_SET", Map.of("ready", true));
        e.drain();
        f.drain();

        // 관전은 착석 제한과 무관하다. 미정산 참가 조회도 하지 않는다.
        int before = lookups.get();
        assertThat(c.request("TABLE_WATCH", Map.of("tableId", second)).path("type").asText()).isEqualTo("TABLE_WATCH_STATE");
        assertThat(lookups.get()).isEqualTo(before);

        // 착석 요청만 본인에게 거절된다. 좌석·준비·시작 상태는 바뀌지 않고 다른 참가자에게 아무 알림도 가지 않는다.
        JsonNode rejected = c.request("TABLE_JOIN", Map.of("tableId", second));
        assertThat(code(rejected)).isEqualTo("MEMBER_ALREADY_IN_GAME");
        assertThat(rejected.at("/payload/message").asText())
                .isEqualTo("이전 경기가 아직 진행 중이에요. 해당 경기가 종료되면 새로운 게임을 시작할 수 있어요.");
        // 기권자도 같은 정산 전 상태라 같은 기준으로 거절된다.
        assertThat(code(a.request("TABLE_JOIN", Map.of("tableId", second)))).isEqualTo("MEMBER_ALREADY_IN_GAME");
        e.assertNone(message -> !message.path("type").asText().equals("WORLD_STATE"));
        f.assertNone(message -> !message.path("type").asText().equals("WORLD_STATE"));
        assertThat(seats(e, second)).containsExactly("505", "606");
        // 이미 앉은 회원의 기존 착석 조건은 DB 조회 전에 그대로 적용된다.
        before = lookups.get();
        assertThat(code(e.request("TABLE_JOIN", Map.of("tableId", first)))).isEqualTo("ALREADY_SEATED");
        assertThat(lookups.get()).isEqualTo(before);

        // 거절된 뒤에도 기존 관전은 유지되고, 시작한 다른 경기도 관전할 수 있다.
        f.request("READY_SET", Map.of("ready", true));
        e.start("PLAYING");
        String watched = games.get(1);
        assertThat(users(c.nextWatch())).containsExactly("505", "606");
        JsonNode spectating = c.request("GAME_WATCH", Map.of("gameId", watched));
        assertThat(spectating.path("type").asText()).isEqualTo("GAME_STATE");
        assertThat(spectating.at("/payload/role").asText()).isEqualTo("SPECTATOR");
        assertThat(c.request("GAME_UNWATCH", Map.of()).path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
        assertThat(c.request("TABLE_UNWATCH", Map.of()).path("type").asText()).isEqualTo("TABLE_WATCH_LEFT");

        // 정산 커밋으로 예약 표시가 사라지고 원래 테이블이 대기 상태로 돌아오면 같은 요청으로 정상 착석한다.
        CountDownLatch recoveryStarted = new CountDownLatch(1);
        CountDownLatch releaseRecovery = new CountDownLatch(1);
        doAnswer(call -> {
            recoveryStarted.countDown();
            if (!releaseRecovery.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("종료 후 경기 복구 조회를 해제하지 않았습니다.");
            }
            return call.callRealMethod();
        }).when(router).load(101);
        try {
            hub.roundEnded(first, game);
            assertThat(recoveryStarted.await(5, TimeUnit.SECONDS)).isTrue();
            unsettled.remove(101L);
            unsettled.remove(202L);
            unsettled.remove(303L);
            hub.roundSettled(new com.ssafy.ontop.game.result.GameResultCommitted(new GameResultView(202, 2, game,
                    "HALLI_GALLI", GameResultView.Status.FINISHED, "LAST_PLAYER_STANDING",
                    GameResultView.SettlementStatus.SETTLED, BET, List.of(new GameResultView.Participant("101", "FORFEIT"),
                            new GameResultView.Participant("202", "WIN"), new GameResultView.Participant("303", "LOSE")),
                    2L, clock.instant())));
            // 느린 CI에서도 복구 중 착석 보호를 유지하고, 실제 복구 완료 이후에만 다시 앉는다.
            assertThat(code(a.request("TABLE_JOIN", Map.of("tableId", first)))).isEqualTo("GAME_RECOVERY_REQUIRED");
            releaseRecovery.countDown();
            a.awaitLobbyAccess();
            c.awaitLobbyAccess();
            JsonNode joined = a.request("TABLE_JOIN", Map.of("tableId", first));
            assertThat(joined.path("type").asText()).as(joined.toString()).isEqualTo("TABLE_STATE");
            assertThat(c.request("TABLE_JOIN", Map.of("tableId", first)).path("type").asText()).isEqualTo("TABLE_STATE");
            assertThat(seats(a, first)).containsExactlyInAnyOrder("101", "202", "303");
        } finally {
            releaseRecovery.countDown();
        }
    }

    private void play(String table, Peer... players) throws Exception {
        for (Peer player : players) {
            assertThat(player.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
        }
        players[0].request("GAME_SELECT", Map.of("gameCode", "HALLI_GALLI", "betAmountPerPlayer", BET));
        for (Peer player : players) {
            player.request("TABLE_JOIN", Map.of("tableId", table));
            player.request("READY_SET", Map.of("ready", true));
        }
        for (Peer player : players) {
            player.start("PLAYING");
            player.recovery("RESTORED");
        }
    }

    private void flip(long user, String game) {
        engine.apply(new GameActionCommand(user, game, UUID.randomUUID().toString(),
                state(user, game).path("version").asLong(), mapper.createObjectNode().put("kind", "flip")));
    }

    // 맞는 과일 합이 없는 창에서 종을 계속 쳐 뒷면 카드를 모두 잃게 한다. 부족분이 발행되면 규칙상 탈락이다.
    private void eliminateByWrongBells(long user, String game) {
        for (int ring = 0; ring < 60 && !player(user, game).path("eliminated").asBoolean(); ring++) {
            JsonNode state = state(user, game);
            engine.apply(new GameActionCommand(user, game, UUID.randomUUID().toString(), state.path("version").asLong(),
                    mapper.createObjectNode().put("kind", "ring").put("bellWindowId", state.path("bellWindowId").asLong())));
        }
        JsonNode player = player(user, game);
        assertThat(player.path("eliminated").asBoolean()).isTrue();
        assertThat(player.path("forfeited").asBoolean()).isFalse();
        assertThat(state(user, game).path("status").asText()).isEqualTo("PLAYING");
    }

    private JsonNode state(long user, String game) {
        return engine.load(user, game).orElseThrow().publicState();
    }

    private JsonNode player(long user, String game) {
        for (JsonNode player : state(user, game).path("players")) {
            if (player.path("userId").asText().equals(Long.toString(user))) { return player; }
        }
        throw new AssertionError("참가자 없음: " + user);
    }

    private <T> T only(Class<T> type) {
        var matching = events.stream().filter(type::isInstance).map(type::cast).toList();
        assertThat(matching).hasSize(1);
        return matching.getFirst();
    }

    // 대기 중 테이블에 앉은 참가자의 같은 테이블 TABLE_JOIN은 좌석을 바꾸지 않고 현재 TABLE_STATE만 돌려준다.
    private List<String> seats(Peer seated, String table) throws Exception {
        return users(seated.request("TABLE_JOIN", Map.of("tableId", table)));
    }

    // 경기 중 테이블은 앉지 않은 회원의 관전 상태로 좌석을 읽는다.
    private List<String> watched(Peer viewer, String table) throws Exception {
        JsonNode state = viewer.request("TABLE_WATCH", Map.of("tableId", table));
        assertThat(state.path("type").asText()).isEqualTo("TABLE_WATCH_STATE");
        return users(state);
    }

    private static List<String> users(JsonNode table) {
        List<String> users = new ArrayList<>();
        for (JsonNode seat : table.at("/payload/seats")) {
            if (seat.path("userId").isTextual()) { users.add(seat.path("userId").asText()); }
        }
        return users;
    }

    private String table(int index) {
        return hub.listTables("one").tables().get(index).tableId();
    }

    private static Map<String, Object> move(long seq) {
        return Map.of("seq", seq, "dx", 0, "dz", 0, "run", false);
    }

    private static JsonNode position(Peer peer, JsonNode world) {
        for (JsonNode avatar : world.at("/payload/avatars")) {
            if (avatar.path("userId").asText().equals(peer.userId)) { return avatar.path("position"); }
        }
        throw new AssertionError("아바타 없음: " + peer.userId);
    }

    private static String code(JsonNode message) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        return message.at("/payload/code").asText();
    }

    private Peer peer(long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        when(session.isOpen()).thenReturn(true);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(ReadyConsent.received(peer, mapper.readTree(text.getPayload())));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(accountId,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
        peer.userId = peer.await(m -> m.path("type").asText().equals("CONNECTED")).at("/payload/userId").asText();
        peer.recovery("LOBBY");
        peer.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        return peer;
    }

    private final class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private final Deque<JsonNode> deferred = new ArrayDeque<>();
        private final List<String> log = new ArrayList<>();
        private String userId;

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type,
                    "payload", ReadyConsent.payload(this, type, payload))));
            return await(m -> m.path("requestId").asText().equals(requestId));
        }

        private JsonNode recovery(String status) throws Exception {
            return await(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE")
                    && m.at("/payload/status").asText().equals(status));
        }

        // 지연된 예전 LOBBY 방송이 아니라 현재 복구 슬롯의 로비 허용 상태를 기다린다.
        private void awaitLobbyAccess() {
            Awaitility.await().atMost(Duration.ofSeconds(5))
                    .until(() -> reconnect.canUseLobby(Long.parseLong(userId), id));
        }

        private JsonNode start(String phase) throws Exception {
            return await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.at("/payload/phase").asText().equals(phase));
        }

        private JsonNode nextWatch() throws Exception {
            return await(m -> m.path("type").asText().equals("TABLE_WATCH_STATE"));
        }

        private void drain() throws Exception {
            JsonNode message;
            while ((message = messages.poll(200, TimeUnit.MILLISECONDS)) != null) { log.add(message.path("type").asText()); }
            deferred.clear();
        }

        private void assertNone(Predicate<JsonNode> forbidden) throws Exception {
            JsonNode message;
            while ((message = messages.poll(300, TimeUnit.MILLISECONDS)) != null) {
                assertThat(forbidden.test(message)).as(message.toString()).isFalse();
            }
        }

        private JsonNode await(Predicate<JsonNode> condition) throws Exception {
            var iterator = deferred.iterator();
            while (iterator.hasNext()) {
                JsonNode message = iterator.next();
                if (condition.test(message)) { iterator.remove(); return message; }
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            long remaining;
            while ((remaining = deadline - System.nanoTime()) > 0) {
                JsonNode message = messages.poll(remaining, TimeUnit.NANOSECONDS);
                if (message == null) { break; }
                log.add(message.path("type").asText() + ":" + message.path("requestId").asText());
                if (condition.test(message)) { return message; }
                deferred.addLast(message);
            }
            throw new AssertionError("missing message; received=" + log);
        }
    }
}
