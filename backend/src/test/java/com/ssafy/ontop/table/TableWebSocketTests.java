package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("local")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class TableWebSocketTests {

    private final ObjectMapper mapper = new ObjectMapper();

    @LocalServerPort
    private int port;

    @Test
    void 임시사용자는_경기결과를_조회할수없다() throws Exception {
        try (Client client = connect()) {
            assertCode(client.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")),
                    "GAME_RESULT_AUTH_REQUIRED");
        }
    }

    @Test
    void 두_연결의_착석_준비_취소_퇴장과_종료를_동기화한다() throws Exception {
        try (Client first = connect(); Client second = connect(); Client third = connect()) {
            assertThat(first.userId).startsWith("dev-").isNotEqualTo(second.userId);
            JsonNode joined = first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            long version = first.request("GAME_SELECT", Map.of("gameCode", "OMOK"))
                    .path("payload").path("version").asLong();
            assertThat(joined.path("payload").path("seats").get(0).path("userId").asText())
                    .isEqualTo(first.userId);
            assertThat(joined.path("payload").path("seats").get(1).path("userId").isNull()).isTrue();
            assertThat(first.request("READY_SET", Map.of("ready", true)).path("payload").path("allReady")
                    .asBoolean()).isFalse();

            JsonNode full = second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            JsonNode notification = first.next();
            assertThat(notification.path("requestId").isNull()).isTrue();
            assertThat(notification.path("payload")).isEqualTo(full.path("payload"));
            assertThat(full.path("payload").path("version").asLong()).isEqualTo(version + 2);
            assertThat(full.path("payload").path("seats").get(0).path("ready").asBoolean()).isFalse();
            assertCode(third.request("TABLE_JOIN", Map.of("tableId", "table-1")), "TABLE_FULL");
            assertCode(first.request("TABLE_JOIN", Map.of("tableId", "table-2")), "ALREADY_SEATED");

            JsonNode repeated = first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            assertThat(repeated.path("payload")).isEqualTo(full.path("payload"));
            first.request("READY_SET", Map.of("ready", true));
            second.next();
            JsonNode allReady = second.request("READY_SET", Map.of("ready", true));
            assertThat(allReady.path("payload").path("allReady").asBoolean()).isTrue();
            assertThat(first.next().path("payload")).isEqualTo(allReady.path("payload"));
            JsonNode unchanged = second.request("READY_SET", Map.of("ready", true));
            assertThat(unchanged.path("payload")).isEqualTo(allReady.path("payload"));

            assertThat(first.request("READY_SET", Map.of("ready", false)).path("payload").path("allReady")
                    .asBoolean()).isFalse();
            second.next();
            assertThat(second.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            JsonNode left = first.next();
            assertThat(left.path("payload").path("seats").get(1).path("userId").isNull()).isTrue();
            assertCode(second.request("TABLE_LEAVE", Map.of()), "NOT_SEATED");

            second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            first.next();
            second.request("READY_SET", Map.of("ready", true));
            first.next();
            first.socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
            JsonNode disconnected = second.next();
            assertThat(disconnected.path("payload").path("seats").get(0).path("userId").isNull()).isTrue();
            assertThat(disconnected.path("payload").path("seats").get(1).path("ready").asBoolean()).isFalse();
            assertThat(third.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "garbage|INVALID_JSON", "{}|INVALID_MESSAGE", "[]|INVALID_MESSAGE", "null|INVALID_MESSAGE",
            "{\"requestId\":\"x\",\"type\":\"X\",\"payload\":{}}|UNSUPPORTED_MESSAGE_TYPE",
            "{\"requestId\":\"x\",\"type\":\"READY_SET\",\"payload\":{\"ready\":\"true\"}}|INVALID_PAYLOAD",
            "{\"requestId\":\"x\",\"type\":\"TABLE_JOIN\",\"payload\":{}}|INVALID_PAYLOAD",
            "{\"requestId\":\"x\",\"type\":\"TABLE_JOIN\",\"payload\":{\"tableId\":\" \"}}|INVALID_PAYLOAD",
            "{\"requestId\":\"x\",\"type\":\"TABLE_LEAVE\",\"payload\":{\"userId\":1}}|INVALID_PAYLOAD",
            "{\"requestId\":\"x\",\"type\":\"TABLE_LEAVE\",\"payload\":[],\"extra\":1}|INVALID_MESSAGE",
            "{\"requestId\":\" \",\"type\":\"TABLE_LEAVE\",\"payload\":{}}|INVALID_MESSAGE",
            "{\"requestId\":\"x\",\"type\":\"TABLE_LEAVE\",\"payload\":{}} {}|INVALID_JSON"
    })
    void 잘못된_요청은_오류를_반환하고_연결을_유지한다(String text, String code) throws Exception {
        try (Client client = connect()) {
            client.socket.sendText(text, true).join();
            assertCode(client.next(), code);
            assertCode(client.request("READY_SET", Map.of("ready", true)), "NOT_SEATED");
        }
    }

    @Test
    void 다른_테이블에는_알림을_보내지_않는다() throws Exception {
        try (Client first = connect(); Client other = connect()) {
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            other.request("TABLE_JOIN", Map.of("tableId", "table-2"));
            first.request("READY_SET", Map.of("ready", true));

            assertThat(other.messages.poll(200, TimeUnit.MILLISECONDS)).isNull();
            assertCode(first.request("TABLE_JOIN", Map.of("tableId", "unknown")), "TABLE_NOT_FOUND");
        }
    }

    @Test
    void 로컬_개발_페이지_유무와_무관하게_다른_출처의_연결은_거절한다() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> page = client.send(HttpRequest.newBuilder(
                    URI.create("http://127.0.0.1:" + port + "/dev/tables")).build(),
                    HttpResponse.BodyHandlers.ofString());

            boolean localPageExists = new org.springframework.core.io.ClassPathResource("dev/tables.html").exists();
            assertThat(page.statusCode()).isEqualTo(localPageExists ? 200 : 404);
            assertThatThrownBy(() -> client.newWebSocketBuilder().header("Origin", "https://example.org")
                    .buildAsync(uri(), new WebSocket.Listener() { }).join()).hasCauseInstanceOf(
                            WebSocketHandshakeException.class);
        }
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.path("payload").path("code").asText()).isEqualTo(code);
    }

    private URI uri() {
        return URI.create("ws://127.0.0.1:" + port + "/ws/tables");
    }

    private Client connect() throws Exception {
        Client client = new Client();
        client.socket = client.http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                .buildAsync(uri(), client).join();
        JsonNode connected = client.next();
        assertThat(connected.path("type").asText()).isEqualTo("CONNECTED");
        assertThat(connected.path("requestId").isNull()).isTrue();
        client.userId = connected.path("payload").path("userId").asText();
        return client;
    }

    private class Client implements WebSocket.Listener, AutoCloseable {

        private final HttpClient http = HttpClient.newHttpClient();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();
        private WebSocket socket;
        private String userId;

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) {
                messages.add(fragments.toString());
                fragments.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String id = UUID.randomUUID().toString();
            socket.sendText(mapper.writeValueAsString(Map.of("requestId", id, "type", type, "payload", payload)),
                    true).join();
            JsonNode response = next();
            assertThat(response.path("requestId").asText()).isEqualTo(id);
            assertThat(response.properties()).extracting(Map.Entry::getKey)
                    .containsExactlyInAnyOrderElementsOf(List.of("requestId", "type", "payload"));
            return response;
        }

        private JsonNode next() throws Exception {
            String message = messages.poll(5, TimeUnit.SECONDS);
            assertThat(message).as("서버 메시지 수신").isNotNull();
            return mapper.readTree(message);
        }

        @Override
        public void close() {
            if (!socket.isOutputClosed()) {
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "test done").join();
            }
            http.close();
        }
    }
}
