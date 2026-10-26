package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.movement.GeneratedParkMap;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("park-map")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.profiles.active=local","ontop.websocket.authenticated=true",
    "ontop.world.channels[0].channel-id=park-contract","ontop.world.channels[0].name=계약 검증","ontop.world.channels[0].capacity=4",
    "ontop.auth.allowed-origins=http://127.0.0.1:5203",
    "ontop.world.movement.minimum-interval=1ns"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GeneratedParkIntegrationTests {
    @LocalServerPort int port;
    @Autowired WorldChannelRegistry channels;
    @Autowired TableHub hub;
    private final ObjectMapper mapper=new ObjectMapper();
    private final GeneratedParkMap map=GeneratedParkMap.current();
    private ScenarioClient connect() throws Exception {
        return new ScenarioClient(port,"naver",null,"http://127.0.0.1:5203","127.0.0.1:"+port);
    }
    private void join(ScenarioClient client) throws Exception {
        assertThat(client.await(m->m.path("type").asText().equals("CONNECTED")).path("payload").path("map"))
            .isEqualTo(mapper.valueToTree(map.identity()));
        assertThat(client.request("CHANNEL_JOIN",Map.of("channelId","park-contract","map",map.identity())).path("type").asText()).isEqualTo("CHANNEL_STATE");
    }
    @Test void 입장과_복구_전에_버전을_검사하고_서버_실제정보를_반환한다() throws Exception {
        try(var client=connect()) {
            client.await(m->m.path("type").asText().equals("CONNECTED"));
            for(String type:new String[]{"CHANNEL_JOIN","GAME_RECONNECT_CHECK"}) {
                var payload=type.equals("CHANNEL_JOIN")?Map.<String,Object>of("channelId","park-contract","map",Map.of("mapId","park","schemaVersion",2,"mapVersion","a".repeat(64))):Map.<String,Object>of();
                var response=client.request(type,payload);
                assertThat(response.path("payload").path("code").asText()).isEqualTo("MAP_VERSION_MISMATCH");
                assertThat(response.path("payload").path("map")).isEqualTo(mapper.valueToTree(map.identity()));
                assertThat(channels.positionOf("101")).isNull();
            }
        }
    }
    @Test void 기존테이블ID를_생성좌표에_연결하고_관전20m와_좌석을_검증한다() throws Exception {
        var t=map.table("table-1");double x=t.path("position").get(0).asDouble(),z=t.path("position").get(2).asDouble();
        String id=GeneratedParkMap.serverTableId("park-contract","table-1");
        try(var client=connect()) {
            join(client);
            assertThat(hub.listTables("park-contract").bindings()).contains(Map.of("channelId","park-contract","tableId",id,"anchorId","table-1"));
            channels.holdFacility("101",new WorldFacilityService.Pose(x+20,.84,z,0));
            assertThat(client.request("TABLE_WATCH",Map.of("tableId",id)).path("type").asText()).isEqualTo("TABLE_WATCH_STATE");
            client.request("TABLE_UNWATCH",Map.of());
            channels.holdFacility("101",new WorldFacilityService.Pose(x+20.01,.84,z,0));
            assertThat(client.request("TABLE_WATCH",Map.of("tableId",id)).path("payload").path("code").asText()).isEqualTo("TABLE_OUT_OF_RANGE");
            channels.releaseFacility("101",new WorldFacilityService.Pose(x,.84,z+3,0));
            assertThat(client.request("TABLE_JOIN",Map.of("tableId",id)).path("type").asText()).isEqualTo("TABLE_STATE");
            var pose=channels.positionOf("101");var seat=t.path("seatAnchors").get(0);
            assertThat(pose.x()).isCloseTo(x+seat.get(0).asDouble(),org.assertj.core.data.Offset.offset(.001));
            assertThat(pose.z()).isCloseTo(z+seat.get(2).asDouble(),org.assertj.core.data.Offset.offset(.001));
            client.request("TABLE_LEAVE",Map.of());
        }
    }
    @Test void 생성장애물과_지형을_실제Java캡슐로_충돌검사한다() {
        JsonNode mailbox=map.data().path("interactions").path("mailbox").path("position");
        double x=mailbox.get(0).asDouble(),z=mailbox.get(2).asDouble();
        try(var physics=new WorldPhysics()) {
            physics.add("probe");physics.place("probe",x,.84,z+4);
            long tick=0;
            for(int n=1;n<=75;n++) {
                physics.input("probe",new com.ssafy.ontop.world.movement.MoveInput(n,0,-1,false,false),tick*WorldPhysics.STEP_NANOS);
                physics.step(++tick*WorldPhysics.STEP_NANOS,java.util.Set.of());
            }
            assertThat(physics.snapshot("probe").z()).isGreaterThan(z+.65).isLessThan(z+1.6);
        }
    }
    @Test void 생성스폰과_호수수영을_실제물리에서_검증한다() {
        try(var physics=new WorldPhysics()) {
            physics.add("probe");var spawn=map.data().path("physics").path("spawn").path("position");
            assertThat(physics.snapshot("probe").y()).isCloseTo(spawn.get(1).asDouble(),org.assertj.core.data.Offset.offset(.001));
            assertThat(physics.snapshot("probe").z()).isCloseTo(spawn.get(2).asDouble(),org.assertj.core.data.Offset.offset(.001));
            var lake=map.data().path("surfaces").path("lake");
            physics.place("probe",lake.path("x").asDouble(),lake.path("surfaceY").asDouble()-.1,lake.path("z").asDouble());
            for(int n=1;n<=10;n++)physics.step(n*WorldPhysics.STEP_NANOS,java.util.Set.of());
            assertThat(physics.snapshot("probe").swimming()).isTrue();
            assertThat(physics.snapshot("probe").y()).isBetween(-.5,.45);
        }
    }
    @Test @EnabledIfEnvironmentVariable(named="PARK_LIVE_BROWSER",matches="true")
    void 실제FE화면과_JavaWebSocket을_연결한다() throws Exception {
        var info=Path.of("build/park-live-info.json").toAbsolutePath();Files.createDirectories(info.getParent());
        mapper.writeValue(info.toFile(),Map.of("map",map.identity(),"data",map.data(),"tables",hub.listTables("park-contract")));
        var process=new ProcessBuilder("node","node_modules/@playwright/test/cli.js","test","--config","playwright.park-live.config.ts")
            .directory(Path.of("../frontend").toFile()).redirectErrorStream(true).redirectOutput(Path.of("build/park-live-browser.log").toFile());
        process.environment().put("PARK_JAVA_PORT",Integer.toString(port));
        process.environment().put("PARK_JAVA_INFO",info.toString());
        var child=process.start();
        try {
            assertThat(child.waitFor(110,java.util.concurrent.TimeUnit.SECONDS)).as("browser timeout").isTrue();
            assertThat(child.exitValue()).as(Files.readString(Path.of("build/park-live-browser.log"))).isZero();
        } finally {if(child.isAlive())child.destroyForcibly();}
    }
}
