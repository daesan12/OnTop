package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.game.stonerumble.domain.StoneRumbleMatch;
import com.ssafy.ontop.game.stonerumble.service.StoneRumbleEngine;
import com.ssafy.ontop.table.service.SpectatorEventPolicy;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.world.domain.ChatText;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.Principal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

/** loopback + test classpath 전용. 운영 인증·DB·지갑을 대체하거나 운영 JAR에 포함하지 않는다. */
public final class StoneRumbleDemoApplication {
    private static final List<Long> PLAYERS = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);
    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, Fixture.class).run(
                "--spring.profiles.active=local,stone-rumble-demo", "--server.address=127.0.0.1",
                "--server.port=19186", "--ontop.websocket.authenticated=true",
                "--ontop.games.stone-rumble.enabled=true", "--ontop.start-rehearsal.enabled=false",
                "--ontop.auth.allowed-origins=http://127.0.0.1:5236,http://localhost:5236");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & stone-rumble-demo & !db & !dev & !prod & !production")
    public static class Fixture {
        @Bean
        Clock stoneRumbleDemoClock() {
            return Clock.systemUTC();
        }

        @Bean
        ActiveMemberLookup stoneRumbleMembers() {
            return (id, sid) -> (PLAYERS.contains(id) || id == 999L)
                    && TestLoginSessions.ID.equals(sid)
                    ? Optional.of(new AuthenticatedUser(id, LoginProvider.NAVER, sid)) : Optional.empty();
        }

        @Bean
        WebSocketUserResolver stoneRumbleResolver() {
            return principal -> principal instanceof DemoPrincipal player
                    ? Optional.of(new VerifiedWebSocketUser(player.id(), VerifiedWebSocketUser.Provider.NAVER,
                            TestLoginSessions.ID)) : Optional.empty();
        }

        @Bean
        @Order(0)
        SecurityFilterChain stoneRumbleDemoChain(HttpSecurity http) throws Exception {
            return http.securityMatcher("/dev/stone-rumble/**").csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }

        @Bean
        FilterRegistrationBean<OncePerRequestFilter> stoneRumblePrincipal() {
            var registration = new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setFilter(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    long id = switch (String.valueOf(request.getParameter("testRole"))) {
                        case "1" -> 101;
                        case "2" -> 202;
                        case "3" -> 303;
                        case "4" -> 404;
                        case "5" -> 505;
                        case "6" -> 606;
                        case "7" -> 707;
                        case "8" -> 808;
                        case "viewer" -> 999;
                        default -> 0;
                    };
                    chain.doFilter(new HttpServletRequestWrapper(request) {
                        @Override
                        public Principal getUserPrincipal() {
                            return id == 0 ? null : new DemoPrincipal(id);
                        }
                    }, response);
                }
            });
            registration.addUrlPatterns("/ws/tables");
            return registration;
        }
    }

    private record DemoPrincipal(long id) implements Principal {
        @Override
        public String getName() {
            return "stone-rumble-local-" + id;
        }
    }

    @RestController
    @Profile("local & stone-rumble-demo & !db & !dev & !prod & !production")
    public static class Controller {
        private final StoneRumbleEngine engine;
        private final Clock clock;
        private final ObjectMapper mapper;
        private final ObjectNode preparation;
        private final Map<Integer, ReadyClient> clients = new HashMap<>();
        private final SpectatorEventPolicy chatPolicy = new SpectatorEventPolicy();
        private final List<LocalChatMessage> messages = new ArrayList<>();
        private long chatRevision;
        private String gameId;
        private String startId;
        private int participantCount;

        public Controller(StoneRumbleEngine engine, ObjectMapper mapper, Clock clock) {
            this.mapper = mapper;
            this.engine = engine;
            this.clock = clock;
            preparation = com.ssafy.ontop.game.stonerumble.service.StoneRumblePublicState.encode(mapper,
                    new StoneRumbleMatch(PLAYERS, 0).snapshot());
            preparation.put("gameId", "local-stone-rumble-preparation");
        }

        @GetMapping("/dev/stone-rumble/config")
        synchronized ResponseEntity<Map<String, Object>> config() {
            return response(200);
        }

        @PostMapping("/dev/stone-rumble/readiness")
        synchronized ResponseEntity<Map<String, Object>> ready(@RequestHeader("X-Stone-Rumble-Demo") String marker,
                @RequestParam int role, @RequestParam String clientId, @RequestParam boolean ready,
                @RequestParam boolean connected, @RequestParam long revision) {
            if (!marker.equals("local") || role < 1 || role > 8 || !isValidId(clientId)
                    || revision < 0 || revision > 9_007_199_254_740_991L) {
                return response(400);
            }
            ReadyClient previous = clients.get(role);
            if (previous != null && previous.clientId().equals(clientId) && revision <= previous.revision()) {
                return ResponseEntity.ok().body(Map.of("readyRoles", readyRoles()));
            }
            if (connected || previous == null || previous.clientId().equals(clientId)) {
                clients.put(role, new ReadyClient(clientId, ready && connected, clock.millis(), revision));
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(Map.of("readyRoles", readyRoles()));
        }

        @PostMapping("/dev/stone-rumble/matches")
        synchronized ResponseEntity<Map<String, Object>> create(@RequestHeader("X-Stone-Rumble-Demo") String marker,
                @RequestParam(defaultValue = "8") int players, @RequestParam String requestId,
                @RequestParam String clientId) {
            if (!marker.equals("local") || players < 2 || players > 8
                    || !isValidId(requestId) || !isValidId(clientId)) {
                return response(400);
            }
            if (requestId.equals(startId)) {
                return response(players == participantCount ? 201 : 400);
            }
            if (gameId != null && engine.load(101, gameId).orElseThrow().publicState()
                    .path("status").asText().equals("PLAYING")) {
                return response(409);
            }
            if (!isReady(1) || !clients.get(1).clientId().equals(clientId)
                    || IntStream.rangeClosed(1, players).anyMatch(role -> !isReady(role))) {
                return response(412);
            }
            String createdId = "local-stone-rumble-" + UUID.randomUUID();
            engine.create(createdId, "local-stone-rumble-table", PLAYERS.subList(0, players));
            // 독립 프리뷰는 위에서 각 화면의 GPU 준비 보고를 이미 확인했다.
            for (long user : PLAYERS.subList(0, players)) {
                engine.apply(new com.ssafy.ontop.game.action.GameActionCommand(user, createdId, "scene-ready-" + user,
                        engine.load(user, createdId).orElseThrow().version(),
                        mapper.createObjectNode().put("kind", "scene_ready").put("ready", true)));
            }
            gameId = createdId;
            startId = requestId;
            participantCount = players;
            messages.clear();
            chatRevision = 0;
            chatPolicy.clear();
            return response(201);
        }

        /** DB 없는 독립 프리뷰 전용 어댑터. 운영은 공통 GAME_SPECTATOR_CHAT_SEND를 사용한다. */
        @GetMapping("/dev/stone-rumble/chat")
        synchronized ResponseEntity<Map<String, Object>> chatHistory(@RequestParam String gameId,
                @RequestParam int role, @RequestParam String clientId) {
            if (!canChat(gameId, role, clientId)) {
                return chatResponse(403);
            }
            return chatResponse(200);
        }

        @PostMapping("/dev/stone-rumble/chat")
        synchronized ResponseEntity<Map<String, Object>> chat(@RequestHeader("X-Stone-Rumble-Demo") String marker,
                @RequestParam String gameId, @RequestParam int role, @RequestParam String clientId,
                @RequestBody LocalChatRequest request) {
            if (!marker.equals("local") || !canChat(gameId, role, clientId)) {
                return chatResponse(403);
            }
            if (!engine.load(PLAYERS.get(role - 1), gameId).orElseThrow().publicState()
                    .path("status").asText().equals("PLAYING")) {
                return chatResponse(409);
            }
            try {
                UUID.fromString(request.eventId());
                String text = new ChatText(request.text()).value();
                long userId = PLAYERS.get(role - 1);
                var previous = chatPolicy.previous(userId, request.eventId(), SpectatorEventPolicy.Kind.CHAT,
                        gameId, text, clock.millis());
                if (previous != null) {
                    return chatResponse(200);
                }
                chatPolicy.accept(userId, request.eventId(), SpectatorEventPolicy.Kind.CHAT,
                        gameId, text, clock.millis());
                messages.add(new LocalChatMessage(request.eventId(), Long.toString(userId), text));
                chatRevision++;
                if (messages.size() > 100) {
                    messages.removeFirst();
                }
                return chatResponse(200);
            } catch (SpectatorEventPolicy.Rejected rejected) {
                return chatResponse(429);
            } catch (IllegalArgumentException | NullPointerException rejected) {
                return chatResponse(400);
            }
        }

        private boolean canChat(String requestedGame, int role, String clientId) {
            ReadyClient client = clients.get(role);
            return gameId != null && gameId.equals(requestedGame) && role >= 1 && role <= participantCount
                    && client != null && client.ready() && client.clientId().equals(clientId)
                    && clock.millis() - client.seenAt() < 10_000;
        }

        private ResponseEntity<Map<String, Object>> chatResponse(int code) {
            // 거절 응답에는 다른 경기의 대화를 포함하지 않는다.
            return ResponseEntity.status(code).cacheControl(CacheControl.noStore())
                    .body(Map.of("messages", code == 200 ? List.copyOf(messages) : List.of(),
                            "revision", code == 200 ? chatRevision : 0));
        }

        record LocalChatRequest(String eventId, String text) { }
        record LocalChatMessage(String id, String userId, String text) { }

        private boolean isValidId(String id) {
            return id != null && id.matches("[A-Za-z0-9-]{1,64}");
        }

        private boolean isReady(int role) {
            ReadyClient client = clients.get(role);
            return client != null && client.ready() && clock.millis() - client.seenAt() < 10_000;
        }

        private record ReadyClient(String clientId, boolean ready, long seenAt, long revision) { }

        private List<Integer> readyRoles() {
            return IntStream.rangeClosed(1, 8).filter(this::isReady).boxed().toList();
        }

        private ResponseEntity<Map<String, Object>> response(int code) {
            return ResponseEntity.status(code).cacheControl(CacheControl.noStore())
                    .body(Map.of("gameId", gameId == null ? "" : gameId, "localOnly", true,
                            "preparationState", preparation,
                            "readyRoles", readyRoles(),
                            "publicState", gameId == null ? Map.of() : engine.load(101, gameId).orElseThrow().publicState()));
        }
    }
}
