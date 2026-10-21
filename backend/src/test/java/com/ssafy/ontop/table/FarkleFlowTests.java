package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.farkle.domain.FarkleScoring;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.farkle.enabled=true",
        "ontop.games.omok.enabled=true", "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=dice", "ontop.world.channels[0].name=주사위테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class FarkleFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("dice\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private FarkleEngine engine;
    @Autowired private OmokEngine omok;
    @Autowired private OmokFlowTests.TestClock clock;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn = com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> spawn.x);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> spawn.z);
    }

    @Test
    void 실제소켓에서_굴림_관전_복귀_저장_승리후오목전환까지검증한다() throws Exception {
        engine.create("dice", TABLE, List.of(101L,202L), 2000);
        try (ScenarioClient one = connect("naver","RESTORED");
                ScenarioClient two = connect("ssafy","RESTORED");
                ScenarioClient viewer = connect("spectator","LOBBY")) {
            viewer.request("CHANNEL_JOIN",Map.of("channelId","dice"));
            viewer.request("WORLD_MOVE",Map.of("seq",1,"dx",0,"dz",0,"run",false));
            assertThat(viewer.request("GAME_WATCH",Map.of("gameId","dice"))
                    .path("payload").path("privateState").isEmpty()).isTrue();
            JsonNode initial = engine.load(101,"dice").orElseThrow().publicState();
            ScenarioClient first = initial.path("turnUserId").asText().equals("101") ? one : two;
            var roll = action("first",0,"roll",List.of());
            assertThat(first.request("GAME_ACTION_SEND",roll).path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            JsonNode rolled = viewer.await(message -> version(message,1));
            assertThat(rolled.path("payload").path("publicState").path("gameCode").asText()).isEqualTo("DICE");
            assertThat(first.request("GAME_ACTION_SEND",roll).path("payload").path("version").asLong()).isEqualTo(1);
            JsonNode before = engine.load(101).orElseThrow().state();
            two.stopPong();
            assertThat(two.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = connect("ssafy","RESTORED")) {
                assertThat(returned.request("GAME_STATE_CHECK",Map.of("gameId","dice"))
                        .path("payload").path("publicState").toString()).isEqualTo(before.toString());
                // 실제 SecureRandom을 사용한다. 매 굴림의 공개 결과에서 최선의 합법 선택만 계산한다.
                for (int step = 0; step < 500; step++) {
                    var state = engine.load(101,"dice").orElseThrow();
                    JsonNode data = state.publicState();
                    if (data.path("status").asText().equals("FINISHED")) { break; }
                    ScenarioClient actor = data.path("turnUserId").asText().equals("101") ? one : returned;
                    List<Integer> selected = bestSelection(data.path("dice"));
                    String kind = data.path("stage").asText().equals("AWAITING_ROLL") ? "roll" : "bank";
                    assertThat(actor.request("GAME_ACTION_SEND",action("step-"+step,state.version(),kind,selected))
                            .path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
                }
                var end = engine.load(101,"dice").orElseThrow();
                assertThat(end.publicState().path("status").asText()).isEqualTo("FINISHED");
                JsonNode delivered = viewer.await(message -> version(message,end.version()));
                assertThat(delivered.path("payload").path("publicState").path("endReason").asText()).isEqualTo("TARGET_REACHED");
                returned.sendRequest("GAME_RECONNECT_CHECK",Map.of());
                returned.state("FINISHED");
                omok.create("after-dice",TABLE,101,202);
                returned.sendRequest("GAME_RECONNECT_CHECK",Map.of());
                assertThat(returned.state("RESTORED").path("state").path("gameCode").asText()).isEqualTo("OMOK");
            }
        }
        System.out.println("[PASS] 실제 주사위 엔진/SecureRandom/Raw WS: 굴림·중복·20m관전·heartbeat복귀·목표승리·오목전환. 인증/시작은 테스트 대역, DB/지급 아님.");
    }

    @Test
    void 입력없이도_30초타이머가_전원에게차례넘김을전송한다() throws Exception {
        engine.create("dice",TABLE,List.of(101L,202L),2000);
        try (ScenarioClient one = connect("naver","RESTORED"); ScenarioClient two = connect("ssafy","RESTORED")) {
            String first = engine.load(101,"dice").orElseThrow().publicState().path("turnUserId").asText();
            clock.advanceSeconds(30);
            JsonNode data = one.await(message -> version(message,1)).path("payload").path("publicState");
            assertThat(data.path("status").asText()).isEqualTo("PLAYING");
            assertThat(data.path("lastEvent").asText()).isEqualTo("TURN_TIMEOUT");
            assertThat(data.path("turnUserId").asText()).isNotEqualTo(first);
            assertThat(two.await(message -> version(message,1)).path("payload").path("publicState")).isEqualTo(data);
        }
        System.out.println("[PASS] 제어시계30초 + 실제 scheduler → 자동 차례넘김·참가자 상태전송 (시간패 아님)");
    }

    private List<Integer> bestSelection(JsonNode dice) {
        int best = 0;
        List<Integer> result = List.of();
        for (int mask = 1; mask < 64; mask++) {
            List<Integer> ids = new ArrayList<>();
            List<Integer> faces = new ArrayList<>();
            for (JsonNode die : dice) {
                if (!die.path("held").asBoolean() && (mask & (1 << die.path("id").asInt())) != 0) {
                    ids.add(die.path("id").asInt()); faces.add(die.path("value").asInt());
                }
            }
            int score = FarkleScoring.score(faces.stream().mapToInt(Integer::intValue).toArray());
            if (score > best) { best = score; result = List.copyOf(ids); }
        }
        return result;
    }

    private ScenarioClient connect(String login,String status) throws Exception {
        ScenarioClient client = new ScenarioClient(port,login); client.state(status); return client;
    }
    private Map<String,Object> action(String id,long version,String kind,List<Integer> selected) {
        return Map.of("gameId","dice","actionId",id,"expectedVersion",version,"input",Map.of("kind",kind,"selectedIds",selected));
    }
    private boolean version(JsonNode message,long value) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("payload").path("version").asLong() == value;
    }
}
