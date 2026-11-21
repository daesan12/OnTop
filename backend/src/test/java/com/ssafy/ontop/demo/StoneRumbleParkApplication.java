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
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.web.filter.OncePerRequestFilter;


/** 테스트 classpath + loopback 전용. 실제 회원·DB·지갑·재화는 사용하지 않는다. */
public final class StoneRumbleParkApplication {
    public static void main(String[] args) {
        var defaults = new ArrayList<>(List.of(
            "--spring.profiles.active=local,frontend-test,stone-rumble-park", "--server.address=127.0.0.1", "--server.port=19187",
            "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            "--ontop.auth.allowed-origins=http://127.0.0.1:5237,http://localhost:5237",
            "--ontop.game-start.enabled=true", "--ontop.games.stone-rumble.enabled=true",
            "--ontop.world.channels[0].channel-id=channel-1", "--ontop.world.channels[0].name=돌탑 로컬 공원",
            "--ontop.world.channels[0].capacity=16",
            "--ontop.world.map.source=GENERATED", "--ontop.world.map.json-path=../frontend/generated/park/server-map.json",
            "--ontop.world.map.manifest-path=../frontend/generated/park/manifest.json", "--ontop.world.map.require-match=true",
            "--ontop.start-rehearsal.enabled=false", "--ontop.websocket.authenticated=true"));
        // 별도 loopback worktree에서 새 공원 계약과 포트를 함께 검수한다. DB는 활성화하지 않는다.
        if (Boolean.parseBoolean(System.getenv("STONE_RUMBLE_RENEWAL"))) {
            defaults.removeIf(value -> value.startsWith("--ontop.world.map.")
                    || value.startsWith("--server.port=") || value.startsWith("--ontop.auth.allowed-origins="));
            defaults.addAll(List.of(
                    "--server.port=19191", "--ontop.auth.allowed-origins=http://127.0.0.1:5501,http://localhost:5501",
                    "--ontop.world.map.source=GENERATED",
                    "--ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
                    "--ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json",
                    "--ontop.world.map.require-match=true"));
        }
        for (String argument : args) {
            String key = argument.contains("=") ? argument.substring(0, argument.indexOf('=') + 1) : argument;
            defaults.removeIf(value -> value.startsWith(key));
            defaults.add(argument);
        }
        new SpringApplication(OntopApplication.class, Fixture.class).run(defaults.toArray(String[]::new));
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & stone-rumble-park & !db & !dev & !prod & !production")
    @Import(com.ssafy.ontop.game.spotdifference.SpotDifferenceParkFixture.class)
    public static class Fixture {
        @Bean ActiveMemberLookup stoneRumbleMembers() {
            return (id, sid) -> Set.of(101L,202L,303L,404L,505L,606L,707L,808L,999L).contains(id) && TestLoginSessions.ID.equals(sid)
                ? Optional.of(new AuthenticatedUser(id, LoginProvider.NAVER, sid)) : Optional.empty();
        }
        @Bean @Primary WebSocketAccountLookup stoneRumbleAccounts(ActiveMemberLookup members) {
            return (id,sid) -> members.findActive(id,sid).map(VerifiedWebSocketUser::from);
        }
        @Bean WorldProfileGateway stoneRumbleProfiles() {
            return ids -> {
                var result = new HashMap<Long, WorldProfileGateway.Profile>();
                for (long id : ids) {
                    if (Set.of(101L,202L,303L,404L,505L,606L,707L,808L,999L).contains(id)) {
                        result.put(id, new WorldProfileGateway.Profile(
                                id == 999 ? "관전 로컬" : "돌탑 " + id / 101, "MALE"));
                    }
                }
                return Map.copyOf(result);
            };
        }
        @Bean LocalLedger stoneRumbleLedger(ApplicationEventPublisher events) { return new LocalLedger(events); }
        @Bean FilterRegistrationBean<OncePerRequestFilter> stoneRumbleFixtureHttp(AccessJwtService jwt,
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
                    if ((path.equals("/dev/stone-rumble-park/session")
                            || path.equals("/api/v1/qa/session") && Boolean.getBoolean("ontop.qa-feedback.enabled"))
                            && request.getMethod().equals("POST")) {
                        String origin=request.getHeader("Origin");
                        if (origin != null && (properties.allowedOrigins() == null || !properties.allowedOrigins().contains(origin))) { response.setStatus(403); return; }
                        long id = switch(mapper.readTree(request.getInputStream()).path("role").asText()) { case "1" -> 101; case "2" -> 202; case "3" -> 303; case "4" -> 404; case "5" -> 505; case "6" -> 606; case "7" -> 707; case "8" -> 808; case "viewer" -> 999; default -> 0; };
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
                            body=Map.of("userId",user.userId(),"nickname",user.userId()==999 ? "관전 로컬" : "돌탑 " + user.userId()/101,"characterGender","MALE");
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

        public synchronized void creditForQa(long userId, long amount) {
            balances.compute(userId, (account, balance) -> (balance == null ? 10000L : balance) + amount);
        }
        final java.util.concurrent.atomic.AtomicLong gameSequence = new java.util.concurrent.atomic.AtomicLong(1_600_000);
        final ApplicationEventPublisher events;
        LocalLedger(ApplicationEventPublisher events) { this.events=events; }
        @Override public synchronized GameStartResult startGame(GameStartCommand command) {
            if (!command.gameCode().equals("STONE_RUMBLE") || command.participants().stream().anyMatch(p -> !Set.of("101","202","303","404","505","606","707","808").contains(p.userId()))) {
                return GameStartResult.rejected(command.startAttemptId(), "LOCAL_STONE_RUMBLE_ONLY");
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
            if (command == null || !finished.gameCode().equals("STONE_RUMBLE")) {
                return;
            }
            for (var player:finished.participants()) {
                boolean invalid = Set.of("SIMULATION_LIMIT", "LOADING_TIMEOUT").contains(finished.endReason());
                var calculation = invalid ? com.ssafy.ontop.game.result.persistence.GameSettlementCalculation.refund(finished.participants().size())
                        : com.ssafy.ontop.game.result.persistence.GameSettlementCalculation.stoneRumble(command.betAmountPerPlayer(),
                            finished.participants().stream().map(GameFinished.Participant::result).toList(),
                            finished.participants().stream().map(GameFinished.Participant::finishRank).toList());
                long delta = calculation.awards().get(finished.participants().indexOf(player)).netDelta();
                var view=new GameResultView(player.userId(),finished.version(),finished.gameId(),"STONE_RUMBLE",
                    invalid ? GameResultView.Status.INVALID : GameResultView.Status.FINISHED,finished.endReason(),GameResultView.SettlementStatus.SETTLED,
                    command.betAmountPerPlayer(),finished.participants().stream().map(p -> new GameResultView.Participant(Long.toString(p.userId()),p.result().name(),p.finishRank(),p.rankReward())).toList(),delta,finished.endedAt());
                if (results.putIfAbsent(finished.gameId() + ":" + player.userId(), view) == null) {
                    balances.compute(player.userId(), (user, previous) -> (previous == null ? 10000L : previous) + delta);
                    events.publishEvent(new GameResultCommitted(view));
                }
            }
        }
    }
}
