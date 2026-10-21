package com.ssafy.ontop.demo;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

// 테스트 클래스패스 전용. 정식 로그인·차감·생성 API가 아니며 운영 JAR에는 없다.
public final class GamesDemoApplication {
    static final String CHANNEL="games-demo";
    static final String TABLE="table-"+UUID.nameUUIDFromBytes((CHANNEL+"\0table-1").getBytes(StandardCharsets.UTF_8));
    static final List<Long> PLAYERS=List.of(101L,202L);

    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class,Fixture.class).run(
                "--spring.profiles.active=local,games-demo","--server.address=127.0.0.1","--server.port=18082",
                "--ontop.websocket.authenticated=true","--ontop.start-rehearsal.enabled=false",
                "--ontop.games.farkle.enabled=true","--ontop.games.onecard.enabled=true","--ontop.games.bridge.enabled=true",
                // 미확정 제품 정책이 아니라 이 테스트 서버의 조건이다.
                "--ontop.games.onecard.forfeit-hand-policy=RECYCLE",
                "--ontop.world.channels[0].channel-id="+CHANNEL,"--ontop.world.channels[0].name=게임 검증",
                "--ontop.world.channels[0].capacity=10",
                "--ontop.world.proximity.tables["+TABLE+"].x=-2.025","--ontop.world.proximity.tables["+TABLE+"].z=34");
    }

    @TestConfiguration(proxyBeanMethods=false)
    @Profile("local & games-demo")
    public static class Fixture {
        @Bean WebSocketUserResolver gamesDemoResolver() {
            return principal -> principal instanceof DemoPrincipal player
                    ? Optional.of(new VerifiedWebSocketUser(player.id(),player.id()==202
                        ? VerifiedWebSocketUser.Provider.SSAFY : VerifiedWebSocketUser.Provider.NAVER)) : Optional.empty();
        }
        @Bean FilterRegistrationBean<OncePerRequestFilter> gamesDemoPrincipal() {
            var registration=new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setFilter(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
                        throws ServletException,IOException {
                    Principal principal=switch (String.valueOf(request.getParameter("testRole"))) {
                        case "a" -> new DemoPrincipal(101);
                        case "b" -> new DemoPrincipal(202);
                        case "viewer" -> new DemoPrincipal(505);
                        default -> null;
                    };
                    chain.doFilter(new HttpServletRequestWrapper(request) {
                        @Override public Principal getUserPrincipal() { return principal; }
                    },response);
                }
            });
            registration.addUrlPatterns("/ws/tables"); return registration;
        }
    }
    private record DemoPrincipal(long id) implements Principal {
        @Override public String getName() { return "games-demo"; }
    }

    @RestController
    @Profile("local & games-demo")
    public static class Controller {
        private final FarkleEngine dice;
        private final OneCardEngine cards;
        private final BridgeEngine bridge;
        private final GameEngineRouter router;
        private String gameId;
        private String gameCode;
        public Controller(FarkleEngine dice,OneCardEngine cards,BridgeEngine bridge,GameEngineRouter router) {
            this.dice=dice;this.cards=cards;this.bridge=bridge;this.router=router;
        }
        @GetMapping(value="/dev/games",produces=MediaType.TEXT_HTML_VALUE)
        Resource page() { return new ClassPathResource("games-demo/index.html"); }
        @GetMapping(value="/dev/games/games.js",produces="text/javascript")
        Resource script() { return new ClassPathResource("games-demo/games.js"); }
        @GetMapping(value="/dev/games/games.css",produces="text/css")
        Resource css() { return new ClassPathResource("games-demo/games.css"); }
        @GetMapping("/dev/games/config")
        synchronized ResponseEntity<Config> config() { return response(200); }
        @PostMapping("/dev/games/matches")
        synchronized ResponseEntity<Config> create(@RequestHeader("X-Games-Demo") String marker,@RequestParam String code) {
            if (!marker.equals("local") || !List.of("DICE","ONE_CARD","LIAR_BRIDGE").contains(code)) { return response(400); }
            if (playing()) { return response(409); }
            String next="games-demo-"+UUID.randomUUID();
            switch (code) {
                case "DICE" -> dice.create(next,TABLE,PLAYERS,2000);
                case "ONE_CARD" -> cards.create(next,TABLE,PLAYERS);
                case "LIAR_BRIDGE" -> bridge.create(next,TABLE,PLAYERS);
                default -> throw new IllegalStateException();
            }
            gameId=next;gameCode=code;return response(201);
        }
        @PostMapping("/dev/games/forfeit")
        synchronized ResponseEntity<Config> forfeit(@RequestHeader("X-Games-Demo") String marker) {
            if (!marker.equals("local")) { return response(400); }
            if (playing()) {
                Instant at=Instant.now();
                for (long user : PLAYERS) {
                    router.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),user,gameId,
                            at.minusSeconds(30),at,GameRecoveryGateway.Action.FORFEIT));
                }
            }
            return response(200);
        }
        private boolean playing() {
            return gameId!=null && router.load(101).filter(s -> s.gameId().equals(gameId))
                    .map(s -> s.phase()!=GameRecoverySnapshot.Phase.FINISHED).orElse(false);
        }
        private ResponseEntity<Config> response(int status) {
            return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                    .body(new Config(gameId,gameCode,CHANNEL,TABLE,playing(),Instant.now().toEpochMilli()));
        }
    }
    public record Config(String gameId,String gameCode,String channelId,String tableId,boolean playing,long serverTime) { }
}
