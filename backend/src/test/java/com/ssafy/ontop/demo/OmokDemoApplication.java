package com.ssafy.ontop.demo;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.Instant;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

// 테스트 클래스패스 전용. 실제 로그인/시작/차감 API가 아니며 bootJar에 포함되지 않는다.
public final class OmokDemoApplication {
    static final String CHANNEL = "omok-demo";
    static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            (CHANNEL + "\0table-1").getBytes(StandardCharsets.UTF_8));

    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, Fixture.class).run(
                "--spring.profiles.active=local,omok-demo", "--server.address=127.0.0.1", "--server.port=18081",
                "--ontop.websocket.authenticated=true", "--ontop.games.omok.enabled=true",
                "--ontop.start-rehearsal.enabled=false", "--ontop.world.channels[0].channel-id=" + CHANNEL,
                "--ontop.world.channels[0].name=오목 테스트", "--ontop.world.channels[0].capacity=10",
                "--ontop.world.proximity.tables[" + TABLE + "].x=0",
                "--ontop.world.proximity.tables[" + TABLE + "].z=0");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("omok-demo")
    public static class Fixture {
        @Bean
        WebSocketUserResolver demoResolver() {
            return principal -> principal instanceof DemoPrincipal player
                    ? Optional.of(new VerifiedWebSocketUser(player.id(), player.id() == 202
                            ? VerifiedWebSocketUser.Provider.SSAFY : VerifiedWebSocketUser.Provider.NAVER))
                    : Optional.empty();
        }

        @Bean
        FilterRegistrationBean<OncePerRequestFilter> demoPrincipalFilter() {
            FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>();
            registration.setFilter(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    Principal player = switch (String.valueOf(request.getParameter("demoRole"))) {
                        case "black" -> new DemoPrincipal(101);
                        case "white" -> new DemoPrincipal(202);
                        case "viewer" -> new DemoPrincipal(505);
                        default -> null;
                    };
                    chain.doFilter(new HttpServletRequestWrapper(request) {
                        @Override public Principal getUserPrincipal() { return player; }
                    }, response);
                }
            });
            registration.addUrlPatterns("/ws/tables");
            return registration;
        }
    }

    private record DemoPrincipal(long id) implements Principal {
        @Override public String getName() { return "omok-demo"; }
    }

    @RestController
    @Profile("omok-demo")
    public static class DemoController {
        private final OmokEngine engine;
        private String gameId;

        public DemoController(OmokEngine engine) { this.engine = engine; }

        @GetMapping(value = "/dev/omok", produces = MediaType.TEXT_HTML_VALUE)
        Resource page() { return new ClassPathResource("omok-demo/index.html"); }

        @GetMapping(value = "/dev/omok/omok.css", produces = "text/css")
        Resource css() { return new ClassPathResource("omok-demo/omok.css"); }

        @GetMapping(value = "/dev/omok/omok.js", produces = "text/javascript")
        Resource script() { return new ClassPathResource("omok-demo/omok.js"); }

        @GetMapping("/dev/omok/config")
        synchronized ResponseEntity<Config> config() { return response(200); }

        @PostMapping("/dev/omok/games")
        synchronized ResponseEntity<Config> newGame(@RequestHeader("X-Omok-Demo") String marker) {
            if (!marker.equals("local")) { return response(400); }
            if (playing()) { return response(409); }
            gameId = "omok-demo-" + UUID.randomUUID();
            engine.create(gameId, TABLE, 101, 202);
            return response(201);
        }

        private boolean playing() {
            return gameId != null && engine.load(101).orElseThrow().phase()
                    == com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase.PLAYING;
        }

        private ResponseEntity<Config> response(int status) {
            return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                    .body(new Config(gameId, CHANNEL, TABLE, playing(), Instant.now().toEpochMilli()));
        }
    }

    public record Config(String gameId, String channelId, String tableId, boolean playing, long serverTime) { }
}
