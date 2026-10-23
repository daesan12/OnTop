package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameDepartureFlowTests {
    @ParameterizedTest
    @CsvSource({"LOGOUT,true", "MEMBER_DEACTIVATED,true", "AUTH_SESSION_REVOKED,false",
            "HEARTBEAT_TIMEOUT,false", "TRANSPORT_ERROR,false", "SOCKET_CLOSED,false",
            "SEND_QUEUE_FULL,false", "SEND_ERROR,false", "UNSPECIFIED,false"})
    void 허브종료사유가실제엔진이탈로이어지고다른참가자의경기는계속된다(
            ConnectionCloseReason reason, boolean immediate) throws Exception {
        var mapper = new ObjectMapper().findAndRegisterModules();
        var clock = new GameReconnectTests.TestClock();
        var events = new CopyOnWriteArrayList<Object>();
        var router = new GameEngineRouter();
        var engine = new OneCardEngine(mapper, clock, events::add, router,
                cards -> { }, bound -> 0, ForfeitHandPolicy.REMOVE);
        engine.create("game", "table", List.of(101L, 202L, 303L));
        var recovery = new GameReconnectService(Optional.of(router), Optional.of(clock));
        var hub = new TableHub(mapper, Optional.empty(), false, Optional.of(recovery),
                Duration.ofHours(1), Duration.ofHours(1));
        var messages = new LinkedBlockingQueue<String>();
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("first");
        when(socket.isOpen()).thenReturn(true);
        doAnswer(call -> {
            messages.add(((TextMessage) call.getArgument(0)).getPayload());
            return null;
        }).when(socket).sendMessage(any());
        try {
            assertThat(hub.connectAuthenticated(socket, new VerifiedWebSocketUser(101,
                    VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (!recovery.canControlGame(101, "first", "game") && System.nanoTime() < until) {
                Thread.sleep(5);
            }
            assertThat(recovery.canControlGame(101, "first", "game")).isTrue();
            hub.disconnect("first", reason);
            hub.disconnect("first", reason);
            if (!immediate) {
                clock.advance(29);
                recovery.checkTimeouts();
                assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).isEmpty();
                clock.advance(1);
                recovery.checkTimeouts();
            }
            until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            List<GameParticipantLeft> departures;
            do {
                departures = events.stream().filter(GameParticipantLeft.class::isInstance)
                        .map(GameParticipantLeft.class::cast).toList();
                if (departures.isEmpty()) {
                    Thread.sleep(5);
                }
            } while (departures.isEmpty() && System.nanoTime() < until);
            assertThat(departures).hasSize(1);
            assertThat(departures.getFirst().leaveReason()).isEqualTo(immediate
                    ? GameDepartureReason.valueOf(reason.name()) : GameDepartureReason.DISCONNECT_TIMEOUT);
            assertThat(events.stream().filter(GameFinished.class::isInstance)).isEmpty();
            assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
            assertThat(router.load(202).orElseThrow().phase().name()).isEqualTo("PLAYING");
            assertThat(recovery.canControlGame(101, "first", "game")).isFalse();
            // 즉시 재접속해도 이미 상실한 경기 참가 자격을 되살리지 않는다.
            var returned = new LinkedBlockingQueue<GameReconnectService.View>();
            recovery.connected(101, "returned", (requestId, view) -> returned.add(view));
            GameReconnectService.View view;
            do {
                view = returned.poll(5, TimeUnit.SECONDS);
                assertThat(view).isNotNull();
            } while (view.status().equals("PENDING"));
            assertThat(view.status()).isEqualTo("ELIMINATED");
            assertThat(recovery.canControlGame(101, "returned", "game")).isFalse();
            assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(1);
        } finally {
            hub.shutdown();
            recovery.shutdown();
        }
    }
}
