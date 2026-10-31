package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.demo.AlkkagiParkApplication;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.assertThat;

/** 실제 인증 티켓·소켓·시작·엔진·관전 경계. 예약/정산은 격리 메모리 대역. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "spring.profiles.active=local,frontend-test,alkkagi-park", "ontop.websocket.authenticated=true",
    "ontop.game-start.enabled=true", "ontop.games.alkkagi.enabled=true", "server.address=127.0.0.1",
    "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
    "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=관전검수", "ontop.world.channels[0].capacity=8"
})
@Import({AlkkagiParkApplication.Fixture.class,FrozenWorldFixture.class})
class AlkkagiForfeitFlowTests {
    static final String TABLE="table-"+UUID.nameUUIDFromBytes("one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @Autowired ObjectMapper mapper;
    @Autowired WorldChannelRegistry positions;
    @DynamicPropertySource static void locations(DynamicPropertyRegistry r) {
        r.add("ontop.world.proximity.tables["+TABLE+"].x",()->0);
        r.add("ontop.world.proximity.tables["+TABLE+"].z",()->0);
    }
    ScenarioClient connect(long user) throws Exception {
        try(var http=HttpClient.newHttpClient()) {
            var response=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/auth/websocket-ticket"))
                .header("Authorization","Bearer "+jwt.issue(user,TestLoginSessions.ID)).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client=new ScenarioClient(port,""+user,mapper.readTree(response.body()).path("ticket").asText());
            client.state("LOBBY");client.request("CHANNEL_JOIN",Map.of("channelId","one"));
            positions.move(""+user,new WorldChannelRegistry.Position(1,0,.8,0,0));return client;
        }
    }
    @Test void 방장기권_이후_상대도_종료정산과_대기실을_받고_퇴장한다() throws Exception {
        try(var red=connect(101);var green=connect(202)) {
            red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("GAME_SELECT",Map.of("gameCode","ALKKAGI","betAmountPerPlayer",1));
            green.request("TABLE_JOIN",Map.of("tableId",TABLE));red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("READY_SET",Map.of("ready",true));green.request("READY_SET",Map.of("ready",true));
            String game=red.state("RESTORED").path("gameId").asText();green.state("RESTORED");
            var initial=green.request("GAME_STATE_CHECK",Map.of("gameId",game));
            var initialStart=green.request("GAME_START_CHECK",Map.of());
            var accepted=red.request("GAME_FORFEIT",Map.of("gameId",game,"actionId","red-forfeit"));
            var terminal=new java.util.concurrent.atomic.AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
            var scattered=new java.util.concurrent.atomic.AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
            var frames=new java.util.ArrayList<com.fasterxml.jackson.databind.JsonNode>();
            try {green.await(m->{
                frames.add(m);
                if(m.path("type").asText().equals("WORLD_PARK_DEBRIS_STATE")&&m.at("/payload/items").size()>0)scattered.set(m);
                if(m.path("type").asText().equals("GAME_CONNECTION_STATE")&&m.at("/payload/status").asText().equals("FINISHED"))terminal.set(m);
                return terminal.get()!=null&&scattered.get()!=null;
            });}finally{java.nio.file.Files.writeString(java.nio.file.Path.of("build/alkkagi-forfeit-trace.json"),mapper.writeValueAsString(frames));}
            var debris=scattered.get();var ended=terminal.get();
            var result=green.request("GAME_RESULT_CHECK",Map.of("gameSessionId",game));
            var waiting=green.request("GAME_START_CHECK",Map.of());
            var left=green.request("TABLE_LEAVE",Map.of());
            java.nio.file.Files.writeString(java.nio.file.Path.of("build/alkkagi-forfeit-frames.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                    "initial",initial,"initialStart",initialStart,"accepted",accepted,"ended",ended,"debris",debris,"result",result,"waiting",waiting,"left",left,"trace",frames)));
            assertThat(accepted.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            assertThat(ended.at("/payload/state/publicState/winnerUserId").asText()).isEqualTo("202");
            assertThat(result.path("type").asText()).isEqualTo("GAME_RESULT");
            assertThat(result.at("/payload/settlementStatus").asText()).isEqualTo("SETTLED");
            assertThat(waiting.at("/payload/phase").asText()).isEqualTo("WAITING");
            assertThat(left.path("type").asText()).isEqualTo("TABLE_LEFT");
        }
    }
}
