package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.table.service.TableHub;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.TextMessage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.any;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=local")
@Import(RestSecurityTestSupport.class)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class TableQueryTests {

    @Autowired
    private AccessJwtService jwt;

    @BeforeEach
    void authenticateRest() {
        RestSecurityTestSupport.authenticate(http, jwt);
    }

    @Autowired
    private TestRestTemplate http;

    @Autowired
    private TableHub hub;

    @Autowired
    private ObjectMapper mapper;

    private final List<String> sessions = new ArrayList<>();
    private final Map<String, BlockingQueue<JsonNode>> received = new HashMap<>();

    @AfterEach
    void disconnect() {
        sessions.forEach(hub::disconnect);
    }

    @Test
    void 목록은_정렬된_공개_요약만_반환하고_캐시하지_않는다() {
        ResponseEntity<JsonNode> response = http.getForEntity("/api/v1/tables", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().properties()).extracting(Map.Entry::getKey).containsExactly("tables");
        JsonNode tables = response.getBody().path("tables");
        assertThat(tables).hasSize(2);
        assertThat(tables.get(0).path("tableId").asText()).isEqualTo("table-1");
        assertThat(tables.get(1).path("tableId").asText()).isEqualTo("table-2");
        for (JsonNode table : tables) {
            assertThat(table.properties()).extracting(Map.Entry::getKey).containsExactlyInAnyOrder(
                    "tableId", "capacity", "minimumPlayers", "occupiedSeats", "availableSeats", "readyCount",
                    "allReady", "status", "joinable", "gameCode", "targetScore", "betAmountPerPlayer", "gameId", "selectorUserId", "selectedPlayers", "startMode", "anchorId");
            assertThat(table.path("anchorId").isNull()).isTrue();
            assertThat(table.path("gameCode").isNull()).isTrue();
            assertThat(table.path("gameId").isNull()).isTrue();
            assertThat(table.path("betAmountPerPlayer").isNull()).isTrue();
            assertThat(table.path("occupiedSeats").asInt()).isZero();
            assertThat(table.path("availableSeats").asInt()).isEqualTo(4);
            assertThat(table.path("readyCount").asInt()).isZero();
            assertThat(table.path("allReady").asBoolean()).isFalse();
            assertThat(table.path("status").asText()).isEqualTo("WAITING");
            assertThat(table.path("joinable").asBoolean()).isTrue();
        }
    }

    @Test
    void 착석과_준비와_퇴장과_연결_종료가_HTTP_목록에_반영된다() throws Exception {
        String first = connect();
        String second = connect();
        send(first, "TABLE_JOIN", Map.of("tableId", "table-1"));
        send(first, "GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
        send(first, "READY_SET", Map.of("ready", true));
        assertSummary(1, 1, true, false);
        send(second, "TABLE_JOIN", Map.of("tableId", "table-1"));
        assertSummary(2, 0, false, false);
        send(first, "READY_SET", Map.of("ready", true));
        send(second, "READY_SET", Map.of("ready", true));
        assertSummary(2, 2, false, true);
        send(first, "READY_SET", Map.of("ready", false));
        assertSummary(2, 1, false, false);
        send(first, "TABLE_LEAVE", Map.of());
        assertSummary(1, 0, true, false);
        hub.disconnect(second);
        assertSummary(0, 0, true, false);
        assertThat(http.getForObject("/api/v1/tables", String.class))
                .doesNotContain("dev-", "userId", "seats", "startAttemptId", "gameSessionId");
    }

    @Test
    void 목록_조회_경로에는_POST를_지원하지_않는다() {
        assertThat(http.postForEntity("/api/v1/tables", Map.of(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
    }

    private void assertSummary(int occupied, int ready, boolean joinable, boolean allReady) {
        JsonNode table = http.getForObject("/api/v1/tables", JsonNode.class).path("tables").get(0);
        int capacity = occupied == 0 ? 4 : 2;
        assertThat(table.path("capacity").asInt()).isEqualTo(capacity);
        assertThat(table.path("minimumPlayers").asInt()).isEqualTo(2);
        assertThat(table.path("occupiedSeats").asInt()).isEqualTo(occupied);
        assertThat(table.path("availableSeats").asInt()).isEqualTo(capacity - occupied);
        assertThat(table.path("readyCount").asInt()).isEqualTo(ready);
        assertThat(table.path("joinable").asBoolean()).isEqualTo(joinable);
        assertThat(table.path("allReady").asBoolean()).isEqualTo(allReady);
        assertThat(table.path("status").asText()).isEqualTo("WAITING");
    }

    private String connect() throws Exception {
        String id = UUID.randomUUID().toString();
        BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        received.put(id, messages);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        doAnswer(call -> {
            messages.add(ReadyConsent.received(id, mapper.readTree(((TextMessage) call.getArgument(0)).getPayload())));
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        hub.connect(session);
        sessions.add(id);
        return id;
    }

    private void send(String session, String type, Object payload) throws Exception {
        // 실제 수신한 최신 상태로 동의한다. 다른 참가자 착석 알림을 기다리지 않는 테스트 경합을 피한다.
        if (type.equals("READY_SET") && Boolean.TRUE.equals(((Map<?, ?>) payload).get("ready"))) {
            send(session, "TABLE_JOIN", Map.of("tableId", "table-1"));
        }
        String requestId = UUID.randomUUID().toString();
        hub.receive(session, mapper.writeValueAsString(Map.of(
                "requestId", requestId, "type", type, "payload", ReadyConsent.payload(session, type, payload))));
        JsonNode reply;
        do { reply = received.get(session).poll(5, TimeUnit.SECONDS); assertThat(reply).isNotNull(); }
        while (!reply.path("requestId").asText().equals(requestId));
        assertThat(reply.path("type").asText()).isNotEqualTo("ERROR");
    }
}
