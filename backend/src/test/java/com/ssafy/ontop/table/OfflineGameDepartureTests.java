package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.auth.service.AuthenticationRevocations.Reason;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OfflineGameDepartureTests {
    private static final String SID = "11111111-1111-4111-8111-111111111111";
    private static final String OTHER = "22222222-2222-4222-8222-222222222222";

    @ParameterizedTest
    @EnumSource(value = Reason.class, names = {"LOGOUT", "MEMBER_DEACTIVATED"})
    void 네트워크단절뒤_커밋된로그아웃과탈퇴는_즉시한번만탈락한다(Reason reason) throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.hub.disconnect("first", ConnectionCloseReason.SOCKET_CLOSED);
            fixture.revoke(reason, SID, false);
            fixture.revoke(reason, SID, false);
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(fixture.left()).hasSize(1));
            assertThat(fixture.left().getFirst().leaveReason().name()).isEqualTo(reason.name());
            assertThat(fixture.router.load(202).orElseThrow().phase().name()).isEqualTo("PLAYING");
        }
    }

    @Test
    void 다른로그인세션과롤백은_오프라인경기를기권시키지않는다() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.hub.disconnect("first", ConnectionCloseReason.SOCKET_CLOSED);
            fixture.revoke(Reason.LOGOUT, OTHER, false);
            fixture.revoke(Reason.LOGOUT, SID, true);
            fixture.assertGrace();
        }
    }

    @Test
    void 새로그인세션으로복귀한경기는_옛세션로그아웃에영향받지않는다() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.hub.disconnect("first", ConnectionCloseReason.SOCKET_CLOSED);
            fixture.connect("returned", OTHER);
            fixture.revoke(Reason.LOGOUT, SID, false);
            fixture.hub.disconnect("returned", ConnectionCloseReason.SOCKET_CLOSED);
            fixture.assertGrace();
        }
    }

    @Test
    void 인증종료가먼저확정됐으면_후속로그아웃이사유를승격하지않는다() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.hub.disconnect("first", ConnectionCloseReason.AUTH_SESSION_REVOKED);
            fixture.revoke(Reason.LOGOUT, SID, false);
            fixture.assertGrace();
        }
    }

    @Test
    void 로그아웃이허브단절정리보다먼저도착해도_즉시이탈을놓치지않는다() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.revoke(Reason.LOGOUT, SID, false);
            fixture.hub.disconnect("first", ConnectionCloseReason.SOCKET_CLOSED);
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(fixture.left()).hasSize(1));
            assertThat(fixture.left().getFirst().leaveReason().name()).isEqualTo("LOGOUT");
        }
    }

    @Test
    void 로그아웃알림을보관중이어도_인증레지스트리의최초종료사유가우선한다() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.revoke(Reason.LOGOUT, SID, false);
            fixture.hub.disconnect("first", ConnectionCloseReason.AUTH_SESSION_REVOKED);
            fixture.assertGrace();
        }
    }

    @ParameterizedTest
    @EnumSource(value = Reason.class, names = {"SESSION_REVOKED", "REFRESH_REUSE_DETECTED"})
    void 일반인증폐기는_명시적로그아웃으로추정하지않는다(Reason reason) throws Exception {
        try (var fixture = new Fixture()) {
            fixture.connect("first", SID);
            fixture.hub.disconnect("first", ConnectionCloseReason.SOCKET_CLOSED);
            fixture.revoke(reason, SID, false);
            fixture.assertGrace();
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class Events { }

    private static final class Fixture implements AutoCloseable {
        final GameReconnectTests.TestClock clock = new GameReconnectTests.TestClock();
        final CopyOnWriteArrayList<Object> events = new CopyOnWriteArrayList<>();
        final GameEngineRouter router = new GameEngineRouter();
        final AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        final GameReconnectService recovery;
        final TableHub hub;
        final TransactionTemplate tx = new TransactionTemplate(new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        });

        Fixture() {
            var mapper = new ObjectMapper().findAndRegisterModules();
            var engine = new OneCardEngine(mapper, clock, events::add, router,
                    cards -> { }, bound -> 0, ForfeitHandPolicy.REMOVE);
            engine.create("game", "table", List.of(101L, 202L, 303L));
            context.getEnvironment().setActiveProfiles("local");
            context.registerBean(Clock.class, () -> clock);
            context.registerBean(GameRecoveryGateway.class, () -> router);
            context.register(Events.class, GameReconnectService.class, AuthenticationRevocations.class);
            context.refresh();
            recovery = context.getBean(GameReconnectService.class);
            hub = new TableHub(mapper, Optional.empty(), false, Optional.of(recovery),
                    Duration.ofHours(1), Duration.ofHours(1));
        }

        void connect(String socketId, String loginId) throws Exception {
            var socket = mock(WebSocketSession.class);
            when(socket.getId()).thenReturn(socketId);
            when(socket.isOpen()).thenReturn(true);
            assertThat(hub.connectAuthenticated(socket,
                    new VerifiedWebSocketUser(101, VerifiedWebSocketUser.Provider.NAVER, loginId))).isTrue();
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                    assertThat(recovery.canControlGame(101, socketId, "game")).isTrue());
        }

        void revoke(Reason reason, String sid, boolean rollback) {
            tx.executeWithoutResult(status -> {
                var revocations = context.getBean(AuthenticationRevocations.class);
                if (reason == Reason.MEMBER_DEACTIVATED) { revocations.memberDeactivated(101); }
                else { revocations.sessionRevoked(101, sid, reason); }
                if (rollback) { status.setRollbackOnly(); }
            });
        }

        List<GameParticipantLeft> left() {
            return events.stream().filter(GameParticipantLeft.class::isInstance)
                    .map(GameParticipantLeft.class::cast).toList();
        }

        void assertGrace() {
            clock.advance(29);
            recovery.checkTimeouts();
            await().during(Duration.ofMillis(150)).atMost(Duration.ofSeconds(2))
                    .untilAsserted(() -> assertThat(left()).isEmpty());
            clock.advance(1);
            recovery.checkTimeouts();
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(left()).hasSize(1));
            assertThat(left().getFirst().leaveReason().name()).isEqualTo("DISCONNECT_TIMEOUT");
        }

        @Override public void close() {
            hub.shutdown();
            context.close();
        }
    }
}
