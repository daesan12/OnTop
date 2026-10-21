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
import org.springframework.http.HttpStatus;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = {OntopApplication.class, OmokDemoApplication.Fixture.class},
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,omok-demo", "ontop.websocket.authenticated=true",
        "ontop.games.omok.enabled=true", "ontop.world.channels[0].channel-id=omok-demo",
        "ontop.world.channels[0].name=테스트", "ontop.world.channels[0].capacity=10"
})
class OmokDemoHttpTests {
    @Autowired TestRestTemplate http;

    @Test
    void 테스트화면과자원을_제공하고_진행중_경기는_재생성하지않는다() {
        assertThat(http.getForEntity("/dev/omok", String.class).getBody()).contains("오목 테스트", "테스트 경기 생성");
        assertThat(http.getForEntity("/dev/omok/omok.js", String.class).getBody()).contains("GAME_ACTION_SEND");
        assertThat(http.getForEntity("/dev/omok/omok.css", String.class).getBody()).contains("#board");
        assertThat(http.postForEntity("/dev/omok/games", null, String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        HttpHeaders headers = new HttpHeaders(); headers.set("X-Omok-Demo", "local");
        var first = http.exchange("/dev/omok/games", HttpMethod.POST, new HttpEntity<>(headers), JsonNode.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String gameId = first.getBody().path("gameId").asText();
        assertThat(gameId).startsWith("omok-demo-");
        var second = http.exchange("/dev/omok/games", HttpMethod.POST, new HttpEntity<>(headers), JsonNode.class);
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(second.getBody().path("gameId").asText()).isEqualTo(gameId);
        assertThat(http.getForObject("/dev/omok/config", JsonNode.class).path("playing").asBoolean()).isTrue();
    }
}
