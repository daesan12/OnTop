package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.Callable;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketTicketTests {
    final MutableClock clock = new MutableClock();
    final WebSocketAccountLookup accounts = mock(WebSocketAccountLookup.class);
    final StaticListableBeanFactory beans = new StaticListableBeanFactory();
    final AccessJwtService jwt = new AccessJwtService(new AuthTokenProperties(
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "ontop", List.of(), null), clock);

    WebSocketTicketService service() {
        beans.addBean("accounts", accounts);
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
        return new WebSocketTicketService(jwt, beans.getBeanProvider(WebSocketAccountLookup.class), clock);
    }

    @Test void 접속권은_30초경계에서만료하고_Access남은시간보다길지않다() {
        var service = service();
        String access = jwt.issue(101);
        var ticket = service.issue(access, null);
        assertThat(ticket.expiresIn()).isEqualTo(30);
        assertThat(ticket.toString()).doesNotContain(ticket.ticket());
        clock.now = clock.now.plusSeconds(30);
        assertThatThrownBy(() -> service.consume(ticket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
        clock.now = clock.now.plusSeconds(1765);
        var shortTicket = service.issue(access, null);
        assertThat(shortTicket.expiresIn()).isEqualTo(5);
        clock.now = clock.now.plusSeconds(5);
        assertThatThrownBy(() -> service.consume(shortTicket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
    }

    @Test void 같은접속권의_동시소비는_한개만성공한다() throws Exception {
        var service = service();
        var ticket = service.issue(jwt.issue(101), null);
        try (var workers = Executors.newFixedThreadPool(4)) {
            var jobs = IntStream.range(0, 8).mapToObj(i -> (Callable<Boolean>) () -> {
                try { service.consume(ticket.ticket(), null); return true; }
                catch (WebSocketTicketException exception) { return false; }
            }).toList();
            int successes = 0;
            for (var result : workers.invokeAll(jobs)) { if (result.get()) { successes++; } }
            assertThat(successes).isEqualTo(1);
        }
    }

    @Test void 출처변경과_발급후탈퇴와_중복사용을차단한다() {
        var service = service();
        var ticket = service.issue(jwt.issue(101), "https://app.example");
        assertThatThrownBy(() -> service.consume(ticket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
        assertThatThrownBy(() -> service.consume(ticket.ticket(), "https://app.example"))
                .isInstanceOf(WebSocketTicketException.class);
        var deleted = service.issue(jwt.issue(101), null);
        when(accounts.findActive(101)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.consume(deleted.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
    }

    @Test void 계정별상한을넘으면거절하고_만료후에는다시발급한다() {
        var service = service();
        for (int i = 0; i < 4; i++) { service.issue(jwt.issue(101), null); }
        assertThatThrownBy(() -> service.issue(jwt.issue(101), null)).isInstanceOf(WebSocketTicketException.class)
                .satisfies(e -> assertThat(((WebSocketTicketException)e).status().value()).isEqualTo(429));
        clock.now = clock.now.plusSeconds(30);
        assertThat(service.issue(jwt.issue(101), null).expiresIn()).isEqualTo(30);
    }

    @Test void DB조회는_실제내부ID와제공자를매핑하고_탈퇴사용자를제외한다() {
        var repository = mock(UserRepository.class);
        var lookup = new DatabaseWebSocketAccountLookup(repository);
        var user = new User(LoginProvider.SSAFY, "test-provider", "테스트", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 202L);
        when(repository.findById(202L)).thenReturn(Optional.of(user));
        assertThat(lookup.findActive(202)).contains(new VerifiedWebSocketUser(202,
                VerifiedWebSocketUser.Provider.SSAFY));
        ReflectionTestUtils.setField(user, "deletedAt", clock.instant());
        assertThat(lookup.findActive(202)).isEmpty();
    }

    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-21T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
