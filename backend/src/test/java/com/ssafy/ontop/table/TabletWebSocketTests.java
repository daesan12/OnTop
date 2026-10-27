package com.ssafy.ontop.table;
import static org.assertj.core.api.Assertions.*;
import java.util.Map;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldClock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.profiles.active=local","ontop.websocket.authenticated=true"})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class TabletWebSocketTests {
    @LocalServerPort int port; @Autowired TableHub hub;
    @Test void 실제인증소켓에서_태블릿설정_준비_재접속_만료를_전달한다() throws Exception {
        var clock=new TabletStartFlowTests.MutableClock();hub.configureWorldClock(new WorldClock(clock));
        try(var a=new ScenarioClient(port,"naver"); var b=new ScenarioClient(port,"ssafy")){
            a.request("TABLE_JOIN",Map.of("tableId","table-1"));b.request("TABLE_JOIN",Map.of("tableId","table-1"));
            var state=a.request("TABLE_JOIN",Map.of("tableId","table-1")).path("payload");
            state=a.request("TABLE_CONFIGURE",Map.of("gameCode","OMOK","selectedPlayers",2,"betAmountPerPlayer",1,"expectedVersion",state.path("version").asLong())).path("payload");
            state=a.request("READY_SET",Map.of("ready",true,"betAmountPerPlayer",1,"expectedVersion",state.path("version").asLong())).path("payload");
            b.request("READY_SET",Map.of("ready",true,"betAmountPerPlayer",1,"expectedVersion",state.path("version").asLong()));
            var wait=a.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload");
            assertThat(wait.path("expiresAt").asLong()).isEqualTo(clock.millis()+120000);
            a.close();
            // 연결 종료 처리가 Hub에 도착한 뒤 재접속한다.
            org.awaitility.Awaitility.await().untilAsserted(()->assertThat(hub.metricsSnapshot().activeConnections()).isEqualTo(1));
            clock.advance(10);
            try(var returned=new ScenarioClient(port,"naver")){
                assertThat(returned.request("TABLE_HOST_WAIT_CHECK",Map.of()).path("payload").path("expiresAt").asLong()).isEqualTo(wait.path("expiresAt").asLong());
                clock.advance(110);
                b.sendRequest("TABLE_HOST_WAIT_CHECK",Map.of());
                assertThat(b.await(m->m.path("type").asText().equals("TABLE_HOST_TIMEOUT")).path("payload").path("nextHostUserId").asText()).isEqualTo("202");
            }
        }
    }
}
