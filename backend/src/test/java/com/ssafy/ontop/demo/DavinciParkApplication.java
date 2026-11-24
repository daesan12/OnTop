package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.web.filter.OncePerRequestFilter;


/** 테스트 classpath + loopback 전용. 실제 회원·DB·지갑·재화는 사용하지 않는다. */
public final class DavinciParkApplication {
    public static void main(String[] args) {
        var defaults = new ArrayList<>(List.of(
            "--spring.profiles.active=local,frontend-test,davinci-park", "--server.address=127.0.0.1", "--server.port=19203",
            "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            "--ontop.auth.allowed-origins=http://127.0.0.1:5523,http://localhost:5523",
            "--ontop.game-start.enabled=true", "--ontop.games.davinci.enabled=true",
            "--ontop.world.channels[0].channel-id=channel-1", "--ontop.world.channels[0].name=흑백수사 로컬 공원",
            "--ontop.world.channels[0].capacity=16",
            "--ontop.world.map.source=GENERATED", "--ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
            "--ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json", "--ontop.world.map.require-match=true",
            "--ontop.start-rehearsal.enabled=false", "--ontop.websocket.authenticated=true"));
        new SpringApplication(OntopApplication.class, Fixture.class).run(defaults.toArray(String[]::new));
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & davinci-park & !db & !dev & !prod & !production")
    public static class Fixture {
        @Bean ActiveMemberLookup davinciMembers() {
            return (id, sid) -> Set.of(101L,202L,303L,404L,999L).contains(id) && TestLoginSessions.ID.equals(sid)
                ? Optional.of(new AuthenticatedUser(id, LoginProvider.NAVER, sid)) : Optional.empty();
        }
        @Bean @Primary WebSocketAccountLookup davinciAccounts(ActiveMemberLookup members) {
            return (id,sid) -> members.findActive(id,sid).map(VerifiedWebSocketUser::from);
        }
        @Bean WorldProfileGateway davinciProfiles() {
            return ids -> {
                var result = new HashMap<Long, WorldProfileGateway.Profile>();
                for (long id : ids) {
                    if (Set.of(101L,202L,303L,404L,999L).contains(id)) {
                        result.put(id, new WorldProfileGateway.Profile(
                                id == 999 ? "관전 로컬" : "흑백수사 " + id / 101, "MALE"));
                    }
                }
                return Map.copyOf(result);
            };
        }
        @Bean LocalLedger davinciLedger(ApplicationEventPublisher events) { return new LocalLedger(events); }
        @Bean FilterRegistrationBean<OncePerRequestFilter> davinciFixtureHttp(AccessJwtService jwt,
                AccessAuthenticationService auth, ObjectMapper mapper,
                com.ssafy.ontop.auth.config.AuthTokenProperties properties, LocalLedger localLedger) {
            var codes = new ConcurrentHashMap<String,Long>();
            var registration = new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setOrder(-200);
            registration.setFilter(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    String path = request.getRequestURI();
                    Object body = null;
                    if (path.equals("/api/v1/dev/davinci/session") && request.getMethod().equals("POST")) {
                        String origin=request.getHeader("Origin");
                        if (origin != null && (properties.allowedOrigins() == null || !properties.allowedOrigins().contains(origin))) { response.setStatus(403); return; }
                        long id = switch(mapper.readTree(request.getInputStream()).path("role").asText()) { case "1" -> 101; case "2" -> 202; case "3" -> 303; case "4" -> 404; case "viewer" -> 999; default -> 0; };
                        if (id == 0 || codes.size() >= 64) { response.setStatus(400); return; }
                        String code = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "").substring(0,11);
                        codes.put(code,id); body=Map.of("exchangeCode",code);
                    } else if (path.equals("/api/v1/auth/exchange") && request.getMethod().equals("POST")) {
                        Long id = codes.remove(mapper.readTree(request.getInputStream()).path("exchangeCode").asText());
                        if (id == null) { response.setStatus(401); return; }
                        body=Map.of("status","AUTHENTICATED","accessToken",jwt.issue(id,TestLoginSessions.ID));
                    } else if (path.equals("/api/v1/wallets/me") && request.getMethod().equals("GET")) {
                        try {
                            String bearer=request.getHeader("Authorization");
                            var user = auth.authenticate(bearer != null && bearer.startsWith("Bearer ") ? bearer.substring(7) : "");
                            long balance = localLedger.balances.getOrDefault(user.userId(), 10000L);
                            body=Map.of("balance",balance,"reservedBalance",0,"availableBalance",balance);
                        } catch(RuntimeException denied) { response.setStatus(401); return; }
                    } else if (path.equals("/api/v1/users/me") && request.getMethod().equals("GET")) {
                        try {
                            String bearer=request.getHeader("Authorization");
                            var user=auth.authenticate(bearer != null && bearer.startsWith("Bearer ") ? bearer.substring(7) : "");
                            body=Map.of("userId",user.userId(),"nickname",user.userId()==999 ? "관전 로컬" : "흑백수사 " + user.userId()/101,"characterGender","MALE");
                        } catch(RuntimeException denied) { response.setStatus(401); return; }
                    }
                    if (body == null) { chain.doFilter(request,response); return; }
                    response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
                    response.setHeader("Cache-Control","no-store"); mapper.writeValue(response.getWriter(),body);
                }
            });
            return registration;
        }
    }

    /** 로컬 UI 흐름 검수용 시작/결과 대역. 실제 예약·정산 완료로 보고하지 않는다. */
    public static final class LocalLedger implements GameStartGateway, GameResultGateway {
        final Map<UUID, GameStartCommand> commands = new ConcurrentHashMap<>();
        final Map<UUID, GameStartResult> starts = new ConcurrentHashMap<>();
        final Map<String, GameStartCommand> games = new ConcurrentHashMap<>();
        final Map<String, GameResultView> results = new ConcurrentHashMap<>();
        final Map<Long, Long> balances = new ConcurrentHashMap<>();
        final java.util.concurrent.atomic.AtomicLong gameSequence = new java.util.concurrent.atomic.AtomicLong(1_600_000);
        final ApplicationEventPublisher events;
        LocalLedger(ApplicationEventPublisher events) { this.events=events; }
        @Override public synchronized GameStartResult startGame(GameStartCommand command) {
            if (!command.gameCode().equals("DAVINCI_CODE") || command.participants().stream().anyMatch(p -> !Set.of("101","202","303","404").contains(p.userId()))) {
                return GameStartResult.rejected(command.startAttemptId(), "LOCAL_DAVINCI_CODE_ONLY");
            }
            var previous=commands.putIfAbsent(command.startAttemptId(),command);
            if (previous != null && !previous.equals(command)) {
                return GameStartResult.conflict(command.startAttemptId());
            }
            return starts.computeIfAbsent(command.startAttemptId(), ignored -> {
                String id=Long.toString(gameSequence.incrementAndGet()); games.put(id,command); return GameStartResult.reserved(command,id);
            });
        }
        @Override public GameStartResult findStartResult(UUID id) { return starts.getOrDefault(id,GameStartResult.pending(id)); }
        @Override public Optional<GameResultView> load(long user, String game) { return Optional.ofNullable(results.get(game+":"+user)); }
        @EventListener public void finished(GameFinished finished) {
            var command = games.get(finished.gameId());
            if (command == null || !finished.gameCode().equals("DAVINCI_CODE")) {
                return;
            }
            for (var player:finished.participants()) {
                var calculation = com.ssafy.ontop.game.result.persistence.GameSettlementCalculation.calculate(
                        command.betAmountPerPlayer(), finished.participants().stream().map(GameFinished.Participant::result).toList());
                long delta = calculation.awards().get(finished.participants().indexOf(player)).netDelta();
                var view=new GameResultView(player.userId(),finished.version(),finished.gameId(),"DAVINCI_CODE",
                    GameResultView.Status.FINISHED,finished.endReason(),GameResultView.SettlementStatus.SETTLED,
                    command.betAmountPerPlayer(),finished.participants().stream().map(p -> new GameResultView.Participant(Long.toString(p.userId()),p.result().name())).toList(),delta,finished.endedAt());
                if (results.putIfAbsent(finished.gameId() + ":" + player.userId(), view) == null) {
                    balances.compute(player.userId(), (user, previous) -> (previous == null ? 10000L : previous) + delta);
                    events.publishEvent(new GameResultCommitted(view));
                }
            }
        }
    }
}
