package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=local")
class TableQueryTests {

    @Autowired
    private TestRestTemplate http;

    @Autowired
    private TableHub hub;

    @Autowired
    private ObjectMapper mapper;

    private final List<String> sessions = new ArrayList<>();

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
                    "allReady", "status", "joinable", "gameCode");
            assertThat(table.path("gameCode").isNull()).isTrue();
            assertThat(table.path("occupiedSeats").asInt()).isZero();
            assertThat(table.path("availableSeats").asInt()).isEqualTo(2);
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
        send(first, "GAME_SELECT", Map.of("gameCode", "OMOK"));
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
        assertThat(table.path("capacity").asInt()).isEqualTo(2);
        assertThat(table.path("minimumPlayers").asInt()).isEqualTo(2);
        assertThat(table.path("occupiedSeats").asInt()).isEqualTo(occupied);
        assertThat(table.path("availableSeats").asInt()).isEqualTo(2 - occupied);
        assertThat(table.path("readyCount").asInt()).isEqualTo(ready);
        assertThat(table.path("joinable").asBoolean()).isEqualTo(joinable);
        assertThat(table.path("allReady").asBoolean()).isEqualTo(allReady);
        assertThat(table.path("status").asText()).isEqualTo("WAITING");
    }

    private String connect() {
        String id = UUID.randomUUID().toString();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        hub.connect(session);
        sessions.add(id);
        return id;
    }

    private void send(String session, String type, Object payload) throws Exception {
        hub.receive(session, mapper.writeValueAsString(Map.of(
                "requestId", UUID.randomUUID().toString(), "type", type, "payload", payload)));
    }
}
