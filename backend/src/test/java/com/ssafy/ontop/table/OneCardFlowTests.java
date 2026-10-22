package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
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
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.onecard.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=cards", "ontop.world.channels[0].name=카드테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class,OmokFlowTests.Fixture.class})
@DirtiesContext
class OneCardFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("cards\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private OneCardEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;
    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn = com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables["+TABLE+"].x",() -> spawn.x);
        properties.add("ontop.world.proximity.tables["+TABLE+"].z",() -> spawn.z);
    }

    @Test
    void 실제소켓_개인손패격리_뽑기_중복_관전_복귀_30초넘김_기권종료를검증한다() throws Exception {
        engine.create("one",TABLE,List.of(101L,202L));
        try (ScenarioClient one=connect("naver","RESTORED"); ScenarioClient two=connect("ssafy","RESTORED");
                ScenarioClient viewer=connect("spectator","LOBBY")) {
            viewer.request("CHANNEL_JOIN",Map.of("channelId","cards"));
            viewer.request("WORLD_MOVE",Map.of("seq",1,"dx",0,"dz",0,"run",false));
            JsonNode watch=viewer.request("GAME_WATCH",Map.of("gameId","one"));
            assertThat(watch.path("payload").path("privateState").isEmpty()).isTrue();
            var before=engine.load(101,"one").orElseThrow();
            String actorId=before.publicState().path("turnUserId").asText();
            ScenarioClient actor=actorId.equals("101") ? one : two;
            var request=Map.of("gameId","one","actionId","draw-one","expectedVersion",0,
                    "input",Map.of("kind","draw"));
            assertThat(actor.request("GAME_ACTION_SEND",request).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            assertThat(actor.request("GAME_ACTION_SEND",request).path("payload").path("version").asLong()).isEqualTo(1);
            JsonNode opponent=(actor==one ? two : one).await(message -> version(message,1));
            assertThat(opponent.path("payload").path("privateState").path("hand").size()).isEqualTo(7);
            JsonNode publicNotice=viewer.await(message -> version(message,1));
            assertThat(publicNotice.path("payload").path("privateState").isEmpty()).isTrue();
            assertThat(publicNotice.path("payload").path("publicState").has("hand")).isFalse();
            var expected=engine.load(202,"one").orElseThrow();
            two.stopPong();
            assertThat(two.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned=connect("ssafy","RESTORED")) {
                JsonNode restored=returned.request("GAME_STATE_CHECK",Map.of("gameId","one")).path("payload");
                assertThat(restored.path("privateState").toString()).isEqualTo(expected.privateState().toString());
                assertThat(restored.path("publicState").toString()).isEqualTo(expected.publicState().toString());
                clock.advanceSeconds(30);
                JsonNode timed=returned.await(message -> version(message,2));
                assertThat(timed.path("payload").path("publicState").path("status").asText()).isEqualTo("PLAYING");
                assertThat(timed.path("payload").path("publicState").path("turnUserId").asText()).isEqualTo(actorId);
                assertThat(viewer.await(message -> version(message,2)).path("payload").path("privateState").isEmpty()).isTrue();
                var at=clock.instant();
                engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),202,"one",at.minusSeconds(30),at,
                        GameRecoveryGateway.Action.FORFEIT));
                long version=engine.load(101,"one").orElseThrow().version();
                JsonNode ended=one.await(message -> version(message,version)).path("payload").path("publicState");
                assertThat(ended.path("status").asText()).isEqualTo("FINISHED");
                assertThat(ended.path("winnerUserIds").get(0).asText()).isEqualTo("101");
                assertThat(viewer.await(message -> version(message,version)).path("payload").path("privateState").isEmpty()).isTrue();
                assertThat(returned.request("GAME_ACTION_SEND",Map.of("gameId","one","actionId","late","expectedVersion",version,
                        "input",Map.of("kind","draw"))).path("payload").path("code").asText()).isEqualTo("GAME_ACTION_INVALID_ACTION");
            }
        }
        System.out.println("[PASS] 원카드 실제엔진/SecureRandom/RawWS: 본인손패격리·뽑기·중복·20m관전·heartbeat복귀·30초자동넘김·기권종료. 인증/시작은대역,기권은서버명령,시간은제어시계,DB/지급아님.");
    }
    private ScenarioClient connect(String login,String status) throws Exception {
        var client=new ScenarioClient(port,login); client.state(status); return client;
    }
    private boolean version(JsonNode message,long value) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("payload").path("version").asLong()==value;
    }
}
