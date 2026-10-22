package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.JpaActiveMemberLookup;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
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
        beans.addBean("members", (ActiveMemberLookup) id -> accounts.findActive(id).map(user ->
                new AuthenticatedUser(user.userId(), LoginProvider.valueOf(user.provider().name()))));
        return new WebSocketTicketService(beans.getBeanProvider(WebSocketAccountLookup.class), clock);
    }

    Authentication authenticated(String raw) {
        var authentication = new AccessAuthenticationService(jwt, beans.getBeanProvider(ActiveMemberLookup.class));
        var verified = authentication.authenticateAccess(raw);
        var result = UsernamePasswordAuthenticationToken.authenticated(verified.user(), null,
                List.of(new SimpleGrantedAuthority("ROLE_MEMBER")));
        result.setDetails(verified);
        return result;
    }

    @Test void 접속권은_30초경계에서만료하고_Access남은시간보다길지않다() {
        var service = service();
        String access = jwt.issue(101);
        var ticket = service.issue(authenticated(access), null);
        assertThat(ticket.expiresIn()).isEqualTo(30);
        assertThat(ticket.toString()).doesNotContain(ticket.ticket());
        clock.now = clock.now.plusSeconds(30);
        assertThatThrownBy(() -> service.consume(ticket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
        clock.now = clock.now.plusSeconds(1765);
        var shortTicket = service.issue(authenticated(access), null);
        assertThat(shortTicket.expiresIn()).isEqualTo(5);
        clock.now = clock.now.plusSeconds(5);
        assertThatThrownBy(() -> service.consume(shortTicket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
    }

    @Test void 같은접속권의_동시소비는_한개만성공한다() throws Exception {
        var service = service();
        var ticket = service.issue(authenticated(jwt.issue(101)), null);
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
        var ticket = service.issue(authenticated(jwt.issue(101)), "https://app.example");
        assertThatThrownBy(() -> service.consume(ticket.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
        assertThatThrownBy(() -> service.consume(ticket.ticket(), "https://app.example"))
                .isInstanceOf(WebSocketTicketException.class);
        var deleted = service.issue(authenticated(jwt.issue(101)), null);
        when(accounts.findActive(101)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.consume(deleted.ticket(), null)).isInstanceOf(WebSocketTicketException.class);
    }

    @Test void 계정별상한을넘으면거절하고_만료후에는다시발급한다() {
        var service = service();
        for (int i = 0; i < 4; i++) { service.issue(authenticated(jwt.issue(101)), null); }
        assertThatThrownBy(() -> service.issue(authenticated(jwt.issue(101)), null)).isInstanceOf(WebSocketTicketException.class)
                .satisfies(e -> assertThat(((WebSocketTicketException)e).status().value()).isEqualTo(429));
        clock.now = clock.now.plusSeconds(30);
        assertThat(service.issue(authenticated(jwt.issue(101)), null).expiresIn()).isEqualTo(30);
    }

    @Test void 서비스는_ID나_Principal만으로_접속권을_발급하지_않는다() {
        var service = service();
        var principal = new AuthenticatedUser(101, LoginProvider.NAVER);
        var noDetails = UsernamePasswordAuthenticationToken.authenticated(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_MEMBER")));
        var wrongPrincipal = UsernamePasswordAuthenticationToken.authenticated("101", null,
                List.of(new SimpleGrantedAuthority("ROLE_MEMBER")));
        for (Authentication candidate : new Authentication[] {null, noDetails, wrongPrincipal,
                UsernamePasswordAuthenticationToken.unauthenticated(principal, null)}) {
            assertThatThrownBy(() -> service.issue(candidate, null)).isInstanceOf(WebSocketTicketException.class);
        }
        noDetails.setDetails(new AccessAuthenticationService.AuthenticatedAccess(
                new AuthenticatedUser(202, LoginProvider.SSAFY), clock.instant().plusSeconds(30)));
        assertThatThrownBy(() -> service.issue(noDetails, null)).isInstanceOf(WebSocketTicketException.class);
        var expired = authenticated(jwt.issue(101));
        clock.now = clock.now.plusSeconds(1800);
        assertThatThrownBy(() -> service.issue(expired, null)).isInstanceOf(WebSocketTicketException.class);
    }

    @Test void DB조회는_실제내부ID와제공자를매핑하고_탈퇴사용자를제외한다() {
        var repository = mock(UserRepository.class);
        beans.addBean("members", new JpaActiveMemberLookup(repository));
        var lookup = new DatabaseWebSocketAccountLookup(
                new AccessAuthenticationService(jwt, beans.getBeanProvider(ActiveMemberLookup.class)));
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
