package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.stonerumble.service.StoneRumbleEngine;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleDemoTests {
    private final MutableClock clock = new MutableClock();
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Object> events = new ArrayList<>();
    private final StoneRumbleEngine engine = new StoneRumbleEngine(mapper, clock, events::add, new GameEngineRouter());
    private final StoneRumbleDemoApplication.Controller controller =
            new StoneRumbleDemoApplication.Controller(engine, mapper, clock);
    private long revision;

    @Test
    void 공원_준비_상태는_실제_경기를_만들거나_시간을_진행하지_않는다() {
        var response = controller.config().getBody();
        var preparation = (ObjectNode) response.get("preparationState");

        assertThat(response.get("gameId")).isEqualTo("");
        assertThat(preparation.path("tileMarks").size()).isZero();
        assertThat(preparation.path("tileLayout").asText()).isEqualTo("HEX_AXIAL_V3");
        assertThat(preparation.path("players").size()).isEqualTo(8);
        assertThat(preparation.path("serverTime").asLong()).isZero();
        clock.now = 30_000;
        assertThat(((ObjectNode) controller.config().getBody().get("preparationState"))
                .path("serverTime").asLong()).isZero();
        assertThat(events).isEmpty();
    }

    @Test
    void 여덟명_중_마지막_참가자까지_준비돼야_서버_경기를_생성한다() {
        for (int role = 1; role <= 7; role++) {
            reportReady("local", role, "client-" + role, true, true);
        }

        assertThat(controller.create("local", 8, "start-1", "client-1").getStatusCode().value()).isEqualTo(412);
        assertThat(events).isEmpty();
        clock.now = 5000;
        reportReady("local", 8, "client-8", true, true);
        var created = controller.create("local", 8, "start-1", "client-1");

        assertThat(created.getStatusCode().value()).isEqualTo(201);
        ObjectNode state = (ObjectNode) created.getBody().get("publicState");
        assertThat(state.path("serverTime").asLong()).isEqualTo(5000);
        assertThat(state.path("startsAt").asLong()).isEqualTo(9200);
        assertThat(state.path("players").get(0).path("y").asDouble()).isEqualTo(41);
        assertThat(events).hasSize(1);
    }

    @Test
    void 로딩_실패나_갱신_만료_뒤에는_시작을_거절한다() {
        readyTwo();
        reportReady("local", 2, "client-2", false, true);
        assertThat(controller.create("local", 2, "start-1", "client-1").getStatusCode().value()).isEqualTo(412);

        readyTwo();
        clock.now = 10_000;
        assertThat(controller.create("local", 2, "start-1", "client-1").getStatusCode().value()).isEqualTo(412);
        assertThat(events).isEmpty();
    }

    @Test
    void 시작_재요청은_같은_경기를_반환하고_참가자_변경은_거절한다() {
        readyTwo();
        var first = controller.create("local", 2, "start-1", "client-1");
        var retry = controller.create("local", 2, "start-1", "client-1");

        assertThat(retry.getStatusCode().value()).isEqualTo(201);
        assertThat(retry.getBody().get("gameId")).isEqualTo(first.getBody().get("gameId"));
        assertThat(controller.create("local", 3, "start-1", "client-1").getStatusCode().value()).isEqualTo(400);
        assertThat(controller.create("local", 2, "start-2", "client-1").getStatusCode().value()).isEqualTo(409);
        assertThat(events).hasSize(1);
    }

    @Test
    void 새_화면이_로딩하면_기존_준비를_취소하고_옛_화면_종료는_새_준비를_취소하지_않는다() {
        readyTwo();
        reportReady("local", 2, "new-client", false, true);
        assertThat(controller.create("local", 2, "start-1", "client-1").getStatusCode().value()).isEqualTo(412);

        reportReady("local", 2, "new-client", true, true);
        reportReady("local", 2, "client-2", false, false);

        assertThat(controller.create("local", 2, "start-1", "client-1").getStatusCode().value()).isEqualTo(201);
    }

    @Test
    void 준비한_호스트_화면과_다른_화면에서는_시작하지_못한다() {
        readyTwo();

        assertThat(controller.create("local", 2, "start-1", "other-client").getStatusCode().value()).isEqualTo(412);
        assertThat(reportReady("local", 9, "client-9", true, true).getStatusCode().value()).isEqualTo(400);
        assertThat(events).isEmpty();
    }

    private ResponseEntity<Map<String, Object>> reportReady(
            String marker, int role, String clientId, boolean ready, boolean connected) {
        return controller.ready(marker, role, clientId, ready, connected, ++revision);
    }

    @Test
    void 늦게_도착한_이전_준비_상태는_최신_준비나_실패를_덮어쓰지_않는다() {
        controller.ready("local", 1, "client-1", true, true, 2);
        controller.ready("local", 1, "client-1", false, true, 1);
        assertThat(controller.config().getBody().get("readyRoles")).isEqualTo(List.of(1));

        controller.ready("local", 1, "client-1", false, true, 4);
        controller.ready("local", 1, "client-1", true, true, 3);
        assertThat(controller.config().getBody().get("readyRoles")).isEqualTo(List.of());
    }

    private void readyTwo() {
        reportReady("local", 1, "client-1", true, true);
        reportReady("local", 2, "client-2", true, true);
    }

    @Test
    void 같은_경기_참가자끼리만_채팅을_조회하며_서버가_발신자를_지정한다() {
        readyTwo();
        String game = (String) controller.create("local", 2, "start-chat", "client-1").getBody().get("gameId");
        var request = new StoneRumbleDemoApplication.Controller.LocalChatRequest(UUID.randomUUID().toString(), "  안녕하세요  ");

        assertThat(controller.chat("local", game, 1, "client-1", request).getStatusCode().value()).isEqualTo(200);
        assertThat(controller.chat("local", game, 1, "client-1", request).getStatusCode().value()).isEqualTo(200);
        var history = controller.chatHistory(game, 2, "client-2");
        assertThat((List<?>) history.getBody().get("messages")).hasSize(1);
        assertThat(history.getBody().get("revision")).isEqualTo(1L);
        assertThat(history.getBody().get("messages")).isEqualTo(List.of(
                new StoneRumbleDemoApplication.Controller.LocalChatMessage(request.eventId(), "101", "안녕하세요")));
        assertThat(controller.chatHistory(game, 1, "wrong-client").getStatusCode().value()).isEqualTo(403);
        assertThat(controller.chatHistory("other-game", 2, "client-2").getBody().get("messages")).isEqualTo(List.of());
        assertThat(controller.chatHistory(game, 3, "client-3").getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void 채팅은_공통_문자열과_전송간격_정책을_사용하며_종료된_클라이언트는_차단한다() {
        readyTwo();
        String game = (String) controller.create("local", 2, "start-chat", "client-1").getBody().get("gameId");
        assertThat(controller.chat("local", game, 1, "client-1",
                new StoneRumbleDemoApplication.Controller.LocalChatRequest(UUID.randomUUID().toString(), "줄\n바꿈"))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(controller.chat("local", game, 1, "client-1",
                new StoneRumbleDemoApplication.Controller.LocalChatRequest(UUID.randomUUID().toString(), "첫 메시지"))
                .getStatusCode().value()).isEqualTo(200);
        assertThat(controller.chat("local", game, 1, "client-1",
                new StoneRumbleDemoApplication.Controller.LocalChatRequest(UUID.randomUUID().toString(), "연속 메시지"))
                .getStatusCode().value()).isEqualTo(429);
        reportReady("local", 1, "client-1", false, false);
        assertThat(controller.chatHistory(game, 1, "client-1").getStatusCode().value()).isEqualTo(403);
    }

    private static final class MutableClock extends Clock {
        long now;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
    }
}
