package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("local")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.start-rehearsal.enabled=true", "ontop.start-rehearsal.delay-millis=0",
        "ontop.start-rehearsal.countdown-millis=60000"
})
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class GameStartWebSocketTests {

    private final ObjectMapper mapper = new ObjectMapper();

    @LocalServerPort
    private int port;

    @ParameterizedTest
    @CsvSource({"ONE_CARD,3", "ONE_CARD,4", "LIAR_BRIDGE,3", "LIAR_BRIDGE,4"})
    void 다인_실제연결에서_선택한_게임의_같은_시작결과를_받는다(String game, int count) throws Exception {
        List<Client> players = new ArrayList<>();
        try {
            for (int index = 0; index < count; index++) {
                Client player = new Client();
                players.add(player);
                player.send("TABLE_JOIN", Map.of("tableId", "table-2"));
                player.await(message -> message.path("type").asText().equals("TABLE_STATE"));
                if (index == 0) {
                    player.send("GAME_SELECT", game.equals("DICE") ? Map.of("gameCode", game, "targetScore", 4000) : Map.of("gameCode", game));
                    player.await(message -> message.path("type").asText().equals("TABLE_STATE")
                            && message.path("payload").path("gameCode").asText().equals(game));
                }
            }
            for (int index = 0; index < count; index++) {
                int seat = index;
                Client player = players.get(index);
                player.send("READY_SET", Map.of("ready", true));
                player.await(message -> message.path("type").asText().equals("TABLE_STATE")
                        && message.path("payload").path("seats").get(seat).path("ready").asBoolean());
            }
            JsonNode result = players.getFirst().confirmed().path("payload");
            assertThat(result.path("gameCode").asText()).isEqualTo(game);
            for (int index = 1; index < count; index++) {
                assertThat(players.get(index).confirmed().path("payload")).isEqualTo(result);
            }
            for (Client player : players) {
                assertThat(player.phases).doesNotContain("COUNTDOWN");
            }
        } finally {
            players.forEach(Client::close);
        }
    }

    @Test
    void 전원_준비하면_과거_타이머_설정과_무관하게_카운트다운_없이_시작한다() throws Exception {
        try (Client first = new Client(); Client second = new Client()) {
            first.send("TABLE_JOIN", Map.of("tableId", "table-1"));
            first.await(message -> message.path("type").asText().equals("TABLE_STATE"));
            second.send("TABLE_JOIN", Map.of("tableId", "table-1"));
            second.await(message -> message.path("type").asText().equals("TABLE_STATE"));
            second.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.path("payload").path("phase").asText().equals("WAITING"));
            assertThat(second.phases).contains("WAITING").doesNotContain("STARTING", "CONFIRMED");
            first.send("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000));
            first.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("gameCode").asText().equals("DICE"));
            first.send("READY_SET", Map.of("ready", true));
            first.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("seats").get(0).path("ready").asBoolean());
            assertThat(first.phases).doesNotContain("STARTING", "CONFIRMED");
            second.send("READY_SET", Map.of("ready", true));
            JsonNode firstResult = first.confirmed();
            JsonNode secondResult = second.confirmed();

            assertThat(firstResult.path("payload")).isEqualTo(secondResult.path("payload"));
            assertThat(firstResult.path("requestId").isNull()).isTrue();
            assertThat(firstResult.path("payload").path("gameSessionId").asText()).startsWith("demo-game-");
            assertThat(firstResult.path("payload").path("simulation").asBoolean()).isTrue();
            assertThat(firstResult.path("payload").path("gameCode").asText()).isEqualTo("DICE");
            assertThat(first.phases).containsSubsequence("WAITING", "STARTING", "CONFIRMED")
                    .doesNotContain("COUNTDOWN");
            assertThat(second.phases).containsSubsequence("WAITING", "STARTING", "CONFIRMED")
                    .doesNotContain("COUNTDOWN");
            assertThat(firstResult.path("payload").has("countdownEndsAt")).isFalse();
        }
    }

    private class Client implements WebSocket.Listener, AutoCloseable {

        private final HttpClient http = HttpClient.newHttpClient();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final List<String> phases = new ArrayList<>();
        private final StringBuilder fragments = new StringBuilder();
        private final WebSocket socket;

        private Client() throws Exception {
            socket = http.newWebSocketBuilder().buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tables"), this)
                    .join();
            assertThat(await(message -> true).path("type").asText()).isEqualTo("CONNECTED");
            assertThat(await(message -> true).path("type").asText()).isEqualTo("GAME_START_STATE");
        }

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

        private void send(String type, Object payload) throws Exception {
            socket.sendText(mapper.writeValueAsString(Map.of("requestId", UUID.randomUUID().toString(),
                    "type", type, "payload", payload)), true).join();
        }

        private JsonNode confirmed() throws Exception {
            return await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.path("payload").path("phase").asText().equals("CONFIRMED"));
        }

        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                String text = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(text).isNotNull();
                JsonNode message = mapper.readTree(text);
                if (message.path("type").asText().equals("GAME_START_STATE")) {
                    phases.add(message.path("payload").path("phase").asText());
                }
                if (predicate.test(message)) {
                    return message;
                }
            }
        }

        @Override
        public void close() {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "test done").join();
            http.close();
        }
    }
}
