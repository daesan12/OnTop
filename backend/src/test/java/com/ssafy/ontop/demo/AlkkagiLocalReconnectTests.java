package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AlkkagiLocalReconnectTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 유예안_재접속은_같은판과_원래_턴시한을_유지한다() throws Exception {
        var clock = new TestClock(); var red = new Client("red", "red"); var green = new Client("green", "green");
        try (var server = new AlkkagiDemoApplication.DemoSocket(mapper, clock)) {
            server.afterConnectionEstablished(red.socket); server.afterConnectionEstablished(green.socket);
            red.until(m -> m.path("type").asText().equals("STATE"));
            server.handleTextMessage(red.socket, new TextMessage("{\"type\":\"START\"}"));
            var initial = red.until(m -> m.path("state").path("stage").asText().equals("AIMING")).path("state");
            clock.now = 1000; server.afterConnectionClosed(green.socket, CloseStatus.NORMAL);
            red.until(m -> m.path("state").path("reconnectDeadlines").path(1).asLong() == 31_000);
            clock.now = 2000; var recovery = new Client("green-reconnected", "green"); server.afterConnectionEstablished(recovery.socket);
            var state = recovery.until(m -> m.path("type").asText().equals("STATE")).path("state");
            assertThat(state.path("gameId")).isEqualTo(initial.path("gameId"));
            assertThat(state.path("turnDeadline").asLong()).isEqualTo(30_000);
            clock.now = 31_001;
            var after = red.until(m -> m.path("state").path("serverNow").asLong() == 31_001).path("state");
            assertThat(after.path("stage").asText()).isNotEqualTo("FINISHED");
        }
    }

    @Test
    void 마지막_동일역할_연결이_끊긴후_30초가_지나면_한번만_종료한다() throws Exception {
        var clock = new TestClock(); var red = new Client("red", "red"); var green = new Client("green", "green");
        try (var server = new AlkkagiDemoApplication.DemoSocket(mapper, clock)) {
            server.afterConnectionEstablished(red.socket); server.afterConnectionEstablished(green.socket);
            red.until(m -> m.path("type").asText().equals("STATE"));
            server.handleTextMessage(red.socket, new TextMessage("{\"type\":\"START\"}"));
            red.until(m -> m.path("state").path("stage").asText().equals("AIMING"));
            clock.now = 1000; server.afterConnectionClosed(green.socket, CloseStatus.NORMAL);
            red.until(m -> m.path("state").path("reconnectDeadlines").path(1).asLong() == 31_000);
            clock.now = 31_001;
            var finished = red.until(m -> m.path("state").path("stage").asText().equals("FINISHED")).path("state");
            assertThat(finished.path("endReason").asText()).isEqualTo("DISCONNECT_TIMEOUT");
            assertThat(finished.path("winner").asInt()).isZero();
            clock.now = 100_000;
            assertThat(red.until(m -> m.path("state").path("serverNow").asLong() == 100_000).path("state").path("version"))
                    .isEqualTo(finished.path("version"));
        }
    }

    private final class Client {
        final WebSocketSession socket = mock(WebSocketSession.class);
        final LinkedBlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        Client(String id, String role) throws Exception {
            when(socket.getId()).thenReturn(id); when(socket.getUri()).thenReturn(URI.create("ws://127.0.0.1/dev/alkkagi-ws?role=" + role));
            when(socket.isOpen()).thenReturn(true);
            doAnswer(call -> {
                messages.add(mapper.readTree(call.getArgument(0, WebSocketMessage.class).getPayload().toString())); return null;
            }).when(socket).sendMessage(any());
        }
        JsonNode until(Predicate<JsonNode> predicate) throws Exception {
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            while (System.nanoTime() < end) { var m = messages.poll(100, TimeUnit.MILLISECONDS); if (m != null && predicate.test(m)) return m; }
            throw new AssertionError("로컬 재접속 상태 시간 초과");
        }
    }
    private static final class TestClock extends Clock {
        volatile long now;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
        @Override public long millis() { return now; }
    }
}
