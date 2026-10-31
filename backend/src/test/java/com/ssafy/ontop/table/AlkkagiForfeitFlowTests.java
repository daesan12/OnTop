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
        return connect(user,"LOBBY");
    }
    ScenarioClient connect(long user,String status) throws Exception {
        try(var http=HttpClient.newHttpClient()) {
            var response=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/auth/websocket-ticket"))
                .header("Authorization","Bearer "+jwt.issue(user,TestLoginSessions.ID)).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client=new ScenarioClient(port,""+user,mapper.readTree(response.body()).path("ticket").asText());
            client.state(status);
            assertThat(client.request("CHANNEL_JOIN",Map.of("channelId","one")).path("type").asText()).isEqualTo("CHANNEL_STATE");
            positions.move(""+user,new WorldChannelRegistry.Position(1,0,.8,0,0));return client;
        }
    }
    @Test void 진행중_새연결도_보존된좌석의채널로만_복귀하고_기권퇴장한다() throws Exception {
        try(var red=connect(101);var green=connect(202)) {
            var seat=red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("TABLE_CONFIGURE",Map.of("gameCode","ALKKAGI","selectedPlayers",2,"betAmountPerPlayer",1,"expectedVersion",seat.at("/payload/version").asLong()));
            green.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("READY_SET",Map.of("ready",true));green.request("READY_SET",Map.of("ready",true));
            var ready=red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("TABLE_START",Map.of("actionId","refresh-start","expectedVersion",ready.at("/payload/version").asLong()));
            String game=red.state("RESTORED").path("gameId").asText();green.state("RESTORED");
            red.close();
            try(var resumed=connect(101,"RESTORED")) {
                assertThat(resumed.request("CHANNEL_JOIN",Map.of("channelId","other")).at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
                assertThat(resumed.request("GAME_STATE_CHECK",Map.of("gameId",game)).at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
                assertThat(resumed.request("GAME_FORFEIT",Map.of("gameId",game,"actionId","refresh-forfeit")).path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
                green.state("FINISHED");
                assertThat(resumed.request("TABLE_LEAVE",Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
                assertThat(green.request("TABLE_LEAVE",Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            }
        }
    }
    @Test void 방장기권_이후_상대퇴장_재착석과_다음판을_시작한다() throws Exception {
        try(var red=connect(101);var green=connect(202)) {
            var firstSeat=red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("TABLE_CONFIGURE",Map.of("gameCode","ALKKAGI","selectedPlayers",2,"betAmountPerPlayer",1,"expectedVersion",firstSeat.at("/payload/version").asLong()));
            green.request("TABLE_JOIN",Map.of("tableId",TABLE));red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("READY_SET",Map.of("ready",true));green.request("READY_SET",Map.of("ready",true));
            var ready=red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("TABLE_START",Map.of("actionId","first-start","expectedVersion",ready.at("/payload/version").asLong()));
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
            assertThat(accepted.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
            assertThat(ended.at("/payload/state/publicState/winnerUserId").asText()).isEqualTo("202");
            assertThat(result.path("type").asText()).isEqualTo("GAME_RESULT");
            assertThat(result.at("/payload/settlementStatus").asText()).isEqualTo("SETTLED");
            assertThat(waiting.at("/payload/phase").asText()).isEqualTo("WAITING");
            assertThat(left.path("type").asText()).isEqualTo("TABLE_LEFT");
            var redLeft=red.request("TABLE_LEAVE",Map.of());
            assertThat(redLeft.path("type").asText()).isEqualTo("TABLE_LEFT");
            var rejoined=green.request("TABLE_JOIN",Map.of("tableId",TABLE));
            red.request("TABLE_JOIN",Map.of("tableId",TABLE));
            var configVersion=green.request("TABLE_JOIN",Map.of("tableId",TABLE)).at("/payload/version").asLong();
            var configured=green.request("TABLE_CONFIGURE",Map.of("gameCode","ALKKAGI","selectedPlayers",2,"betAmountPerPlayer",1,"expectedVersion",configVersion));
            assertThat(configured.at("/payload/selectorUserId").asText()).isEqualTo("202");
            red.request("READY_SET",Map.of("ready",true));green.request("READY_SET",Map.of("ready",true));
            var nextReady=green.request("TABLE_JOIN",Map.of("tableId",TABLE));
            var nextStart=green.request("TABLE_START",Map.of("actionId","next-start","expectedVersion",nextReady.at("/payload/version").asLong()));
            var nextRecovery=green.state("RESTORED");red.state("RESTORED");
            String nextId=nextRecovery.path("gameId").asText();
            assertThat(nextId).isNotBlank().isNotEqualTo(game);
            var next=green.request("GAME_STATE_CHECK",Map.of("gameId",nextId));
            var nextStartState=green.request("GAME_START_CHECK",Map.of());
            assertThat(next.at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
            assertThat(next.at("/payload/publicState/pieces")).hasSize(32);
            assertThat(next.at("/payload/publicState/walls")).isEmpty();
            assertThat(next.at("/payload/privateState/cards")).isEmpty();
            var shooter=next.at("/payload/publicState/turnUserId").asText().equals("202")?green:red;
            var shot=shooter.request("GAME_ACTION_SEND",Map.of("gameId",nextId,"actionId","next-shot","expectedVersion",next.at("/payload/version").asLong(),
                    "input",Map.of("type","SHOT","pieceId","p0","dx",0,"dy",1,"power",.001)));
            assertThat(shot.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            var advanced=green.request("GAME_STATE_CHECK",Map.of("gameId",nextId));
            assertThat(advanced.at("/payload/publicState/simulationId").asLong()).isEqualTo(1);
            var output=new java.util.LinkedHashMap<String,Object>(Map.of("initial",initial,"initialStart",initialStart,"accepted",accepted,"ended",ended,"debris",debris,
                    "result",result,"waiting",waiting,"left",left,"trace",frames));
            output.put("rejoined",rejoined);output.put("configured",configured);output.put("nextStart",nextStartState);output.put("nextGame",next);
            output.put("nextRecovery",nextRecovery);output.put("nextShot",shot);output.put("advanced",advanced);
            java.nio.file.Files.writeString(java.nio.file.Path.of("build/alkkagi-forfeit-frames.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(output));
            shooter.request("GAME_FORFEIT",Map.of("gameId",nextId,"actionId","next-cleanup"));
            red.request("TABLE_LEAVE",Map.of());green.request("TABLE_LEAVE",Map.of());
        }
    }
}
