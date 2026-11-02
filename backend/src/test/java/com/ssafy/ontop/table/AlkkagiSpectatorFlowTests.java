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
class AlkkagiSpectatorFlowTests {
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
    @Test void 관전버튼연결만으로_커서훈수전달_플레이어와미관전자차단_물리불변() throws Exception {
        try(var a=connect(101);var b=connect(202);var v=connect(505)) {
            a.request("TABLE_JOIN",Map.of("tableId",TABLE));
            a.request("GAME_SELECT",Map.of("gameCode","ALKKAGI","betAmountPerPlayer",1));
            b.request("TABLE_JOIN",Map.of("tableId",TABLE));
            a.request("TABLE_JOIN",Map.of("tableId",TABLE));
            a.request("READY_SET",Map.of("ready",true));b.request("READY_SET",Map.of("ready",true));
            String game=a.state("RESTORED").path("gameId").asText();b.state("RESTORED");
            var before=a.request("GAME_STATE_CHECK",Map.of("gameId",game)).path("payload");
            long version=before.path("version").asLong();
            var cursor=Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"kind","CURSOR","basedOnVersion",version,"x",0,"y",0);
            assertThat(v.request("ALKKAGI_SPECTATOR_SEND",cursor).at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(a.request("ALKKAGI_SPECTATOR_SEND",cursor).at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            var watch=v.request("GAME_WATCH",Map.of("gameId",game));
            assertThat(watch.at("/payload/privateState").isEmpty()).isTrue();
            var ack=v.request("ALKKAGI_SPECTATOR_SEND",cursor);
            assertThat(ack.path("type").asText()).isEqualTo("ALKKAGI_SPECTATOR_EVENT");
            for(var p:List.of(a,b)) assertThat(p.await(m->m.path("type").asText().equals("ALKKAGI_SPECTATOR_EVENT")).path("payload")).isEqualTo(ack.path("payload"));
            var advice=Map.of("gameId",game,"eventId",UUID.randomUUID().toString(),"kind","ADVICE","basedOnVersion",version,"pieceId","p0","dx",1,"dy",0,"power",.5);
            assertThat(v.request("ALKKAGI_SPECTATOR_SEND",advice).path("type").asText()).isEqualTo("ALKKAGI_SPECTATOR_EVENT");
            var after=a.request("GAME_STATE_CHECK",Map.of("gameId",game)).path("payload");
            assertThat(after.path("version")).isEqualTo(before.path("version"));
            for (String field : List.of("pieces","turnNumber","simulationId")) assertThat(after.path("publicState").path(field)).isEqualTo(before.path("publicState").path(field));
            assertThat(v.request("GAME_UNWATCH",Map.of()).path("type").asText()).isNotEqualTo("ERROR");
            assertThat(v.request("ALKKAGI_SPECTATOR_SEND",cursor).at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        }
    }
}
