package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingDeque;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorldChatHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong nanos = new AtomicLong();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3), new Channel("two", "둘", 3))), Duration.ofNanos(1), () -> 0L);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry,
            new WorldChatService(Duration.ofSeconds(1), Clock.systemUTC(), nanos::get));

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 응답대기중_AI알림은_버리지않고_원래순서로_보존한다() throws Exception {
        Peer receiver = new Peer();
        JsonNode notice = mapper.valueToTree(Map.of("type", "WORLD_AI_PRIVATE_NOTICE"));
        JsonNode reply = mapper.valueToTree(Map.of("type", "WORLD_CHAT_MESSAGE", "requestId", "chat-request"));
        JsonNode later = mapper.valueToTree(Map.of("type", "WORLD_CHAT_MODERATED"));
        receiver.messages.addAll(List.of(notice, reply, later));

        assertThat(receiver.matching(message -> message.path("requestId").asText().equals("chat-request")))
                .isEqualTo(reply);
        assertThat(receiver.messages).containsExactly(notice, later);
    }

    @Test
    void 동시_욕설은_작성자별_가림과_개인경고를_주고_정상작성자는_경고하지않는다(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
        try(var ai=new com.ssafy.ontop.ai.LocalWorldAi(mapper,directory,new com.ssafy.ontop.ai.OfflineDecisions(),
                com.ssafy.ontop.ai.AiNotifier.local(),hub)) {
            Peer a=peer(),b=peer(),normal=peer(); a.join("one"); b.join("one"); normal.join("one");
            a.messages.clear(); b.messages.clear(); normal.messages.clear();
            var aSent=a.request("WORLD_CHAT_SEND",Map.of("text","씨발")); b.next("WORLD_CHAT_MESSAGE"); normal.next("WORLD_CHAT_MESSAGE");
            var bSent=b.request("WORLD_CHAT_SEND",Map.of("text","병신")); a.next("WORLD_CHAT_MESSAGE"); normal.next("WORLD_CHAT_MESSAGE");
            var normalSent=normal.request("WORLD_CHAT_SEND",Map.of("text","안녕하세요")); a.next("WORLD_CHAT_MESSAGE"); b.next("WORLD_CHAT_MESSAGE");
            ai.flush(); ai.step();
            var aEvents=new java.util.ArrayList<JsonNode>(); var bEvents=new java.util.ArrayList<JsonNode>();
            var normalEvents=new java.util.ArrayList<JsonNode>();
            for(int i=0;i<5;i++) { aEvents.add(a.messages.poll(5,TimeUnit.SECONDS)); bEvents.add(b.messages.poll(5,TimeUnit.SECONDS)); }
            for(int i=0;i<4;i++) normalEvents.add(normal.messages.poll(5,TimeUnit.SECONDS));
            assertThat(aEvents).doesNotContainNull(); assertThat(bEvents).doesNotContainNull(); assertThat(normalEvents).doesNotContainNull();
            assertThat(aEvents.stream().filter(e -> e.path("type").asText().equals("WORLD_AI_PRIVATE_NOTICE"))).hasSize(1);
            assertThat(bEvents.stream().filter(e -> e.path("type").asText().equals("WORLD_AI_PRIVATE_NOTICE"))).hasSize(1);
            assertThat(normalEvents).noneMatch(e -> e.path("type").asText().equals("WORLD_AI_PRIVATE_NOTICE"));
            assertThat(normalEvents.stream().filter(e -> e.path("type").asText().equals("WORLD_CHAT_MODERATED"))
                    .map(e -> e.at("/payload/messageId").asText())).containsExactlyInAnyOrder(
                            aSent.at("/payload/messageId").asText(),bSent.at("/payload/messageId").asText())
                    .doesNotContain(normalSent.at("/payload/messageId").asText());
            assertThat(ai.status()).containsEntry("hidden",2L);
        }
    }

    @Test
    void 실제_채팅_ID와_원래_수신자로_가림과_경찰안내를_보낸다(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory) throws Exception {
        try(var ai=new com.ssafy.ontop.ai.LocalWorldAi(mapper,directory,new com.ssafy.ontop.ai.OfflineDecisions(),
                com.ssafy.ontop.ai.AiNotifier.local(),hub)) {
            Peer first=peer(), second=peer(), other=peer();
            first.join("one"); second.join("one");
            first.next("CHANNEL_STATE"); first.next("WORLD_STATE");
            other.join("two");
            var sent=first.request("WORLD_CHAT_SEND",Map.of("text","씨발"));
            second.next("WORLD_CHAT_MESSAGE");
            ai.flush(); ai.step();
            assertThat(first.next("WORLD_AI_POLICE").path("payload").path("speech").asText()).isNotBlank();
            first.next("WORLD_AI_PRIVATE_NOTICE");
            var hidden=first.next("WORLD_CHAT_MODERATED");
            assertThat(hidden.path("payload").path("messageId").asText()).isEqualTo(sent.path("payload").path("messageId").asText());
            second.next("WORLD_AI_POLICE");
            assertThat(second.next("WORLD_CHAT_MODERATED").path("payload")).isEqualTo(hidden.path("payload"));
            assertThat(other.messages.stream().noneMatch(m -> m.path("type").asText().startsWith("WORLD_AI")
                    || m.path("type").asText().equals("WORLD_CHAT_MODERATED"))).isTrue();
            hub.publishAi("one",List.of(first.userId),"WORLD_AI_PRIVATE_NOTICE",Map.of("text","입구 개인 안내"));
            assertThat(first.next("WORLD_AI_PRIVATE_NOTICE").at("/payload/text").asText()).isEqualTo("입구 개인 안내");
            assertThat(second.messages.poll(200,TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test
    void 채팅은_본인과_같은_채널에만_한_메시지_ID로_전송한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer other = peer();
        Peer outside = peer();
        first.join("one");
        second.join("one");
        first.next("CHANNEL_STATE");
        first.next("WORLD_STATE");
        other.join("two");
        JsonNode result = first.request("WORLD_CHAT_SEND", Map.of("text", "  <b>안녕</b>  "));
        JsonNode notice = second.next("WORLD_CHAT_MESSAGE");
        assertThat(result.path("type").asText()).isEqualTo("WORLD_CHAT_MESSAGE");
        assertThat(notice.path("requestId").isNull()).isTrue();
        assertThat(notice.path("payload")).isEqualTo(result.path("payload"));
        assertThat(result.path("payload").path("userId").asText()).isEqualTo(first.userId);
        assertThat(result.path("payload").path("text").asText()).isEqualTo("<b>안녕</b>");
        assertThat(result.path("payload").path("channelId").asText()).isEqualTo("one");
        assertThat(other.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(outside.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(first.request("WORLD_CHAT_SEND", Map.of("text", "너무 빠름"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        assertThat(second.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 미입장은_거절하고_대기_착석은_허용하며_채널_이동으로_간격을_초기화하지_않는다() throws Exception {
        Peer user = peer();
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "미입장"))
                .path("payload").path("code").asText()).isEqualTo("NOT_IN_CHANNEL");
        user.join("one");
        user.request("TABLE_JOIN", Map.of("tableId", hub.listTables("one").tables().getFirst().tableId()));
        user.next("WORLD_STATE");
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "대기 중"))
                .path("type").asText()).isEqualTo("WORLD_CHAT_MESSAGE");
        user.request("TABLE_LEAVE", Map.of());
        user.next("WORLD_STATE");
        user.request("CHANNEL_LEAVE", Map.of());
        user.join("two");
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "이동 직후"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        nanos.set(1_000_000_000);
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "1초 뒤"))
                .path("payload").path("channelId").asText()).isEqualTo("two");
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        hub.connect(session);
        peer.userId = peer.next("CONNECTED").path("payload").path("userId").asText();
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingDeque<JsonNode> messages = new LinkedBlockingDeque<>();
        private String userId;

        private void join(String channel) throws Exception {
            request("CHANNEL_JOIN", Map.of("channelId", channel));
            next("WORLD_STATE");
            assertThat(next("WORLD_CHAT_TYPING_STATE").at("/payload/users")).isEmpty();
            assertThat(next("WORLD_PARK_DEBRIS_STATE").at("/payload/items")).isEmpty();
            registry.move(userId, new WorldChannelRegistry.Position(0, 0, 0, 0, 0));
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            JsonNode response = matching(message -> message.path("requestId").asText().equals(requestId));
            assertThat(response).isNotNull();
            assertThat(response.path("requestId").asText()).isEqualTo(requestId);
            return response;
        }

        // Unsolicited AI notices may precede an ACK or chat. Keep them for the assertions below.
        private JsonNode matching(java.util.function.Predicate<JsonNode> predicate) throws InterruptedException {
            var deferred = new java.util.ArrayList<JsonNode>();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            try {
                while (true) {
                    long remaining = deadline - System.nanoTime();
                    if (remaining <= 0) return null;
                    JsonNode message = messages.pollFirst(remaining, TimeUnit.NANOSECONDS);
                    if (message == null) return null;
                    if (predicate.test(message)) return message;
                    deferred.add(message);
                }
            } finally {
                for (int i = deferred.size() - 1; i >= 0; i--) messages.addFirst(deferred.get(i));
            }
        }

        private JsonNode next(String type) throws Exception {
            JsonNode response = matching(message -> message.path("type").asText().equals(type));
            assertThat(response).isNotNull();
            assertThat(response.path("type").asText()).isEqualTo(type);
            return response;
        }
    }
}
