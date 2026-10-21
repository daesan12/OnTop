package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.OntopApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(classes={OntopApplication.class,GamesDemoApplication.Fixture.class},
        webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "spring.profiles.active=local,games-demo","ontop.websocket.authenticated=true",
        "ontop.games.farkle.enabled=true","ontop.games.onecard.enabled=true","ontop.games.bridge.enabled=true",
        "ontop.games.onecard.forfeit-hand-policy=RECYCLE",
        "ontop.world.channels[0].channel-id=games-demo","ontop.world.channels[0].name=테스트","ontop.world.channels[0].capacity=10"
})
class GamesDemoHttpTests {
    @Autowired TestRestTemplate http;
    @Test void 세게임을검증서버에서만생성하고_진행중덮어쓰기와잘못된요청을막는다() {
        assertThat(http.getForObject("/dev/games",String.class)).contains("게임 서버를 직접 눌러보기","RECYCLE");
        assertThat(http.getForObject("/dev/games/games.js",String.class)).contains("GAME_ACTION_SEND","GAME_WATCH","GAME_RECONNECT_CHECK");
        assertThat(http.getForObject("/dev/games/games.css",String.class)).contains(".cards");
        assertThat(http.postForEntity("/dev/games/matches?code=DICE",null,String.class).getStatusCode().value()).isEqualTo(400);
        assertThat(post("/dev/games/matches?code=OMOK").getStatusCode().value()).isEqualTo(400);
        for(String code:java.util.List.of("DICE","ONE_CARD","LIAR_BRIDGE")){
            var created=post("/dev/games/matches?code="+code);
            assertThat(created.getStatusCode().value()).isEqualTo(201);
            assertThat(created.getBody().path("gameCode").asText()).isEqualTo(code);
            assertThat(post("/dev/games/matches?code="+code).getStatusCode().value()).isEqualTo(409);
            assertThat(post("/dev/games/forfeit").getStatusCode().value()).isEqualTo(200);
            assertThat(http.getForObject("/dev/games/config",JsonNode.class).path("playing").asBoolean()).isFalse();
        }
    }
    private org.springframework.http.ResponseEntity<JsonNode> post(String path){
        var headers=new HttpHeaders();headers.set("X-Games-Demo","local");
        return http.exchange(path,HttpMethod.POST,new HttpEntity<>(headers),JsonNode.class);
    }
}
