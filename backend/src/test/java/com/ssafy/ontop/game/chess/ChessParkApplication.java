package com.ssafy.ontop.game.chess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import java.util.HashMap;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultCommitted;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.Optional;
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
public final class ChessParkApplication {
    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, Fixture.class).run(
            "--spring.profiles.active=local,frontend-test,chess-park", "--server.address=127.0.0.1", "--server.port=19208",
            "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            "--ontop.auth.allowed-origins=http://127.0.0.1:5338,http://localhost:5338",
            "--ontop.game-start.enabled=true", "--ontop.games.chess.enabled=true",
            "--ontop.world.map.source=GENERATED", "--ontop.world.map.require-match=true",
            "--ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
            "--ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json",
            "--ontop.start-rehearsal.enabled=false", "--ontop.websocket.authenticated=true");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & chess-park & !db & !dev & !prod & !production")
    public static class Fixture {
        @Bean @Primary com.ssafy.ontop.user.service.UserProfileService chessUserProfiles() {
            var profiles = org.mockito.Mockito.mock(com.ssafy.ontop.user.service.UserProfileService.class);
            for (long id : new long[] {101,202,505}) {
                org.mockito.Mockito.when(profiles.findProfile(id)).thenReturn(new com.ssafy.ontop.user.dto.UserProfileResponse(
                    id, id == 101 ? "체스 백" : id == 202 ? "체스 흑" : "체스 관전", com.ssafy.ontop.user.domain.CharacterGender.MALE));
            }
            return profiles;
        }
        @Bean ActiveMemberLookup chessMembers() {
            return (id, sid) -> Set.of(101L,202L,505L).contains(id) && TestLoginSessions.ID.equals(sid)
                ? Optional.of(new AuthenticatedUser(id, LoginProvider.NAVER, sid)) : Optional.empty();
        }
        @Bean @Primary WebSocketAccountLookup chessAccounts(ActiveMemberLookup members) {
            return (id,sid) -> members.findActive(id,sid).map(VerifiedWebSocketUser::from);
        }
        @Bean WorldProfileGateway chessProfiles() {
            return ids -> {
                var result = new HashMap<Long, WorldProfileGateway.Profile>();
                for (long id : ids) if (Set.of(101L,202L,505L).contains(id))
                    result.put(id, new WorldProfileGateway.Profile(
                        id==101 ? "체스 백" : id==202 ? "체스 흑" : "관전 로컬", "MALE"));
                return Map.copyOf(result);
            };
        }
        @Bean LocalLedger chessLedger(ApplicationEventPublisher events) { return new LocalLedger(events); }
        @Bean FilterRegistrationBean<OncePerRequestFilter> chessFixtureHttp(AccessJwtService jwt,
                AccessAuthenticationService auth, ObjectMapper mapper,
                com.ssafy.ontop.auth.config.AuthTokenProperties properties) {
            var codes = new ConcurrentHashMap<String,Long>();
            var registration = new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setOrder(-200);
            registration.setFilter(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    String path = request.getRequestURI();
                    Object body = null;
                    if (path.equals("/api/v1/dev/chess/session") && request.getMethod().equals("POST")) {
                        String origin=request.getHeader("Origin");
                        if (origin != null && (properties.allowedOrigins() == null || !properties.allowedOrigins().contains(origin))) { response.setStatus(403); return; }
                        long id = switch(mapper.readTree(request.getInputStream()).path("role").asText()) { case "white" -> 101; case "black" -> 202; case "viewer" -> 505; default -> 0; };
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
                            auth.authenticate(bearer != null && bearer.startsWith("Bearer ") ? bearer.substring(7) : "");
                            body=Map.of("balance",10000,"reservedBalance",0,"availableBalance",10000);
                        } catch(RuntimeException denied) { response.setStatus(401); return; }
                    } else if (path.equals("/api/v1/users/me") && request.getMethod().equals("GET")) {
                        try {
                            String bearer=request.getHeader("Authorization");
                            var user=auth.authenticate(bearer != null && bearer.startsWith("Bearer ") ? bearer.substring(7) : "");
                            body=Map.of("userId",user.userId(),"nickname",user.userId()==101 ? "체스 백" : user.userId()==202 ? "체스 흑" : "관전 로컬","characterGender","MALE");
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
        final ApplicationEventPublisher events;
        LocalLedger(ApplicationEventPublisher events) { this.events=events; }
        @Override public synchronized GameStartResult startGame(GameStartCommand command) {
            if (!command.gameCode().equals("CHESS") || command.participants().stream().anyMatch(p -> !Set.of("101","202").contains(p.userId())))
                return GameStartResult.rejected(command.startAttemptId(),"LOCAL_CHESS_ONLY");
            var previous=commands.putIfAbsent(command.startAttemptId(),command);
            if (previous != null && !previous.equals(command)) return GameStartResult.conflict(command.startAttemptId());
            return starts.computeIfAbsent(command.startAttemptId(), ignored -> {
                String id="local-chess-"+UUID.randomUUID(); games.put(id,command); return GameStartResult.reserved(command,id);
            });
        }
        @Override public GameStartResult findStartResult(UUID id) { return starts.getOrDefault(id,GameStartResult.pending(id)); }
        @Override public Optional<GameResultView> load(long user, String game) { return Optional.ofNullable(results.get(game+":"+user)); }
        @EventListener public void finished(GameFinished finished) {
            var command=games.get(finished.gameId()); if (command == null || !finished.gameCode().equals("CHESS")) return;
            for (var player:finished.participants()) {
                var view=new GameResultView(player.userId(),finished.version(),finished.gameId(),"CHESS",
                    GameResultView.Status.FINISHED,finished.endReason(),GameResultView.SettlementStatus.SETTLED,
                    command.betAmountPerPlayer(),finished.participants().stream().map(p -> new GameResultView.Participant(Long.toString(p.userId()),p.result().name())).toList(),0L,finished.endedAt());
                if (results.putIfAbsent(finished.gameId()+":"+player.userId(),view)==null) events.publishEvent(new GameResultCommitted(view));
            }
        }
    }
}
