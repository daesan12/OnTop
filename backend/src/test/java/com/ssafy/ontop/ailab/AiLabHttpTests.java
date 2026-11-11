package com.ssafy.ontop.ailab;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import static org.assertj.core.api.Assertions.*;

class AiLabHttpTests {
    @TempDir Path directory;
    @Test void actualHttpAndRawSocketPreserveIsolationAndServerOmokRules() throws Exception {
        try(var context=new SpringApplicationBuilder(AiLabApplication.Config.class).run(
                "--spring.profiles.active=ai-local-lab","--server.address=127.0.0.1","--server.port=0",
                "--spring.flyway.enabled=false","--ai.lab.force-offline=true","--ai.lab.data-dir="+directory)) {
            int port=((ServletWebServerApplicationContext)context).getWebServer().getPort();
            var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
            String root="http://127.0.0.1:"+port;
            var mapper=new ObjectMapper();
            var noHeader=client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/command"))
                    .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}" )).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(noHeader.statusCode()).isEqualTo(403);
            var evil=client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/state"))
                    .header("Origin","https://external.invalid").GET().build(),HttpResponse.BodyHandlers.ofString());
            assertThat(evil.statusCode()).isEqualTo(403);
            for(var action:new String[]{"omokStart","omokSample"}) {
                var response=post(client,root,mapper.writeValueAsString(Map.of("action",action)));
                assertThat(response.statusCode()).isEqualTo(200);
            }
            var illegal=post(client,root,"{\"action\":\"omokMove\",\"x\":7,\"y\":7}");
            assertThat(illegal.statusCode()).isEqualTo(400);
            var first=post(client,root,"{\"action\":\"chat\",\"author\":\"A\",\"scope\":\"world:one\",\"text\":\"씨발\"}");
            assertThat(first.statusCode()).isEqualTo(200);
            post(client,root,"{\"action\":\"flush\"}");
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            String state="";
            do {
                state=client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/state?scope=world:one")).build(),HttpResponse.BodyHandlers.ofString()).body();
                if(mapper.readTree(state).path("messages").size()>0 && mapper.readTree(state).path("messages").get(0).path("processed").asBoolean()) break;
                Thread.sleep(25);
            } while(System.nanoTime()<deadline);
            assertThat(state).contains("씨발").doesNotContain("부적절한 언행으로 가려졌습니다.").doesNotContain("reviewMessages");
            var second=client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/state?scope=world:two")).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(mapper.readTree(second.body()).path("messages")).isEmpty();
            post(client,root,mapper.writeValueAsString(Map.of("action","chat","author","산책자 A","scope","world:two","text","너 나가")));
            post(client,root,mapper.writeValueAsString(Map.of("action","chat","author","산책자 B","scope","world:two","text","왜 시비 걸어")));
            post(client,root,"{\"action\":\"flush\"}");
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            com.fasterxml.jackson.databind.JsonNode admin=null;
            do {
                admin=mapper.readTree(client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/state?scope=world:two&admin=true")).build(),HttpResponse.BodyHandlers.ofString()).body());
                if(admin.path("incidents").size()==2 && admin.path("incidents").get(1).path("policeStatus").asText().equals("DISPATCHED")
                        && admin.path("notices").get(1).path("status").asText().equals("SENT")) break;
                Thread.sleep(25);
            } while(System.nanoTime()<deadline);
            assertThat(admin.path("incidents")).hasSize(2);
            assertThat(admin.path("incidents").get(0).path("kind").asText()).isEqualTo("PROFANITY_RULE");
            assertThat(admin.path("incidents").get(1).path("kind").asText()).isEqualTo("NEGATIVE_SPEECH");
            assertThat(admin.path("incidents").get(1).path("policeStatus").asText()).isEqualTo("DISPATCHED");
            assertThat(admin.path("notices")).hasSize(2);
            assertThat(admin.path("notices").get(1).path("status").asText()).isEqualTo("SENT");
            assertThat(admin.path("messages")).allMatch(m -> !m.path("hidden").asBoolean());
            var received=new CompletableFuture<String>(); var chunks=new StringBuilder();
            var ws=client.newWebSocketBuilder().header("Origin","http://127.0.0.1:5210")
                    .buildAsync(URI.create("ws://127.0.0.1:"+port+"/dev/ai/ws?scope=world%3Aone"),new WebSocket.Listener() {
                        public void onOpen(WebSocket socket) { socket.request(1); }
                        public CompletionStage<?> onText(WebSocket socket,CharSequence text,boolean last) {
                            chunks.append(text); if(last) received.complete(chunks.toString()); socket.request(1); return null;
                        }
                    }).get(5,TimeUnit.SECONDS);
            assertThat(received.get(5,TimeUnit.SECONDS)).contains("씨발").doesNotContain("부적절한 언행으로 가려졌습니다.");
            ws.sendClose(WebSocket.NORMAL_CLOSURE,"done").get(2,TimeUnit.SECONDS);
        }
    }
    private static HttpResponse<String> post(HttpClient client,String root,String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(root+"/dev/ai/command")).header("X-Ai-Lab","local")
                .header("Content-Type","application/json").timeout(Duration.ofSeconds(5)).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
}
