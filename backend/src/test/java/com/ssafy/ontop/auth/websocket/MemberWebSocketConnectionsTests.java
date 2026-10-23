package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.auth.service.AuthenticationRevocations.Reason;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemberWebSocketConnectionsTests {
    private final AccessAuthenticationService authentication = mock(AccessAuthenticationService.class);
    private final MemberWebSocketConnections connections = new MemberWebSocketConnections(authentication);

    @Test
    void 폐기된_로그인세션만_닫고_같은회원의_다른세션은_보존한다() throws Exception {
        Socket first = connected(101, TestLoginSessions.ID);
        Socket second = connected(101, UUID.randomUUID().toString());
        Socket otherMember = connected(202, TestLoginSessions.ID);

        connections.revoked(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID));

        assertClosed(first, 4401, ConnectionCloseReason.AUTH_SESSION_REVOKED);
        assertThat(second.closed.getCount()).isEqualTo(1);
        assertThat(otherMember.closed.getCount()).isEqualTo(1);
        assertThat(connections.isClosing(first.socket)).isTrue();
    }

    @Test
    void 회원_비활성화는_해당회원의_전체연결만_닫는다() throws Exception {
        Socket first = connected(101, TestLoginSessions.ID);
        Socket second = connected(101, UUID.randomUUID().toString());
        Socket other = connected(202, TestLoginSessions.ID);

        connections.revoked(new AuthenticationRevocations.Revoked(101, null));

        assertClosed(first, 4403, ConnectionCloseReason.MEMBER_DEACTIVATED);
        assertClosed(second, 4403, ConnectionCloseReason.MEMBER_DEACTIVATED);
        assertThat(other.closed.getCount()).isEqualTo(1);
    }

    @Test
    void 등록중_로그아웃_커밋은_pending연결을_닫고_Hub등록을_막는다() throws Exception {
        Socket pending = new Socket();
        VerifiedWebSocketUser user = user(101, TestLoginSessions.ID);
        CountDownLatch lookup = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger registered = new AtomicInteger();
        when(authentication.requireActive(101, user.sessionId())).thenAnswer(call -> {
            lookup.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return new AuthenticatedUser(101, LoginProvider.SSAFY, user.sessionId());
        });
        try (var worker = Executors.newSingleThreadExecutor()) {
            var task = worker.submit(() -> connections.connect(pending.socket, user,
                    () -> registered.incrementAndGet() > 0, pending.reason::set));
            try {
                assertThat(lookup.await(5, TimeUnit.SECONDS)).isTrue();
                connections.revoked(new AuthenticationRevocations.Revoked(101, user.sessionId(), Reason.LOGOUT));
                assertClosed(pending, 4401, ConnectionCloseReason.LOGOUT);
            } finally {
                release.countDown();
            }
            task.get(5, TimeUnit.SECONDS);
            assertThat(registered).hasValue(0);
        }
    }

    @Test
    void 폐기알림보다_늦게_등록한_연결도_DB재검증으로_차단한다() throws Exception {
        connections.revoked(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID));
        when(authentication.requireActive(101, TestLoginSessions.ID))
                .thenThrow(new RestAuthenticationException(RestAuthenticationException.Error.MEMBER_CHANGED));
        Socket socket = new Socket();
        AtomicInteger registered = new AtomicInteger();

        connections.connect(socket.socket, user(101, TestLoginSessions.ID),
                () -> registered.incrementAndGet() > 0, socket.reason::set);

        assertClosed(socket, 4401, ConnectionCloseReason.AUTH_SESSION_REVOKED);
        assertThat(registered).hasValue(0);
    }

    @Test
    void DB장애는_1013으로_실패하고_의도적인_로그아웃으로_기록하지_않는다() throws Exception {
        when(authentication.requireActive(101, TestLoginSessions.ID))
                .thenThrow(new RestAuthenticationException(RestAuthenticationException.Error.STORAGE));
        Socket socket = new Socket();
        connections.connect(socket.socket, user(101, TestLoginSessions.ID), () -> true, socket.reason::set);
        assertClosed(socket, 1013, ConnectionCloseReason.TRANSPORT_ERROR);
    }

    @Test
    void 닫기_실패도_서버정리를_수행하고_커밋후_호출자에게_예외를_전파하지_않는다() throws Exception {
        Socket socket = connected(101, TestLoginSessions.ID);
        doAnswer(call -> { throw new IOException("fixture-private-close"); }).when(socket.socket).close(any());
        connections.revoked(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID));
        await().atMost(5, TimeUnit.SECONDS)
                .untilAsserted(() -> assertThat(socket.reason.get()).isEqualTo(ConnectionCloseReason.AUTH_SESSION_REVOKED));
        assertThat(connections.isClosing(socket.socket)).isTrue();
    }

    @Test
    void 네트워크_종료로_등록이_정리된_소켓은_후속_로그아웃_대상이_아니다() {
        Socket socket = connected(101, TestLoginSessions.ID);
        assertThat(connections.remove(socket.socket, ConnectionCloseReason.TRANSPORT_ERROR))
                .isEqualTo(ConnectionCloseReason.TRANSPORT_ERROR);
        connections.revoked(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID, Reason.LOGOUT));
        assertThat(socket.closed.getCount()).isEqualTo(1);
        assertThat(connections.isClosing(socket.socket)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"LOGOUT,LOGOUT,4401", "REFRESH_REUSE_DETECTED,AUTH_SESSION_REVOKED,4401",
            "SESSION_REVOKED,AUTH_SESSION_REVOKED,4401", "MEMBER_DEACTIVATED,MEMBER_DEACTIVATED,4403"})
    void 원인이_레지스트리와_close콜백과_정리콜백에_동일하게_전달된다(
            Reason reason, ConnectionCloseReason expected, int code) throws Exception {
        Socket socket = connected(101, TestLoginSessions.ID);
        AtomicReference<ConnectionCloseReason> callback = new AtomicReference<>();
        doAnswer(call -> {
            callback.set(connections.remove(socket.socket, ConnectionCloseReason.SOCKET_CLOSED));
            socket.status.set(call.getArgument(0));
            socket.closed.countDown();
            return null;
        }).when(socket.socket).close(any());

        connections.revoked(new AuthenticationRevocations.Revoked(101,
                reason == Reason.MEMBER_DEACTIVATED ? null : TestLoginSessions.ID, reason));

        assertClosed(socket, code, expected);
        assertThat(callback.get()).isEqualTo(expected);
        assertThat(connections.remove(socket.socket, ConnectionCloseReason.TRANSPORT_ERROR)).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({"LOGOUT,REFRESH_REUSE_DETECTED,LOGOUT,4401",
            "REFRESH_REUSE_DETECTED,LOGOUT,AUTH_SESSION_REVOKED,4401",
            "LOGOUT,MEMBER_DEACTIVATED,LOGOUT,4401",
            "MEMBER_DEACTIVATED,LOGOUT,MEMBER_DEACTIVATED,4403"})
    void 후속_원인은_이미_선점된_연결의_최초_사유를_덮지_않는다(
            Reason first, Reason later, ConnectionCloseReason expected, int code) throws Exception {
        Socket socket = connected(101, TestLoginSessions.ID);
        Socket otherSid = connected(101, UUID.randomUUID().toString());
        Socket otherMember = connected(202, TestLoginSessions.ID);
        connections.revoked(event(first));
        connections.revoked(event(later));
        connections.revoked(event(first));

        assertClosed(socket, code, expected);
        verify(socket.socket, times(1)).close(any());
        if (first == Reason.MEMBER_DEACTIVATED || later == Reason.MEMBER_DEACTIVATED) {
            assertClosed(otherSid, 4403, ConnectionCloseReason.MEMBER_DEACTIVATED);
        } else {
            assertThat(otherSid.closed.getCount()).isEqualTo(1);
        }
        assertThat(otherMember.closed.getCount()).isEqualTo(1);
        assertThat(connections.remove(socket.socket, ConnectionCloseReason.SOCKET_CLOSED)).isEqualTo(expected);
    }

    @Test
    void 같은계열의_동시_로그아웃과_재사용알림은_한번만_닫고_최초사유를_유지한다() throws Exception {
        Socket socket = connected(101, TestLoginSessions.ID);
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var logout = workers.submit(() -> { start.await(); connections.revoked(event(Reason.LOGOUT)); return null; });
            var reuse = workers.submit(() -> { start.await(); connections.revoked(event(Reason.REFRESH_REUSE_DETECTED)); return null; });
            start.countDown();
            logout.get(5, TimeUnit.SECONDS);
            reuse.get(5, TimeUnit.SECONDS);
        }
        assertThat(socket.closed.await(5, TimeUnit.SECONDS)).isTrue();
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> assertThat(socket.reason.get())
                .isIn(ConnectionCloseReason.LOGOUT, ConnectionCloseReason.AUTH_SESSION_REVOKED));
        assertThat(socket.status.get().getCode()).isEqualTo(4401);
        assertThat(connections.remove(socket.socket, ConnectionCloseReason.SOCKET_CLOSED)).isEqualTo(socket.reason.get());
        verify(socket.socket, times(1)).close(any());
    }

    @ParameterizedTest
    @EnumSource(value = Reason.class, names = {"LOGOUT", "REFRESH_REUSE_DETECTED"})
    void 같은계열의_여러소켓을_닫되_다른계열은_유지한다(Reason reason) throws Exception {
        Socket first = connected(101, TestLoginSessions.ID);
        Socket second = connected(101, TestLoginSessions.ID);
        Socket other = connected(101, UUID.randomUUID().toString());
        connections.revoked(event(reason));
        ConnectionCloseReason expected = reason == Reason.LOGOUT
                ? ConnectionCloseReason.LOGOUT : ConnectionCloseReason.AUTH_SESSION_REVOKED;
        assertClosed(first, 4401, expected);
        assertClosed(second, 4401, expected);
        assertThat(other.closed.getCount()).isEqualTo(1);
    }

    @Test
    void 클라이언트의_close코드와_문자열은_명시적_로그아웃이나_탈퇴로_해석하지_않는다() {
        TableHub hub = mock(TableHub.class);
        var handler = new TableWebSocketHandler(hub, true, connections);
        Socket first = connected(101, TestLoginSessions.ID);
        Socket second = connected(202, TestLoginSessions.ID);
        handler.afterConnectionClosed(first.socket, new CloseStatus(4401, "LOGOUT"));
        handler.afterConnectionClosed(second.socket, new CloseStatus(4403, "MEMBER_DEACTIVATED"));
        verify(hub).disconnect(first.socket.getId(), ConnectionCloseReason.SOCKET_CLOSED);
        verify(hub).disconnect(second.socket.getId(), ConnectionCloseReason.SOCKET_CLOSED);
    }

    private AuthenticationRevocations.Revoked event(Reason reason) {
        return new AuthenticationRevocations.Revoked(101,
                reason == Reason.MEMBER_DEACTIVATED ? null : TestLoginSessions.ID, reason);
    }

    private Socket connected(long id, String sid) {
        when(authentication.requireActive(id, sid)).thenReturn(new AuthenticatedUser(id, LoginProvider.SSAFY, sid));
        Socket socket = new Socket();
        connections.connect(socket.socket, user(id, sid), () -> true, socket.reason::set);
        return socket;
    }

    private VerifiedWebSocketUser user(long id, String sid) {
        return new VerifiedWebSocketUser(id, VerifiedWebSocketUser.Provider.SSAFY, sid);
    }

    private void assertClosed(Socket socket, int code, ConnectionCloseReason reason) throws Exception {
        assertThat(socket.closed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(socket.status.get().getCode()).isEqualTo(code);
        await().atMost(5, TimeUnit.SECONDS)
                .untilAsserted(() -> assertThat(socket.reason.get()).isEqualTo(reason));
    }

    private static class Socket {
        final WebSocketSession socket = mock(WebSocketSession.class);
        final CountDownLatch closed = new CountDownLatch(1);
        final AtomicReference<CloseStatus> status = new AtomicReference<>();
        final AtomicReference<ConnectionCloseReason> reason = new AtomicReference<>();

        Socket() {
            when(socket.getId()).thenReturn(UUID.randomUUID().toString());
            when(socket.getAttributes()).thenReturn(new ConcurrentHashMap<>());
            when(socket.isOpen()).thenReturn(true);
            try {
                doAnswer(call -> {
                    status.set(call.getArgument(0));
                    closed.countDown();
                    return null;
                }).when(socket).close(any());
            } catch (IOException exception) {
                throw new AssertionError(exception);
            }
        }
    }
}
