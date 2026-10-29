package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.bridge.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=bridge", "ontop.world.channels[0].name=다리테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class,OmokFlowTests.Fixture.class})
@DirtiesContext
class BridgeFlowTests {
    private static final String TABLE="table-"+UUID.nameUUIDFromBytes("bridge\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private BridgeEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;
    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn=com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables["+TABLE+"].x",() -> spawn.x);
        properties.add("ontop.world.proximity.tables["+TABLE+"].z",() -> spawn.z);
    }

    @Test
    void 실제소켓에서비밀눈격리_선언_판단_재접속_자동넘김_종료를연결한다() throws Exception {
        engine.create("bridge",TABLE,List.of(101L,202L));
        try (ScenarioClient one=connect("naver","RESTORED"); ScenarioClient two=connect("ssafy","RESTORED");
                ScenarioClient viewer=connect("spectator","LOBBY")) {
            viewer.request("CHANNEL_JOIN",Map.of("channelId","bridge"));
            viewer.request("WORLD_MOVE",Map.of("seq",1,"dx",0,"dz",0,"run",false));
            var watch=viewer.request("GAME_WATCH",Map.of("gameId","bridge")).path("payload");
            assertThat(watch.path("privateState").isEmpty()).isTrue();
            long actor=Long.parseLong(watch.path("publicState").path("turnUserId").asText());
            ScenarioClient owner=actor==101 ? one : two;
            ScenarioClient judge=actor==101 ? two : one;
            long judgeId=actor==101 ? 202 : 101;
            var roll=Map.of("gameId","bridge","actionId","roll","expectedVersion",0,"input",Map.of("kind","roll"));
            assertThat(owner.request("GAME_ACTION_SEND",roll).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            assertThat(owner.request("GAME_ACTION_SEND",roll).path("payload").path("version").asLong()).isEqualTo(1);
            var secret=owner.request("GAME_STATE_CHECK",Map.of("gameId","bridge")).path("payload");
            assertThat(secret.path("privateState").has("die")).isTrue();
            assertThat(judge.await(message -> version(message,1)).path("payload").path("privateState").isEmpty()).isTrue();
            var publicRoll=viewer.await(message -> version(message,1)).path("payload");
            assertThat(publicRoll.path("privateState").isEmpty()).isTrue();
            assertThat(publicRoll.path("publicState").toString()).doesNotContain("actualFace","\"die\"","\"face\"");
            owner.stopPong(); assertThat(owner.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned=connect(actor==101 ? "naver" : "ssafy","RESTORED")) {
                var recovered=returned.request("GAME_STATE_CHECK",Map.of("gameId","bridge")).path("payload");
                assertThat(recovered.path("privateState").toString()).isEqualTo(secret.path("privateState").toString());
                assertThat(recovered.path("publicState").path("turnDeadline")).isEqualTo(secret.path("publicState").path("turnDeadline"));
                returned.request("GAME_ACTION_SEND",Map.of("gameId","bridge","actionId","claim","expectedVersion",1,
                        "input",Map.of("kind","declare","value",4)));
                assertThat(judge.await(message -> version(message,2)).path("payload").path("publicState").path("responderUserId").asText())
                        .isEqualTo(Long.toString(judgeId));
                clock.advanceSeconds(30);
                var trusted=returned.await(message -> version(message,3)).path("payload");
                assertThat(trusted.path("publicState").path("resolution").path("challenged").asBoolean()).isFalse();
                assertThat(trusted.path("publicState").path("resolution").has("actualFace")).isFalse();
                assertThat(trusted.path("privateState").isEmpty()).isTrue();
                assertThat(viewer.await(message -> version(message,3)).path("payload").path("privateState").isEmpty()).isTrue();
                clock.advanceSeconds(2);
                var next=returned.await(message -> version(message,4)).path("payload");
                assertThat(next.path("publicState").path("turnUserId").asText()).isEqualTo(Long.toString(judgeId));
                judge.request("GAME_ACTION_SEND",Map.of("gameId","bridge","actionId","roll2","expectedVersion",4,"input",Map.of("kind","roll")));
                var face=judge.request("GAME_STATE_CHECK",Map.of("gameId","bridge")).path("payload").path("privateState").path("die");
                judge.request("GAME_ACTION_SEND",Map.of("gameId","bridge","actionId","claim2","expectedVersion",5,"input",Map.of("kind","declare","value",4)));
                returned.request("GAME_ACTION_SEND",Map.of("gameId","bridge","actionId","doubt","expectedVersion",6,"input",Map.of("kind","doubt")));
                var reveal=viewer.await(message -> version(message,7)).path("payload");
                assertThat(reveal.path("publicState").path("resolution").path("actualFace")).isEqualTo(face);
                assertThat(reveal.path("privateState").isEmpty()).isTrue();
                var at=clock.instant();
                engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),judgeId,"bridge",at.minusSeconds(30),at,
                        GameRecoveryGateway.Action.FORFEIT));
                var ended=returned.await(message -> version(message,8)).path("payload").path("publicState");
                assertThat(ended.path("status").asText()).isEqualTo("FINISHED");
                assertThat(ended.path("winnerUserIds").get(0).asText()).isEqualTo(Long.toString(actor));
            }
        }
        System.out.println("[PASS] 다리 실제엔진/SecureRandom/RawWS: 본인눈격리·모두믿음비공개·다우트공개·heartbeat복귀·30초판단넘김·서버기권종료. 인증/시작은대역·제어시계,DB/지급아님.");
    }
    private ScenarioClient connect(String login,String status) throws Exception {
        var client=new ScenarioClient(port,login); client.state(status); return client;
    }
    private boolean version(JsonNode message,long value) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("payload").path("version").asLong()==value;
    }
}
