package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.user.domain.LoginProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.security.Principal;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.filter.OncePerRequestFilter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthenticatedWebSocketTests {

    private final ObjectMapper mapper = new ObjectMapper();

    @LocalServerPort
    private int port;

    @ParameterizedTest
    @ValueSource(strings = {"missing", "expired", "unsupported"})
    void 미인증과_만료와_지원하지않는_인증은_ID를_위조해도_거절한다(String login) {
        try (HttpClient http = HttpClient.newHttpClient()) {
            assertThatThrownBy(() -> http.newWebSocketBuilder().header("X-Test-Login", login)
                    .header("X-User-Id", "101").header("Authorization", "Bearer forged")
                    .buildAsync(URI.create(url() + "?userId=101"), new WebSocket.Listener() { }).join())
                    .hasCauseInstanceOf(WebSocketHandshakeException.class)
                    .satisfies(error -> assertThat(((WebSocketHandshakeException) error.getCause())
                            .getResponse().statusCode()).isEqualTo(401));
        }
    }

    @Test
    void 검증된_두계정이_내부ID로_착석하고_상대ID를_요청에_넣으면_거절한다() throws Exception {
        try (Client first = new Client("naver"); Client second = new Client("ssafy")) {
            assertThat(first.userId).isEqualTo("101");
            assertThat(second.userId).isEqualTo("202");
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            JsonNode state = second.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
            assertThat(state.path("seats").get(0).path("userId").asText()).isEqualTo("101");
            assertThat(state.path("seats").get(1).path("userId").asText()).isEqualTo("202");
            JsonNode forged = second.request("GAME_SELECT", Map.of("gameCode", "OMOK", "userId", "101"));
            assertThat(forged.path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
            assertThat(second.request("GAME_SELECT", Map.of("gameCode", "OMOK"))
                    .path("payload").path("code").asText()).isEqualTo("NOT_GAME_SELECTOR");
            first.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
            first.request("READY_SET", Map.of("ready", true));
            assertThat(second.request("READY_SET", Map.of("ready", true)).path("payload")
                    .path("allReady").asBoolean()).isTrue();
            first.request("TABLE_LEAVE", Map.of());
            second.request("TABLE_LEAVE", Map.of());
        }
    }

    private String url() {
        return "ws://127.0.0.1:" + port + "/ws/tables";
    }

    @Test
    void 인증됐어도_다른출처의_브라우저_연결은_거절한다() {
        try (HttpClient http = HttpClient.newHttpClient()) {
            assertThatThrownBy(() -> http.newWebSocketBuilder().header("X-Test-Login", "naver")
                    .header("Origin", "https://untrusted.invalid")
                    .buildAsync(URI.create(url()), new WebSocket.Listener() { }).join())
                    .hasCauseInstanceOf(WebSocketHandshakeException.class)
                    .satisfies(error -> assertThat(((WebSocketHandshakeException) error.getCause())
                            .getResponse().statusCode()).isEqualTo(403));
        }
    }

    @Test
    void 같은계정의_새연결을_막고_기존연결과_좌석은_유지한다() throws Exception {
        try (Client first = new Client("naver")) {
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            try (HttpClient duplicate = HttpClient.newHttpClient()) {
                BlockingQueue<Integer> closed = new LinkedBlockingQueue<>();
                WebSocket socket = duplicate.newWebSocketBuilder().header("X-Test-Login", "naver")
                        .buildAsync(URI.create(url()), new WebSocket.Listener() {
                            @Override
                            public void onOpen(WebSocket webSocket) {
                                webSocket.request(1);
                            }

                            @Override
                            public CompletionStage<?> onClose(WebSocket webSocket, int code, String reason) {
                                closed.add(code);
                                return null;
                            }
                        }).join();
                assertThat(closed.poll(5, TimeUnit.SECONDS)).isEqualTo(1008);
                socket.abort();
            }
            JsonNode state = first.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload");
            assertThat(state.path("seats").get(0).path("userId").asText()).isEqualTo("101");
            first.request("TABLE_LEAVE", Map.of());
        }
    }

    @Test
    void 종료정리후_같은계정이_같은ID로_다시_연결하고_중복종료도_새연결을_해치지않는다() throws Exception {
        try (Client observer = new Client("ssafy")) {
            observer.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            try (Client first = new Client("naver")) {
                first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            }
            observer.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("seats").get(1).path("userId").isNull());
            try (Client reconnected = new Client("naver")) {
                assertThat(reconnected.userId).isEqualTo("101");
                assertThat(reconnected.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                        .path("type").asText()).isEqualTo("TABLE_STATE");
                reconnected.request("TABLE_LEAVE", Map.of());
            }
            observer.request("TABLE_LEAVE", Map.of());
        }
    }

    private class Client implements WebSocket.Listener, AutoCloseable {

        private final HttpClient http = HttpClient.newHttpClient();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();
        private final WebSocket socket;
        private final String userId;

        private Client(String login) throws Exception {
            socket = http.newWebSocketBuilder().header("X-Test-Login", login)
                    .buildAsync(URI.create(url()), this).join();
            userId = await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText();
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence text, boolean last) {
            fragments.append(text);
            if (last) {
                messages.add(fragments.toString());
                fragments.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            socket.sendText(mapper.writeValueAsString(Map.of("requestId", requestId,
                    "type", type, "payload", payload)), true).join();
            return await(message -> message.path("requestId").asText().equals(requestId));
        }

        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                String text = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(text).isNotNull();
                JsonNode message = mapper.readTree(text);
                if (predicate.test(message)) {
                    return message;
                }
            }
        }

        @Override
        public void close() {
            socket.abort();
            http.close();
        }
    }

    @Test
    void 결과담당이_없으면_결과조회는_미연동으로_응답한다() throws Exception {
        try (Client client = new Client("naver")) {
            assertThat(client.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701"))
                    .path("payload").path("code").asText()).isEqualTo("GAME_RESULT_NOT_CONFIGURED");
        }
    }

    // 테스트 소스에만 존재하는 서버 인증 대역이다. 이 헤더를 읽는 운영 코드는 없다.
    @TestConfiguration(proxyBeanMethods = false)
    static class AuthFixture {
        @Bean
        @org.springframework.context.annotation.Primary
        ActiveMemberLookup fixtureSessions() {
            return (id, sessionId) -> Set.of(42L, 101L, 202L, 505L).contains(id)
                    && TestLoginSessions.ID.equals(sessionId)
                    ? Optional.of(new AuthenticatedUser(id,
                            id == 202 || id == 42 ? LoginProvider.SSAFY
                                    : LoginProvider.NAVER, sessionId))
                    : Optional.empty();
        }

        @Bean
        WebSocketUserResolver testResolver() {
            return principal -> {
                if (!(principal instanceof TestPrincipal user) || !user.valid()) {
                    return Optional.empty();
                }
                return switch (user.provider()) {
                    case "NAVER" -> Optional.of(new VerifiedWebSocketUser(user.id(), Provider.NAVER, TestLoginSessions.ID));
                    case "SSAFY" -> Optional.of(new VerifiedWebSocketUser(user.id(), Provider.SSAFY, TestLoginSessions.ID));
                    default -> Optional.empty();
                };
            };
        }

        @Bean
        FilterRegistrationBean<OncePerRequestFilter> testPrincipalFilter() {
            FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>();
            registration.setFilter(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    String login = request.getHeader("X-Test-Login");
                    Principal principal = switch (login == null ? "" : login) {
                        case "naver" -> new TestPrincipal(101, "NAVER", true);
                        case "ssafy" -> new TestPrincipal(202, "SSAFY", true);
                        case "spectator" -> new TestPrincipal(505, "NAVER", true);
                        case "expired" -> new TestPrincipal(303, "NAVER", false);
                        case "unsupported" -> new TestPrincipal(404, "GOOGLE", true);
                        default -> null;
                    };
                    chain.doFilter(new HttpServletRequestWrapper(request) {
                        @Override
                        public Principal getUserPrincipal() {
                            return principal;
                        }
                    }, response);
                }
            });
            registration.addUrlPatterns("/ws/tables");
            return registration;
        }
    }

    private record TestPrincipal(long id, String provider, boolean valid) implements Principal {

        @Override
        public String getName() {
            return "external-provider-subject";
        }
    }
}
