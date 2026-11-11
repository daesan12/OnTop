package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.WorldAiBridge;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WorldAiChatIngressTests {
    private final ObjectMapper mapper=new ObjectMapper();
    private final AtomicLong nanos=new AtomicLong();
    private final WorldChannelRegistry channels=spy(new WorldChannelRegistry(
            new WorldChannelProperties(List.of(new Channel("one","하나",3))),Duration.ofNanos(1),()->0L));
    private final TableHub hub=new TableHub(mapper,Optional.empty(),false,Optional.empty(),
            Duration.ofSeconds(10),Duration.ofSeconds(10),channels,
            new WorldChatService(Duration.ofSeconds(1),Clock.systemUTC(),nanos::get));
    private final LinkedBlockingQueue<JsonNode> messages=new LinkedBlockingQueue<>();
    private final String sessionId=UUID.randomUUID().toString();

    @AfterEach void close(){hub.shutdown();}

    @Test void missingPositionSkipsAiButKeepsChatAndFollowingRequestsWorking() throws Exception {
        String user=join();
        var bridge=mock(WorldAiBridge.class);hub.aiBridge(bridge);
        // Position exists at the send precondition, then disappears before AI ingress.
        var originalPosition=channels.positionOf(user);
        doReturn(originalPosition,(Object)null).when(channels).positionOf(user);
        assertThat(send("WORLD_CHAT_SEND",Map.of("text","안녕하세요")).path("type").asText())
                .isEqualTo("WORLD_CHAT_MESSAGE");
        verifyNoInteractions(bridge);
        doCallRealMethod().when(channels).positionOf(user);
        nanos.set(1_000_000_000L);
        assertThat(send("WORLD_CHAT_SEND",Map.of("text","다시 인사해요")).path("type").asText())
                .isEqualTo("WORLD_CHAT_MESSAGE");
        var captured=org.mockito.ArgumentCaptor.forClass(WorldAiBridge.Chat.class);
        verify(bridge).chat(captured.capture());
        assertThat(captured.getValue().userId()).isEqualTo(user);
        assertThat(captured.getValue().text()).isEqualTo("다시 인사해요");
    }

    @Test void detachedBridgeDoesNotReceiveFollowingChats() throws Exception {
        join();var bridge=mock(WorldAiBridge.class);hub.aiBridge(bridge);
        send("WORLD_CHAT_SEND",Map.of("text","첫 인사"));
        verify(bridge).chat(any());
        hub.aiBridge(null);nanos.set(1_000_000_000L);
        assertThat(send("WORLD_CHAT_SEND",Map.of("text","두 번째 인사")).path("type").asText())
                .isEqualTo("WORLD_CHAT_MESSAGE");
        verifyNoMoreInteractions(bridge);
    }

    private String join() throws Exception {
        var session=mock(WebSocketSession.class);when(session.getId()).thenReturn(sessionId);
        doAnswer(invocation->{if(invocation.getArgument(0) instanceof TextMessage text)
            messages.add(mapper.readTree(text.getPayload()));return null;}).when(session).sendMessage(any());
        hub.connect(session);
        var connected=messages.poll(5,TimeUnit.SECONDS);assertThat(connected).isNotNull();
        String user=connected.at("/payload/userId").asText();
        send("CHANNEL_JOIN",Map.of("channelId","one"));
        channels.move(user,new WorldChannelRegistry.Position(0,0,0,0,0));
        messages.clear();return user;
    }

    private JsonNode send(String type,Map<String,String> payload) throws Exception {
        String id=UUID.randomUUID().toString();
        hub.receive(sessionId,mapper.writeValueAsString(Map.of("requestId",id,"type",type,"payload",payload)));
        for(int i=0;i<20;i++){
            var response=messages.poll(5,TimeUnit.SECONDS);assertThat(response).isNotNull();
            if(id.equals(response.path("requestId").asText()))return response;
        }
        throw new AssertionError("Missing request response");
    }
}
