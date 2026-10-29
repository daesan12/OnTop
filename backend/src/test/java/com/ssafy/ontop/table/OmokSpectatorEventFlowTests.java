package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 실제 티켓 인증·확정 시작·오목 엔진·관전 구독으로 관전자 채팅·핑을 검증한다. 예약·정산 저장은 테스트 대역이다.
 * 계약: docs/websocket-api/10-game-spectator-events.md
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.omok.enabled=true", "server.address=127.0.0.1",
        "ontop.world.movement.minimum-interval=1ms",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=관전검증",
        "ontop.world.channels[0].capacity=8", "ontop.world.channels[1].channel-id=two",
        "ontop.world.channels[1].name=격리검증", "ontop.world.channels[1].capacity=8",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class,
        MemberAuthenticationFixture.class, FrozenWorldFixture.class, TableGameIdFlowTests.LifecycleFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OmokSpectatorEventFlowTests {
    private static final String TABLE = tableId(1);
    private static final String OTHER_TABLE = tableId(2);
    private static final String GAME = "committed-test-game";
    private static final String OTHER_GAME = GAME + "-2";
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private CommittedStartFlowTests.ReservationDouble reservation;
    @Autowired private TableGameIdFlowTests.LifecycleEvents lifecycle;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") private Clock oauthClock;
    private final List<ScenarioClient> clients = new ArrayList<>();
    private long moveSequence;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry registry) {
        for (String table : new String[] {TABLE, OTHER_TABLE}) {
            registry.add("ontop.world.proximity.tables[" + table + "].x", () -> 0);
            registry.add("ontop.world.proximity.tables[" + table + "].z", () -> 0);
        }
    }

    @BeforeEach
    void accounts() {
        when(oauthClock.instant()).thenAnswer(call -> clock.instant());
        for (long id : List.of(101L, 202L, 505L, 606L, 707L, 808L, 909L, 1010L, 1111L)) {
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    id, VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
        }
    }

    @org.junit.jupiter.api.AfterEach
    void close() throws Exception {
        for (ScenarioClient client : clients) { client.close(); }
    }

    @Test
    void 두플레이어와_승인관전자에게만_전달하고_다른경기_채널_미승인자는_차단하며_판과_정산은_그대로다() throws Exception {
        var tableViewer = connect(707, "one");
        near(tableViewer);
        tableViewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
        var otherViewer = connect(808, "one");
        near(otherViewer);
        otherViewer.request("TABLE_WATCH", Map.of("tableId", OTHER_TABLE));
        var first = connect(101, "one");
        var second = connect(202, "one");
        start(TABLE, first, second, tableViewer, GAME, true);
        var otherFirst = connect(909, "one");
        var otherSecond = connect(1010, "one");
        start(OTHER_TABLE, otherFirst, otherSecond, otherViewer, OTHER_GAME, false);
        var viewerA = connect(505, "one");
        var viewerB = connect(606, "one");
        var elsewhere = connect(1111, "two");
        for (var client : List.of(viewerA, viewerB, elsewhere)) { near(client); }
        JsonNode watched = watch(viewerA, GAME);
        watch(viewerB, GAME);
        watch(otherViewer, OTHER_GAME);
        // 다른 경기의 단발 조회는 현재 관전 구독의 참가자·상태 메타데이터를 바꾸면 안 된다.
        assertThat(viewerA.request("GAME_STATE_CHECK", Map.of("gameId", OTHER_GAME))
                .at("/payload/gameId").asText()).isEqualTo(OTHER_GAME);
        var black = watched.at("/payload/publicState/blackUserId").asText().equals(first.userId) ? first : second;
        var white = black == first ? second : first;
        JsonNode before = black.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).at("/payload");

        // 채팅: 발신자는 원래 requestId로 1건, 플레이어 2명과 다른 승인 관전자는 requestId=null로 1건.
        String chatId = UUID.randomUUID().toString();
        String requestId = viewerA.sendRequest("GAME_SPECTATOR_CHAT_SEND",
                Map.of("gameId", GAME, "eventId", chatId, "text", "  가운데 쪽을 막아봐요!  "));
        JsonNode ack = viewerA.await(m -> m.path("requestId").asText().equals(requestId));
        assertThat(ack.path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        JsonNode chat = ack.path("payload");
        assertThat(chat.path("gameId").asText()).isEqualTo(GAME);
        assertThat(chat.path("eventId").asText()).isEqualTo(chatId);
        assertThat(chat.path("senderUserId").asText()).isEqualTo("505");
        assertThat(chat.path("text").asText()).isEqualTo("가운데 쪽을 막아봐요!");
        assertThat(chat.path("sentAt").isIntegralNumber()).isTrue();
        assertThat(chat.path("expiresAt").asLong() - chat.path("sentAt").asLong()).isEqualTo(3000);
        assertThat(chat.path("serverNow").asLong()).isEqualTo(chat.path("sentAt").asLong());
        assertThat(code(viewerA.request("GAME_SPECTATOR_CHAT_SEND", Map.of("gameId", GAME,
                "eventId", UUID.randomUUID().toString(), "text", "또")))).isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
        for (ScenarioClient receiver : List.of(black, white, viewerB)) {
            JsonNode notice = receiver.awaitSpectatorEvent(chatId);
            assertThat(notice.path("requestId").isNull()).isTrue();
            assertThat(notice.path("payload")).isEqualTo(chat);
        }

        // 같은 내용 재전송은 원래 시각으로 요청자에게만 확인하고, 다른 내용은 충돌이다.
        JsonNode duplicate = viewerA.request("GAME_SPECTATOR_CHAT_SEND",
                Map.of("gameId", GAME, "eventId", chatId, "text", "가운데 쪽을 막아봐요!"));
        assertThat(duplicate.path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        assertThat(duplicate.at("/payload/sentAt").asLong()).isEqualTo(chat.path("sentAt").asLong());
        assertThat(duplicate.at("/payload/expiresAt").asLong()).isEqualTo(chat.path("expiresAt").asLong());
        assertThat(code(viewerA.request("GAME_SPECTATOR_CHAT_SEND",
                Map.of("gameId", GAME, "eventId", chatId, "text", "다른 내용"))))
                .isEqualTo("GAME_SPECTATOR_EVENT_ID_CONFLICT");

        // 핑: x=열 14, y=행 0. 두 플레이어와 다른 승인 관전자에게 같은 좌표로 간다.
        String pingId = UUID.randomUUID().toString();
        JsonNode pingAck = viewerB.request("OMOK_SPECTATOR_PING_SEND",
                Map.of("gameId", GAME, "eventId", pingId, "basedOnVersion", 0, "x", 14, "y", 0));
        assertThat(pingAck.path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
        JsonNode ping = pingAck.path("payload");
        assertThat(ping.path("senderUserId").asText()).isEqualTo("606");
        assertThat(ping.path("basedOnVersion").asLong()).isZero();
        assertThat(ping.path("x").asInt()).isEqualTo(14);
        assertThat(ping.path("y").asInt()).isZero();
        assertThat(ping.path("expiresAt").asLong() - ping.path("sentAt").asLong()).isEqualTo(2000);
        for (ScenarioClient receiver : List.of(black, white, viewerA)) {
            assertThat(receiver.awaitSpectatorEvent(pingId).path("payload")).isEqualTo(ping);
        }

        // 다른 경기의 승인 관전자는 이 경기로 보낼 수 없고, 자기 경기 이벤트는 이 경기에 섞이지 않는다.
        assertThat(code(otherViewer.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "남의 경기"))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        String otherChat = UUID.randomUUID().toString();
        assertThat(otherViewer.request("GAME_SPECTATOR_CHAT_SEND", Map.of("gameId", OTHER_GAME,
                "eventId", otherChat, "text", "옆 경기")).path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        otherFirst.awaitSpectatorEvent(otherChat);
        otherSecond.awaitSpectatorEvent(otherChat);
        // 플레이어 핑·테이블 보기만 한 근처 사용자·다른 채널 사용자는 발신할 수 없다.
        assertThat(code(black.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 7))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        assertThat(code(white.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 7))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        assertThat(code(tableViewer.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "보기만"))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        assertThat(code(elsewhere.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 7))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        Thread.sleep(300);
        for (ScenarioClient outsider : List.of(tableViewer, otherViewer, otherFirst, otherSecond, elsewhere)) {
            assertThat(outsider.spectatorEvents(chatId)).as(outsider.userId).isEmpty();
            assertThat(outsider.spectatorEvents(pingId)).as(outsider.userId).isEmpty();
        }
        // 발신자 A만 원 요청 확인과 중복 재요청 확인 2건(모두 자기 requestId)을 받고, 나머지는 방송 1건뿐이다.
        assertThat(viewerA.spectatorEvents(chatId)).extracting(m -> m.path("requestId").isNull())
                .containsExactly(false, false);
        for (ScenarioClient member : List.of(black, white, viewerA, viewerB)) {
            if (member != viewerA) {
                assertThat(member.spectatorEvents(chatId)).as(member.userId).hasSize(1);
            }
            assertThat(member.spectatorEvents(pingId)).as(member.userId).hasSize(1);
            assertThat(member.spectatorEvents(otherChat)).as(member.userId).isEmpty();
        }

        // 채팅·핑은 판·버전·차례·마감을 바꾸지 않는다.
        JsonNode after = black.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).at("/payload");
        assertThat(after.path("version").asLong()).isZero();
        assertThat(after.path("publicState")).isEqualTo(before.path("publicState"));

        // 착수 뒤에는 관전자가 받은 최신 버전으로만 핑을 승인한다.
        assertThat(black.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "black-1",
                "expectedVersion", 0, "input", Map.of("x", 7, "y", 7))).at("/payload/version").asLong()).isEqualTo(1);
        viewerA.await(m -> m.path("type").asText().equals("GAME_STATE") && m.at("/payload/version").asLong() == 1);
        assertThat(code(viewerA.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 8))))
                .isEqualTo("OMOK_SPECTATOR_PING_STALE_VERSION");
        assertThat(code(viewerA.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 2, 7, 8))))
                .isEqualTo("OMOK_SPECTATOR_PING_STALE_VERSION");
        String latestPing = UUID.randomUUID().toString();
        assertThat(viewerA.request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", GAME, "eventId", latestPing,
                "basedOnVersion", 1, "x", 0, "y", 14)).at("/payload/basedOnVersion").asLong()).isEqualTo(1);
        assertThat(white.awaitSpectatorEvent(latestPing).at("/payload/y").asInt()).isEqualTo(14);

        // 기권 종료 뒤에는 보낼 수 없고 결과·정산 흐름은 그대로 이어진다.
        assertThat(white.request("GAME_FORFEIT", Map.of("gameId", GAME, "actionId", "white-leave"))
                .path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
        viewerB.await(m -> m.path("type").asText().equals("GAME_STATE")
                && m.at("/payload/publicState/status").asText().equals("FINISHED"));
        assertThat(code(viewerB.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "끝났나요"))))
                .isEqualTo("GAME_SPECTATOR_GAME_NOT_PLAYING");
        assertThat(code(viewerB.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 2, 1, 1))))
                .isEqualTo("GAME_SPECTATOR_GAME_NOT_PLAYING");
        assertThat(code(black.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "종료 뒤 플레이어"))))
                .isNotEqualTo("");
        // 종료 알림은 관전 상태 전송과 별도 순서로 끝나므로 기록될 때까지 기다린다.
        for (int attempt = 0; attempt < 100 && lifecycle.finished.isEmpty(); attempt++) { Thread.sleep(50); }
        assertThat(lifecycle.finished).hasSize(1);
        GameFinished finished = lifecycle.finished.getFirst();
        assertThat(finished.participants().stream().filter(p -> p.result() == GameFinished.Result.WIN)
                .map(GameFinished.Participant::userId)).containsExactly(Long.parseLong(black.userId));
        assertThat(reservation.reservations).hasValue(2);
        events.publishEvent(new GameResultCommitted(new GameResultView(Long.parseLong(white.userId), 1, GAME, "OMOK",
                GameResultView.Status.FINISHED, finished.endReason(), GameResultView.SettlementStatus.SETTLED, 1,
                List.of(new GameResultView.Participant(black.userId, "WIN"),
                        new GameResultView.Participant(white.userId, "FORFEIT")), -1L, clock.instant())));
        assertThat(summary(TABLE).path("status").asText()).isEqualTo("WAITING");
        assertThat(summary(OTHER_TABLE).path("status").asText()).isEqualTo("PLAYING");
    }

    @Test
    void 경기별상한_만료_거리이탈_관전해제_채널이동_재접속에서_발신과_새전달을_막는다() throws Exception {
        var first = connect(101, "one");
        var second = connect(202, "one");
        List<ScenarioClient> viewers = new ArrayList<>();
        for (long id : List.of(505L, 606L, 707L, 808L, 909L, 1010L)) {
            var viewer = connect(id, "one");
            near(viewer);
            viewers.add(viewer);
        }
        viewers.getFirst().request("TABLE_WATCH", Map.of("tableId", TABLE));
        start(TABLE, first, second, viewers.getFirst(), GAME, true);
        for (var viewer : viewers) { watch(viewer, GAME); }

        // 경기 전체 채팅은 3초에 3건, 핑은 2초에 5건까지다.
        for (int index = 0; index < 3; index++) {
            assertThat(viewers.get(index).request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "훈수" + index))
                    .path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        }
        assertThat(code(viewers.get(3).request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "넷째"))))
                .isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
        List<String> pings = new ArrayList<>();
        for (int index = 0; index < 5; index++) {
            String id = UUID.randomUUID().toString();
            pings.add(id);
            assertThat(viewers.get(index).request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", GAME, "eventId", id,
                    "basedOnVersion", 0, "x", index, "y", index)).path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
        }
        assertThat(code(viewers.get(5).request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 5, 5))))
                .isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
        for (String id : pings) {
            first.awaitSpectatorEvent(id);
            second.awaitSpectatorEvent(id);
        }

        // 만료된 이벤트는 같은 내용으로 다시 보내도 살리지 않는다.
        Thread.sleep(2100);
        assertThat(code(viewers.getFirst().request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", GAME,
                "eventId", pings.getFirst(), "basedOnVersion", 0, "x", 0, "y", 0))))
                .isEqualTo("GAME_SPECTATOR_EVENT_EXPIRED");

        // 거리 이탈·관전 해제·채널 이동 뒤에는 발신이 거절되고 새 이벤트도 받지 않는다.
        var away = viewers.get(0);
        move(away, 21, 0);
        away.await(m -> m.path("type").asText().equals("GAME_WATCH_LEFT"));
        assertThat(code(away.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "멀어요"))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        var unwatched = viewers.get(1);
        assertThat(unwatched.request("GAME_UNWATCH", Map.of()).path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
        assertThat(code(unwatched.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 3, 3))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        var moved = viewers.get(2);
        moved.sendRequest("CHANNEL_LEAVE", Map.of());
        moved.await(m -> m.path("type").asText().equals("GAME_WATCH_LEFT"));
        moved.request("CHANNEL_JOIN", Map.of("channelId", "two"));
        near(moved);
        assertThat(code(moved.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "채널이동"))))
                .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        String afterLeave = UUID.randomUUID().toString();
        assertThat(viewers.get(3).request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", GAME, "eventId", afterLeave,
                "basedOnVersion", 0, "x", 9, "y", 9)).path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
        first.awaitSpectatorEvent(afterLeave);
        viewers.get(4).awaitSpectatorEvent(afterLeave);
        Thread.sleep(300);
        for (var left : List.of(away, unwatched, moved)) {
            assertThat(left.spectatorEvents(afterLeave)).as(left.userId).isEmpty();
        }

        // 재접속하면 과거 이벤트를 재생하지 않고, 다시 GAME_WATCH해야 하며, 같은 eventId도 재방송하지 않는다.
        var leaving = viewers.get(4);
        String sentBefore = UUID.randomUUID().toString();
        Thread.sleep(1000);
        assertThat(leaving.request("GAME_SPECTATOR_CHAT_SEND", Map.of("gameId", GAME, "eventId", sentBefore,
                "text", "다시 올게요")).path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        first.awaitSpectatorEvent(sentBefore);
        leaving.close();
        clients.remove(leaving);
        var returned = reconnect(Long.parseLong(leaving.userId));
        near(returned);
        assertThat(code(returned.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "복귀")))).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        watch(returned, GAME);
        JsonNode resent = returned.request("GAME_SPECTATOR_CHAT_SEND", Map.of("gameId", GAME, "eventId", sentBefore,
                "text", "다시 올게요"));
        assertThat(resent.path("type").asText()).as("수명 안이면 원래 승인 확인, 지났으면 만료")
                .isIn("GAME_SPECTATOR_CHAT_MESSAGE", "ERROR");
        if (resent.path("type").asText().equals("ERROR")) {
            assertThat(code(resent)).isEqualTo("GAME_SPECTATOR_EVENT_EXPIRED");
        }
        Thread.sleep(300);
        assertThat(first.spectatorEvents(sentBefore)).hasSize(1);
        assertThat(second.spectatorEvents(sentBefore)).hasSize(1);
        assertThat(returned.spectatorEvents(afterLeave)).isEmpty();
        assertThat(returned.spectatorEvents(pings.get(1))).isEmpty();
    }

    @Test
    void 채팅과_핑은_30초_착수마감과_시간패를_바꾸지않는다() throws Exception {
        var first = connect(101, "one");
        var second = connect(202, "one");
        var viewer = connect(505, "one");
        near(viewer);
        viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
        start(TABLE, first, second, viewer, GAME, true);
        JsonNode watched = watch(viewer, GAME);
        String deadline = watched.at("/payload/publicState/turnDeadline").asText();
        String turn = watched.at("/payload/publicState/turnUserId").asText();
        var waiting = first.userId.equals(turn) ? second : first;

        clock.advanceSeconds(29);
        assertThat(viewer.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "시간 조심")).path("type").asText())
                .isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
        assertThat(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 7)).path("type").asText())
                .isEqualTo("OMOK_SPECTATOR_PING");
        JsonNode still = waiting.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).at("/payload");
        assertThat(still.path("version").asLong()).isZero();
        assertThat(still.at("/publicState/status").asText()).isEqualTo("PLAYING");
        assertThat(still.at("/publicState/turnDeadline").asText()).isEqualTo(deadline);
        assertThat(still.at("/publicState/moveCount").asInt()).isZero();

        clock.advanceSeconds(1);
        JsonNode ended = viewer.await(m -> m.path("type").asText().equals("GAME_STATE")
                && m.at("/payload/version").asLong() == 1);
        assertThat(ended.at("/payload/publicState/status").asText()).isEqualTo("FINISHED");
        assertThat(ended.at("/payload/publicState/endReason").asText()).isEqualTo("TURN_TIMEOUT");
        assertThat(ended.at("/payload/publicState/winnerUserId").asText()).isEqualTo(waiting.userId);
        assertThat(ended.at("/payload/publicState/endedAt").asText()).isEqualTo(deadline);
        assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 1, 7, 7))))
                .isEqualTo("GAME_SPECTATOR_GAME_NOT_PLAYING");
    }

    @Test
    void 플레이어는_차례와무관하게_채팅하고_관전자와주고받되_핑과다른경기는_거절한다() throws Exception {
        var first = connect(101, "one");
        var second = connect(202, "one");
        var viewer = connect(505, "one");
        near(viewer);
        viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
        start(TABLE, first, second, viewer, GAME, true);
        watch(viewer, GAME);
        JsonNode before = first.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("payload");
        second.request("GAME_STATE_CHECK", Map.of("gameId", GAME));
        for (var sender : List.of(first, second)) {
            String event = UUID.randomUUID().toString();
            Map<String, Object> payload = Map.of("gameId", GAME, "eventId", event, "text", "플레이어 채팅");
            JsonNode ack = sender.request("GAME_SPECTATOR_CHAT_SEND", payload);
            assertThat(ack.path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            assertThat(ack.at("/payload/senderUserId").asText()).isEqualTo(sender.userId);
            for (var receiver : List.of(first, second, viewer)) {
                assertThat(receiver.awaitSpectatorEvent(event).path("payload")).isEqualTo(ack.path("payload"));
            }
            JsonNode retry = sender.request("GAME_SPECTATOR_CHAT_SEND", payload).path("payload");
            assertThat(retry.path("eventId")).isEqualTo(ack.at("/payload/eventId"));
            assertThat(retry.path("sentAt")).isEqualTo(ack.at("/payload/sentAt"));
            assertThat(retry.path("expiresAt")).isEqualTo(ack.at("/payload/expiresAt"));
            assertThat(code(sender.request("GAME_SPECTATOR_CHAT_SEND", chat(GAME, "연속"))))
                    .isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
            assertThat(code(sender.request("OMOK_SPECTATOR_PING_SEND", ping(GAME, 0, 7, 7))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(code(sender.request("GAME_SPECTATOR_CHAT_SEND", chat(OTHER_GAME, "다른 경기"))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        }
        JsonNode after = first.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("payload");
        assertThat(after.path("publicState")).isEqualTo(before.path("publicState"));
        assertThat(after.path("version")).isEqualTo(before.path("version"));
        assertThat(reservation.reservations.get()).isEqualTo(1);
    }

    private void start(String table, ScenarioClient first, ScenarioClient second, ScenarioClient tableViewer,
            String game, boolean release) throws Exception {
        assertThat(first.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
        first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
        assertThat(second.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
        for (var player : List.of(first, second)) {
            assertThat(player.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText()).isEqualTo("TABLE_STATE");
            assertThat(player.request("READY_SET", Map.of("ready", true)).path("type").asText()).isEqualTo("TABLE_STATE");
        }
        if (release) { reservation.release.countDown(); }
        tableViewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE")
                && message.at("/payload/gameId").asText().equals(game));
        first.state("RESTORED");
        second.state("RESTORED");
    }

    private JsonNode watch(ScenarioClient viewer, String game) throws Exception {
        JsonNode state = viewer.request("GAME_WATCH", Map.of("gameId", game));
        assertThat(state.path("type").asText()).as(state.toString()).isEqualTo("GAME_STATE");
        assertThat(state.at("/payload/role").asText()).isEqualTo("SPECTATOR");
        return state;
    }

    private void near(ScenarioClient client) {
        positions.move(client.userId, new WorldChannelRegistry.Position(++moveSequence, 0, .8, 0, 0));
    }

    // 거리 계약만 분리한다. 서버가 신뢰하는 위치를 넣고 이동 요청으로 범위 재검사를 실행한다.
    private void move(ScenarioClient client, double x, double z) throws Exception {
        long sequence = ++moveSequence;
        positions.move(client.userId, new WorldChannelRegistry.Position(sequence, x, .8, z, 0));
        assertThat(client.request("WORLD_MOVE", Map.of("seq", sequence, "dx", 0, "dz", 0, "run", false))
                .path("type").asText()).isEqualTo("WORLD_STATE");
    }

    private Map<String, Object> chat(String game, String text) {
        return Map.of("gameId", game, "eventId", UUID.randomUUID().toString(), "text", text);
    }

    private Map<String, Object> ping(String game, long version, int x, int y) {
        return Map.of("gameId", game, "eventId", UUID.randomUUID().toString(), "basedOnVersion", version,
                "x", x, "y", y);
    }

    private String code(JsonNode message) {
        assertThat(message.path("type").asText()).as(message.toString()).isEqualTo("ERROR");
        return message.at("/payload/code").asText();
    }

    private ScenarioClient connect(long user, String channel) throws Exception {
        var response = http("POST", "/api/v1/auth/websocket-ticket", user);
        assertThat(response.statusCode()).isEqualTo(200);
        var client = new ScenarioClient(port, Long.toString(user), mapper.readTree(response.body()).path("ticket").asText());
        clients.add(client);
        client.state("LOBBY");
        assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", channel)).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
        return client;
    }

    // 서버가 이전 연결 종료를 처리하기 전의 새 연결은 기존 계약대로 거절되므로 처리될 때까지 다시 시도한다.
    private ScenarioClient reconnect(long user) throws Exception {
        for (int attempt = 0; ; attempt++) {
            try {
                return connect(user, "one");
            } catch (AssertionError exception) {
                clients.removeLast().close();
                if (attempt == 20) { throw exception; }
                Thread.sleep(100);
            }
        }
    }

    private JsonNode summary(String table) throws Exception {
        var response = http("GET", "/api/v1/tables?channelId=one", 101);
        assertThat(response.statusCode()).isEqualTo(200);
        for (JsonNode summary : mapper.readTree(response.body()).path("tables")) {
            if (summary.path("tableId").asText().equals(table)) { return summary; }
        }
        throw new AssertionError("검증 테이블 없음");
    }

    private HttpResponse<String> http(String method, String path, long user) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private static String tableId(int number) {
        return "table-" + UUID.nameUUIDFromBytes(("one\0table-" + number).getBytes(StandardCharsets.UTF_8));
    }
}
