package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SkewerCoopEngineTests {
    @Test
    void 상대가_동의해야만_같은_경기를_초기화하고_중간_결과는_정산하지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.cookFirst();
        long beforeVersion = fixture.view(101).version();
        fixture.act(101, Map.of("type", "RESTART_REQUEST"));
        String requestId = fixture.view(101).publicState().at("/restart/id").asText();
        JsonNode hall = fixture.secret(101).deepCopy();
        JsonNode chef = fixture.secret(202).deepCopy();
        double remaining = fixture.view(101).publicState().path("remaining").asDouble();

        fixture.advance(2);

        assertThat(fixture.secret(101)).isEqualTo(hall);
        assertThat(fixture.secret(202)).isEqualTo(chef);
        assertThat(fixture.view(202).publicState().path("remaining").asDouble()).isEqualTo(remaining);
        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "RESTART_REPLY",
                "requestId", requestId, "accept", true))).hasMessage("INVALID_ACTION");
        fixture.act(202, Map.of("type", "RESTART_REPLY", "requestId", requestId, "accept", true));

        JsonNode state = fixture.view(101).publicState();
        assertThat(state.path("phase").asText()).isEqualTo("COUNTDOWN");
        assertThat(state.path("countdown").asDouble()).isEqualTo(3);
        assertThat(state.path("round").asInt()).isEqualTo(1);
        assertThat(state.path("score").asInt()).isZero();
        assertThat(state.path("served").asInt()).isZero();
        assertThat(state.path("remaining").asDouble()).isEqualTo(2400);
        assertThat(state.path("restart").isNull()).isTrue();
        assertThat(fixture.view(101).version()).isGreaterThan(beforeVersion);
        assertThat(fixture.secret(101).path("role").asText()).isEqualTo("server");
        assertThat(fixture.secret(202).path("role").asText()).isEqualTo("chef");
        assertThat(fixture.secret(101).at("/hall/pass")).isEmpty();
        assertThat(fixture.secret(101).at("/hall/held")).isEmpty();
        assertThat(fixture.secret(202).at("/chef/visible")).isEmpty();
        assertThat(fixture.secret(202).at("/chef/completed").asInt()).isZero();
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).isEmpty();
        assertThat(fixture.engine.load(101).orElseThrow().gameId()).isEqualTo(fixture.id);
        fixture.advance(3.2);
        assertThat(fixture.view(101).publicState().path("phase").asText()).isEqualTo("PLAYING");
    }

    @Test
    void 거절과_응답_시간초과는_기존_주문과_시간을_보존하고_늦은_동의를_거절한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.act(202, Map.of("type", "THREAD", "ingredient", "tomato"));
        fixture.act(202, Map.of("type", "RESTART_REQUEST"));
        String first = fixture.view(101).publicState().at("/restart/id").asText();
        JsonNode chef = fixture.secret(202).deepCopy();
        double elapsed = fixture.view(101).publicState().path("elapsed").asDouble();
        fixture.act(101, Map.of("type", "RESTART_REPLY", "requestId", first, "accept", false));
        assertThat(fixture.secret(202)).isEqualTo(chef);
        assertThat(fixture.view(101).publicState().path("paused").asBoolean()).isFalse();

        fixture.act(101, Map.of("type", "RESTART_REQUEST"));
        String second = fixture.view(202).publicState().at("/restart/id").asText();
        assertThat(second).isNotEqualTo(first);
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "RESTART_REPLY",
                "requestId", first, "accept", true))).hasMessage("INVALID_ACTION");
        fixture.advance(15);

        assertThat(fixture.view(101).publicState().path("restart").isNull()).isTrue();
        assertThat(fixture.view(101).publicState().path("round").asInt()).isZero();
        assertThat(fixture.view(101).publicState().path("elapsed").asDouble()).isEqualTo(elapsed);
        assertThat(fixture.secret(202)).isEqualTo(chef);
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "RESTART_REPLY",
                "requestId", second, "accept", true))).hasMessage("INVALID_ACTION");
    }

    @Test
    void 재시작_동의는_중복_낡은버전_비참가자_동시요청을_방어한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.act(101, Map.of("type", "RESTART_REQUEST"));
        String requestId = fixture.view(202).publicState().at("/restart/id").asText();
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "RESTART_REQUEST")))
                .hasMessage("INVALID_ACTION");
        assertThatThrownBy(() -> fixture.act(303, Map.of("type", "RESTART_REPLY",
                "requestId", requestId, "accept", true))).isInstanceOf(RuntimeException.class);
        long version = fixture.view(202).publicState().path("actionVersion").asLong();
        var command = new GameActionCommand(202, fixture.id, "restart-once", version,
                fixture.mapper.valueToTree(Map.of("type", "RESTART_REPLY", "requestId", requestId, "accept", true)));

        var accepted = fixture.engine.apply(command);

        assertThat(fixture.engine.apply(command)).isEqualTo(accepted);
        assertThat(fixture.view(101).publicState().path("round").asInt()).isEqualTo(1);
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(101, fixture.id, "old-input", version,
                fixture.mapper.valueToTree(Map.of("type", "MOVE", "dx", 1, "dz", 0)))))
                .hasMessage("STALE_VERSION");
    }

    @Test
    void 연결이_끊기면_요청을_취소하며_기존_삼십초_종료와_정산을_유지한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.act(101, Map.of("type", "RESTART_REQUEST"));
        String requestId = fixture.view(202).publicState().at("/restart/id").asText();
        fixture.connected = false;
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "RESTART_REPLY",
                "requestId", requestId, "accept", true))).hasMessage("INVALID_ACTION");

        fixture.advance(1);

        assertThat(fixture.view(101).publicState().path("restart").isNull()).isTrue();
        assertThat(fixture.view(101).publicState().path("pauseReason").asText()).isEqualTo("DISCONNECTED");
        assertThat(fixture.view(101).publicState().path("round").asInt()).isZero();
        fixture.advance(30);
        assertThat(fixture.view(101).publicState().path("endReason").asText()).isEqualTo("SKEWER_DISCONNECT_TIMEOUT");
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 재시작해도_PC_전환으로_제외된_랭킹_자격은_돌아오지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.roles();
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", true));
        fixture.ready();
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", false));
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", true));
        fixture.act(202, Map.of("type", "RESTART_REQUEST"));
        String requestId = fixture.view(101).publicState().at("/restart/id").asText();

        fixture.act(101, Map.of("type", "RESTART_REPLY", "requestId", requestId, "accept", true));

        assertThat(fixture.view(101).publicState().path("rankingEligible").asBoolean()).isFalse();
        assertThat(fixture.view(101).publicState().path("chefVR").asBoolean()).isTrue();
    }

    @Test
    void 배출_중인_기존_대기방은_준비를_눌러_새_경기를_시작할_수_없다() {
        Fixture fixture = new Fixture(2400, () -> false);
        fixture.roles();

        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "READY", "ready", true)))
                .isInstanceOfSatisfying(GameActionGateway.Rejected.class,
                        rejected -> assertThat(rejected.reason()).isEqualTo(GameActionGateway.Rejection.NOT_ACTIVE));
    }

    @Test
    void 요리사는_실시간_서빙_위치와_외형만_보고_미전달_주문은_볼_수_없다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        JsonNode before = fixture.secret(202).at("/chef/hallSight/position").deepCopy();
        fixture.act(101, Map.of("type", "MOVE", "dx", 1, "dz", 0));
        fixture.advance(.3);
        JsonNode sight = fixture.secret(202).at("/chef/hallSight");
        assertThat(sight.path("position")).isNotEqualTo(before);
        assertThat(sight.path("position")).isEqualTo(fixture.secret(101).at("/hall/position"));
        assertThat(sight.path("tables")).hasSize(6);
        assertThat(sight.toString()).doesNotContain("recipe", "bill", "sake", "unreceived");
        assertThat(fixture.secret(202).at("/chef/visible")).isEmpty();
        assertThatThrownBy(() -> fixture.secret(999)).isInstanceOf(RuntimeException.class);
        assertThat(fixture.view(202).publicState().has("hallSight")).isFalse();
    }

    @Test
    void 틀린_꼬치도_실제_재료로_전달되고_오배송후_재주문하여_진행할_수_있다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        String id = fixture.secret(202).at("/chef/visible/0/id").asText();
        JsonNode before = fixture.secret(202).at("/chef/pantry").deepCopy();
        fixture.act(202, Map.of("type", "THREAD", "ingredient", "tomato"));
        fixture.act(202, Map.of("type", "SUBMIT"));
        assertThat(fixture.secret(202).at("/chef/completed").asInt()).isEqualTo(1);
        assertThat(fixture.secret(202).at("/chef/pantry")).isNotEqualTo(before);
        assertThat(fixture.secret(101).at("/hall/pass/0/recipe").toString()).isEqualTo("[\"tomato\"]");
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "SUBMIT"))).hasMessage("INVALID_ACTION");
        fixture.walk(2.2, -4.25);
        fixture.interact();
        fixture.walk(-5.5, -4.25);
        fixture.walk(-5.5, 0);
        fixture.walk(-7.5, 0);
        fixture.interact();
        assertThat(fixture.secret(101).at("/hall/carry")).isEmpty();
        assertThat(fixture.secret(202).at("/chef/visible/0/id").asText()).isEqualTo(id);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isZero();
        fixture.cookFirst();
        assertThat(fixture.secret(202).at("/chef/completed").asInt()).isEqualTo(2);
    }

    @Test
    void 나가기_확인중에는_양쪽_시간과_이동과_조리가_멈추고_재개후_밀린시간을_진행하지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.act(101, Map.of("type", "MOVE", "dx", 1, "dz", 0));
        fixture.act(101, Map.of("type", "PAUSE", "paused", true));
        JsonNode state = fixture.view(101).publicState().deepCopy();
        JsonNode hall = fixture.secret(101).deepCopy();
        JsonNode chef = fixture.secret(202).deepCopy();

        fixture.advance(15);

        assertThat(fixture.view(101).publicState()).isEqualTo(state);
        assertThat(fixture.view(202).publicState().path("remaining")).isEqualTo(state.path("remaining"));
        assertThat(fixture.secret(101)).isEqualTo(hall);
        assertThat(fixture.secret(202)).isEqualTo(chef);
        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "MOVE", "dx", 1, "dz", 0))).hasMessage("INVALID_ACTION");
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "THREAD", "ingredient", "tomato"))).hasMessage("INVALID_ACTION");
        fixture.act(101, Map.of("type", "PAUSE", "paused", false));
        fixture.advance(1);
        assertThat(fixture.view(101).publicState().path("elapsed").asDouble())
                .isCloseTo(state.path("elapsed").asDouble() + 1, org.assertj.core.data.Offset.offset(.001));
        assertThat(fixture.secret(101).at("/hall/position")).isEqualTo(hall.at("/hall/position"));
    }

    @Test
    void 각자_확인창을_닫아야_재개되고_중복과_낡은버전과_비참가자_요청을_구분한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        long version = fixture.view(101).publicState().path("actionVersion").asLong();
        var command = new GameActionCommand(101, fixture.id, "pause-once", version,
                fixture.mapper.valueToTree(Map.of("type", "PAUSE", "paused", true)));
        var result = fixture.engine.apply(command);
        assertThat(fixture.engine.apply(command)).isEqualTo(result);
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(202, fixture.id, "old-pause", version,
                fixture.mapper.valueToTree(Map.of("type", "PAUSE", "paused", true))))).hasMessage("STALE_VERSION");
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(303, fixture.id, "outsider", version + 1,
                fixture.mapper.valueToTree(Map.of("type", "PAUSE", "paused", false))))).isInstanceOf(RuntimeException.class);
        fixture.act(202, Map.of("type", "PAUSE", "paused", false));
        assertThat(fixture.view(101).publicState().path("paused").asBoolean()).isTrue();
        fixture.act(202, Map.of("type", "PAUSE", "paused", true));
        fixture.act(101, Map.of("type", "PAUSE", "paused", false));
        assertThat(fixture.view(101).publicState().path("pausedBy").toString()).isEqualTo("[\"202\"]");
        fixture.act(202, Map.of("type", "PAUSE", "paused", false));
        assertThat(fixture.view(101).publicState().path("paused").asBoolean()).isFalse();
    }

    @Test
    void 카운트다운과_인사시간도_멈추지만_연결끊김_삼십초_종료는_유지한다() {
        Fixture fixture = new Fixture(40);
        fixture.roles();
        fixture.act(101, Map.of("type", "READY", "ready", true));
        fixture.act(202, Map.of("type", "READY", "ready", true));
        fixture.act(101, Map.of("type", "PAUSE", "paused", true));
        fixture.advance(4);
        assertThat(fixture.view(101).publicState().path("countdown").asDouble()).isEqualTo(3);
        fixture.act(101, Map.of("type", "PAUSE", "paused", false));
        fixture.advance(3.2);
        for (int i = 0; i < 400 && !fixture.view(101).publicState().at("/greeting/active").asBoolean(); i++) {
            fixture.advance(.1);
        }
        assertThat(fixture.view(101).publicState().at("/greeting/active").asBoolean()).isTrue();
        fixture.act(202, Map.of("type", "PAUSE", "paused", true));
        JsonNode greeting = fixture.view(202).publicState().path("greeting").deepCopy();
        fixture.advance(7);
        assertThat(fixture.view(202).publicState().path("greeting")).isEqualTo(greeting);
        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "GREET"))).hasMessage("INVALID_ACTION");
        fixture.connected = false;
        fixture.advance(1);
        assertThat(fixture.view(101).publicState().path("pauseReason").asText()).isEqualTo("DISCONNECTED");
        fixture.advance(30);
        assertThat(fixture.view(101).publicState().path("endReason").asText()).isEqualTo("SKEWER_DISCONNECT_TIMEOUT");
        assertThat(fixture.view(101).publicState().path("paused").asBoolean()).isFalse();
    }

    @Test
    void 치즈와_베이컨은_세개까지_꽂고_한개인_완성품은_제출할_수_없다() {
        for (String ingredient : List.of("cheese", "bacon")) {
            Fixture fixture = new Fixture(2400);
            fixture.prepare();
            fixture.receiveFirst();
            fixture.deliverOrder();
            fixture.act(202, Map.of("type", "THREAD", "ingredient", ingredient));
            assertThatThrownBy(() -> fixture.act(202, Map.of("type", "SUBMIT"))).hasMessage("INVALID_ACTION");
            assertThatThrownBy(() -> fixture.act(202, Map.of("type", "THREAD", "ingredient", ingredient)))
                    .hasMessage("INVALID_ACTION");
            for (String middle : List.of("tomato", "pepper")) {
                fixture.act(202, Map.of("type", "THREAD", "ingredient", middle));
                fixture.act(202, Map.of("type", "THREAD", "ingredient", ingredient));
            }
            assertThat(fixture.secret(202).at("/chef/skewer")).hasSize(5);
            assertThatThrownBy(() -> fixture.act(202, Map.of("type", "THREAD", "ingredient", ingredient)))
                    .hasMessage("INVALID_ACTION");
            assertThat(fixture.secret(202).at("/chef/skewer")).hasSize(5);
            fixture.act(202, Map.of("type", "UNTHREAD"));
            assertThat(fixture.secret(202).at("/chef/skewer")).hasSize(4);
        }
    }

    @Test
    void 오배송은_음식을_보존하고_한번만_감점하며_올바른_테이블에_재서빙할_수_있다() {
        Fixture fixture = new Fixture(2400, result -> { }, new Random(18) {
            @Override public int nextInt(int bound) { return bound - 1; }
        });
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.cookFirst();
        fixture.walk(2.2, -4.25);
        fixture.interact();
        fixture.walk(10, -4.25);
        fixture.interact();
        fixture.interact();
        fixture.walk(-5.5, -4.25);
        fixture.walk(-5.5, 2.1);
        fixture.walk(-7.5, 2.1);
        fixture.interact();
        assertThat(fixture.view(101).publicState().path("score").asInt()).isZero();
        fixture.interact();
        // 다른 테이블 꼬치를 들었어도 주문한 사케 두 병은 정상 전달한다.
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(60);
        JsonNode carry = fixture.secret(101).at("/hall/carry").deepCopy();
        JsonNode bill = fixture.secret(101).at("/hall/tables/3/bill").deepCopy();
        long version = fixture.view(101).publicState().path("actionVersion").asLong();
        var command = new GameActionCommand(101, fixture.id, "wrong-delivery", version,
                fixture.mapper.valueToTree(Map.of("type", "INTERACT")));

        var result = fixture.engine.apply(command);

        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(50);
        assertThat(fixture.view(202).publicState().path("score").asInt()).isEqualTo(50);
        assertThat(fixture.view(101).publicState().path("message").asText()).contains("오배송 -10점");
        assertThat(fixture.secret(101).at("/hall/carry")).isEqualTo(carry);
        assertThat(fixture.secret(101).at("/hall/tables/3/bill")).isEqualTo(bill);
        assertThat(fixture.engine.apply(command)).isEqualTo(result);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(50);
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(101, fixture.id, "stale-wrong", version,
                fixture.mapper.valueToTree(Map.of("type", "INTERACT"))))).hasMessage("STALE_VERSION");
        for (int i = 0; i < 7; i++) {
            fixture.interact();
        }
        assertThat(fixture.view(101).publicState().path("score").asInt()).isZero();
        fixture.walk(-5.5, 2.1);
        fixture.walk(-5.5, 0);
        fixture.walk(-7.5, 0);
        fixture.interact();
        assertThat(fixture.secret(101).at("/hall/carry")).isEmpty();
        assertThat(fixture.secret(101).at("/hall/tables/0/bill/dishes/0/delivered").asBoolean()).isTrue();
        assertThat(fixture.view(101).publicState().path("message").asText()).doesNotContain("오배송");
    }

    @Test
    void 같은_생성요청과_재입장은_멱등이고_세번째_계정과_다른채널은_거절한다() {
        Fixture fixture = new Fixture(2400);
        assertThat(fixture.engine.create(101, "park", "create").path("gameId").asText()).isEqualTo(fixture.id);
        fixture.engine.join(202, "park", fixture.id);
        assertThat(fixture.engine.load(202, fixture.id)).isPresent();
        assertThatThrownBy(() -> fixture.engine.join(303, "park", fixture.id)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> fixture.engine.join(202, "other", fixture.id)).isInstanceOf(RuntimeException.class);
        assertThat(fixture.engine.load(303, fixture.id)).isEmpty();
        assertThat(fixture.engine.load(101, fixture.id).orElseThrow().publicState().path("entryFee").asInt()).isZero();
    }

    @Test
    void 역할은_중복되지_않고_주문표를_넘기기_전까지_요리사에게_조합을_노출하지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.act(101, Map.of("type", "ROLE", "role", "server"));
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "ROLE", "role", "server")))
                .isInstanceOf(RuntimeException.class);
        fixture.prepare();
        assertThat(fixture.engine.join(202, "park", fixture.id).path("gameId").asText()).isEqualTo(fixture.id);
        JsonNode original = fixture.secret(101).at("/hall/tables/0/bill/dishes/0").deepCopy();
        assertThat(fixture.secret(202).path("chef").path("visible")).isEmpty();
        fixture.receiveFirst();
        assertThat(fixture.secret(202).toString()).doesNotContain("recipe");
        fixture.deliverOrder();
        assertThat(fixture.secret(202).path("chef").path("visible")).hasSize(1);
        JsonNode received = fixture.secret(202).at("/chef/visible/0");
        assertThat(received.path("id")).isEqualTo(original.path("id"));
        assertThat(received.path("table")).isEqualTo(original.path("table"));
        assertThat(received.path("recipe")).isEqualTo(original.path("recipe"));
        assertThat(fixture.secret(202).has("hall")).isFalse();
    }

    @Test
    void 동작ID_재전송과_낡은버전과_서빙역할의_조립요청을_방어한다() {
        Fixture fixture = new Fixture(2400);
        long version = fixture.view(101).publicState().path("actionVersion").asLong();
        var command = new GameActionCommand(101, fixture.id, "role", version,
                fixture.mapper.valueToTree(Map.of("type", "ROLE", "role", "server")));
        var result = fixture.engine.apply(command);
        assertThat(fixture.engine.apply(command)).isEqualTo(result);
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(101, fixture.id, "role", version,
                fixture.mapper.valueToTree(Map.of("type", "ROLE", "role", "chef")))))
                .isInstanceOf(RuntimeException.class).hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(202, fixture.id, "stale", version,
                fixture.mapper.valueToTree(Map.of("type", "ROLE", "role", "chef")))))
                .hasMessage("STALE_VERSION");
        fixture.prepare();
        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "THREAD", "ingredient", "tomato")))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void 실제_이동_주문_조립_제출_보관_반납_재수령_서빙은_같은_접시를_한번만_정산한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        JsonNode job = fixture.secret(202).at("/chef/visible/0");
        List<String> recipe = new ArrayList<>();
        job.path("recipe").forEach(node -> recipe.add(node.asText()));
        java.util.Collections.reverse(recipe);
        for (String ingredient : recipe) {
            fixture.act(202, Map.of("type", "THREAD", "ingredient", ingredient));
        }
        fixture.act(202, Map.of("type", "SUBMIT"));
        assertThat(fixture.secret(101).at("/hall/pass/0/id").asText()).isEqualTo(job.path("id").asText());
        fixture.walk(2.2, -4.25);
        fixture.interact();
        fixture.walk(6.6, -4.25);
        fixture.interact();
        assertThat(fixture.secret(101).at("/hall/carry")).isEmpty();
        assertThat(fixture.secret(101).at("/hall/stored")).hasSize(1);
        fixture.act(101, Map.of("type", "TAKE_STORED", "id", job.path("id").asText()));
        fixture.walk(10, -4.25);
        fixture.interact();
        fixture.act(101, Map.of("type", "RETURN_SAKE"));
        assertThat(fixture.secret(101).at("/hall/sake").asInt()).isZero();
        int sake = fixture.secret(101).at("/hall/tables/0/bill/sake").asInt();
        for (int index = 0; index < sake; index++) {
            fixture.interact();
        }
        assertThat(fixture.view(101).publicState().path("score").asInt()).isZero();
        fixture.walk(-5.5, -4.25);
        fixture.walk(-5.5, 0);
        fixture.walk(-7.5, 0);
        fixture.interact();
        int score = fixture.view(101).publicState().path("score").asInt();
        assertThat(score).isPositive();
        assertThat(fixture.view(202).publicState().path("score").asInt()).isEqualTo(score);
        assertThatThrownBy(fixture::interact).isInstanceOf(RuntimeException.class);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(score);
    }

    @Test
    void 앞의_두_주문만_공개하고_가득찬_전달대에서는_조립상태를_보존한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.walk(-5.5, -4.25);
        fixture.walk(-5.5, 2.1);
        fixture.walk(-7.5, 2.1);
        fixture.interact();
        fixture.walk(-5.5, 2.1);
        fixture.walk(-5.5, -4.25);
        fixture.walk(-2.6, -4.25);
        fixture.interact();

        JsonNode kitchen = fixture.secret(101).at("/hall/kitchen").deepCopy();
        String hidden = kitchen.at("/2/id").asText();
        assertThat(fixture.secret(202).at("/chef/visible")).hasSize(2);
        for (int index = 0; index < 2; index++) {
            JsonNode visible = fixture.secret(202).at("/chef/visible/" + index);
            assertThat(visible.path("id")).isEqualTo(kitchen.get(index).path("id"));
            assertThat(visible.path("table")).isEqualTo(kitchen.get(index).path("table"));
            assertThat(visible.path("recipe")).isEqualTo(kitchen.get(index).path("recipe"));
        }
        assertThat(fixture.secret(202).at("/chef/waiting").asInt()).isEqualTo(1);
        assertThat(fixture.secret(202).toString()).doesNotContain(hidden);
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "CHOOSE", "id", hidden)))
                .isInstanceOf(RuntimeException.class);
        fixture.cookFirst();
        assertThat(fixture.secret(202).at("/chef/visible/0/recipe")).isEqualTo(kitchen.at("/1/recipe"));
        assertThat(fixture.secret(202).at("/chef/visible/1/id").asText()).isEqualTo(hidden);
        assertThat(fixture.secret(202).at("/chef/visible/1/recipe")).isEqualTo(kitchen.at("/2/recipe"));
        fixture.cookFirst();
        fixture.assembleFirst();
        JsonNode before = fixture.secret(202);
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "SUBMIT")))
                .isInstanceOf(RuntimeException.class);
        assertThat(fixture.secret(202)).isEqualTo(before);
        fixture.walk(2.2, -4.25);
        fixture.interact();
        fixture.act(202, Map.of("type", "SUBMIT"));
        assertThat(fixture.secret(202).at("/chef/pass")).hasSize(2);
    }

    @Test
    void 청소는_키해제와_이동으로_취소되고_수거한_식기는_음식과_분리한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.receiveFirst();
        fixture.deliverOrder();
        fixture.cookFirst();
        fixture.walk(2.2, -4.25);
        fixture.interact();
        fixture.walk(10, -4.25);
        int sake = fixture.secret(101).at("/hall/tables/0/bill/sake").asInt();
        for (int index = 0; index < sake; index++) {
            fixture.interact();
        }
        fixture.walk(-5.5, -4.25);
        fixture.walk(-5.5, 0);
        fixture.walk(-7.5, 0);
        fixture.interact();
        int servedScore = fixture.view(101).publicState().path("score").asInt();
        fixture.advance(7);
        fixture.interact();
        fixture.advance(.6);
        fixture.act(101, Map.of("type", "CLEAN_CANCEL"));
        fixture.advance(1.6);
        assertThat(fixture.secret(101).at("/hall/tables/0/status").asText()).isEqualTo("dirty");
        fixture.interact();
        fixture.advance(.4);
        fixture.act(101, Map.of("type", "MOVE", "dx", .2, "dz", 0));
        fixture.advance(.1);
        assertThat(fixture.secret(101).at("/hall/clean").isNull()).isTrue();
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(servedScore);
        fixture.walk(-7.5, 0);
        fixture.interact();
        fixture.advance(1.6);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(servedScore + 4);
        assertThat(fixture.secret(101).at("/hall/dirtyDishes")).hasSize(1);
        fixture.walk(-5.5, 0);
        fixture.walk(-5.5, -4.25);
        fixture.walk(10, -4.25);
        assertThatThrownBy(fixture::interact).isInstanceOf(RuntimeException.class);
        assertThat(fixture.secret(101).at("/hall/sake").asInt()).isZero();
        fixture.walk(-6.4, -4.25);
        fixture.interact();
        assertThat(fixture.secret(101).at("/hall/dirtyDishes")).isEmpty();
        assertThat(fixture.secret(101).at("/hall/washer/load")).hasSize(1);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(servedScore + 7);
        assertThatThrownBy(fixture::interact).isInstanceOf(RuntimeException.class);
        fixture.advance(8.1);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isEqualTo(servedScore + 7);
        assertThat(fixture.secret(101).at("/hall/washer/load")).isEmpty();
    }

    @Test
    void VR에서_PC로_전환하면_다시_VR로_돌아와도_랭킹자격을_복구하지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.roles();
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", true));
        fixture.ready();
        assertThat(fixture.view(101).publicState().path("rankingEligible").asBoolean()).isTrue();
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", false));
        fixture.act(202, Map.of("type", "CHEF_MODE", "vr", true));
        assertThat(fixture.view(101).publicState().path("rankingEligible").asBoolean()).isFalse();
    }

    @Test
    void 단절은_공동시간을_멈추며_복귀하면_이어지고_30초_만료는_한번만_완료한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.advance(2);
        fixture.connected = false;
        fixture.advance(2);
        double remaining = fixture.view(101).publicState().path("remaining").asDouble();
        fixture.advance(3);
        assertThat(fixture.view(101).publicState().path("remaining").asDouble()).isEqualTo(remaining);
        fixture.connected = true;
        fixture.advance(1);
        assertThat(fixture.view(101).publicState().path("remaining").asDouble()).isLessThan(remaining);
        fixture.connected = false;
        fixture.advance(31);
        fixture.advance(3);
        assertThat(fixture.view(101).publicState().path("endReason").asText()).isEqualTo("SKEWER_DISCONNECT_TIMEOUT");
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 인사는_한판에_두번만_발생하며_응답중에도_영업시간이_흐르고_두명의_응답을_기다린다() {
        Fixture fixture = new Fixture(20);
        fixture.roles(); fixture.ready();
        int greetings = 0;
        for (int index = 0; index < 400
                && !fixture.view(101).publicState().path("phase").asText().equals("FINISHED"); index++) {
            fixture.advance(.1);
            if (fixture.view(101).publicState().at("/greeting/active").asBoolean()) {
                double remaining = fixture.view(101).publicState().path("remaining").asDouble();
                fixture.act(101, Map.of("type", "GREET"));
                fixture.advance(.5);
                assertThat(fixture.view(101).publicState().path("remaining").asDouble())
                        .isCloseTo(remaining - .5, org.assertj.core.data.Offset.offset(.001));
                fixture.act(202, Map.of("type", "GREET"));
                fixture.advance(.1);
                greetings++;
            }
        }
        assertThat(greetings).isEqualTo(2);
        assertThat(fixture.view(101).publicState().path("score").asInt()).isBetween(80, 100);
        assertThat(fixture.view(101).publicState().path("phase").asText()).isEqualTo("FINISHED");
    }

    @Test
    void 인사_응답중_영업시간이_끝나면_추가_인사와_보너스_없이_경기를_마친다() {
        Fixture fixture = new Fixture(2);
        fixture.roles(); fixture.ready();
        while (!fixture.view(101).publicState().at("/greeting/active").asBoolean()) {
            fixture.advance(.1);
        }
        JsonNode tables = fixture.secret(101).at("/hall/tables").deepCopy();
        fixture.advance(.5);
        assertThat(fixture.secret(101).at("/hall/tables")).isEqualTo(tables);
        fixture.act(101, Map.of("type", "GREET"));
        fixture.advance(2);
        assertThat(fixture.view(101).publicState().path("endReason").asText()).isEqualTo("SKEWER_TIME_UP");
        assertThat(fixture.view(101).publicState().path("remaining").asDouble()).isZero();
        assertThat(fixture.view(101).publicState().at("/greeting/active").asBoolean()).isFalse();
        assertThat(fixture.view(101).publicState().path("score").asInt()).isZero();
        assertThatThrownBy(() -> fixture.act(202, Map.of("type", "GREET"))).hasMessage("GAME_FINISHED");
    }

    @Test
    void 클릭동선은_서버가_가구를_우회하고_키보드_정지는_자동이동도_취소한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        assertThatThrownBy(() -> fixture.act(101, Map.of("type", "NAVIGATE", "x", -7.5, "z", -1.55)))
                .isInstanceOf(RuntimeException.class);
        fixture.act(101, Map.of("type", "NAVIGATE", "x", 10, "z", -4.25));
        fixture.advance(8);
        JsonNode position = fixture.secret(101).at("/hall/position");
        assertThat(Math.hypot(position.path("x").asDouble() - 10, position.path("z").asDouble() + 4.25))
                .isLessThan(.2);
        fixture.act(101, Map.of("type", "NAVIGATE", "x", -5.85, "z", -1.55));
        fixture.advance(10);
        fixture.interact();
        assertThat(fixture.secret(101).at("/hall/held")).hasSize(1);
        fixture.act(101, Map.of("type", "NAVIGATE", "x", 10, "z", -4.25));
        fixture.advance(.4);
        fixture.act(101, Map.of("type", "MOVE", "dx", 0, "dz", 0));
        JsonNode stopped = fixture.secret(101).at("/hall/position");
        fixture.advance(1);
        assertThat(fixture.secret(101).at("/hall/position")).isEqualTo(stopped);
    }

    @Test
    void 시계_틱은_입력토큰을_바꾸지_않고_실제_행동_이전의_토큰은_거절한다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.advance(4);
        long token = fixture.view(202).publicState().path("actionVersion").asLong();
        long displayed = fixture.view(202).version();
        fixture.advance(.3);
        assertThat(fixture.view(202).version()).isGreaterThan(displayed);
        assertThat(fixture.view(202).publicState().path("actionVersion").asLong()).isEqualTo(token);
        var command = new GameActionCommand(202, fixture.id, "vr-mode", token,
                fixture.mapper.valueToTree(Map.of("type", "CHEF_MODE", "vr", true)));
        fixture.engine.apply(command);
        assertThatThrownBy(() -> fixture.engine.apply(new GameActionCommand(202, fixture.id, "older", token,
                fixture.mapper.valueToTree(Map.of("type", "CHEF_MODE", "vr", false)))))
                .hasMessage("STALE_VERSION");
    }

    @Test
    void 종료후_다음방에서_혼자_기다려도_기존_복구기록을_깨뜨리지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        fixture.engine.forfeit(new GameForfeitCommand(101, fixture.id, "finish"));
        fixture.engine.persistTerminalResults();
        String next = fixture.engine.create(101, "park", "next").path("gameId").asText();
        assertThat(fixture.router.load(101).orElseThrow().gameId()).isEqualTo(fixture.id);
        fixture.engine.join(202, "park", next);
        assertThat(fixture.router.load(101).orElseThrow().gameId()).isEqualTo(next);
        assertThat(fixture.router.load(202).orElseThrow().gameId()).isEqualTo(next);
    }

    @Test
    void 무료경기만_DB예약없이_공통복구를_허용하고_기권결과는_멱등적이다() throws Exception {
        Fixture fixture = new Fixture(2400);
        fixture.prepare();
        var output = new LinkedBlockingQueue<GameReconnectService.View>();
        var recovery = new GameReconnectService(Optional.of(fixture.router), Optional.of(fixture.clock),
                Optional.of(user -> Optional.empty()), Optional.of(new GameRuntimeIdentity("skewer-test")));
        try {
            recovery.connected(101, "socket", (request, view) -> output.add(view));
            GameReconnectService.View restored;
            do {
                restored = output.poll(3, TimeUnit.SECONDS);
            } while (restored != null && restored.status().equals("PENDING"));
            assertThat(restored).isNotNull();
            assertThat(restored.status()).isEqualTo("RESTORED");
            assertThat(recovery.canControlGame(101, "socket", fixture.id)).isTrue();
            assertThat(recovery.canResumeUnreservedChannel(101, "socket", "park")).isTrue();
            assertThat(recovery.canResumeUnreservedChannel(101, "socket", "other")).isFalse();
            assertThat(recovery.canResumeUnreservedChannel(101, "old-socket", "park")).isFalse();
            assertThat(recovery.canUseLobby(101, "socket")).isFalse();
            var forfeit = new GameForfeitCommand(101, fixture.id, "quit");
            assertThat(fixture.engine.forfeit(forfeit).duplicate()).isFalse();
            assertThat(fixture.engine.forfeit(forfeit).duplicate()).isTrue();
            fixture.engine.persistTerminalResults();
            assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
        } finally {
            recovery.shutdown();
        }
    }

    @Test
    void 영속_인계_실패는_종료알림을_발행하지_않고_같은_결과로_재시도한다() {
        var attempts = new ArrayList<SkewerCoopFinished>();
        Fixture fixture = new Fixture(2400, result -> {
            attempts.add(result);
            if (attempts.size() == 1) {
                throw new java.io.UncheckedIOException(new java.io.IOException("디스크 일시 오류"));
            }
        });
        fixture.prepare();
        fixture.engine.forfeit(new GameForfeitCommand(101, fixture.id, "quit"));
        assertThat(attempts).isEmpty();
        fixture.engine.persistTerminalResults();
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).isEmpty();
        fixture.advance(4.9);
        assertThat(attempts).hasSize(1);
        fixture.advance(.2);
        assertThat(attempts).hasSize(2);
        assertThat(attempts.get(0)).isEqualTo(attempts.get(1));
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
        fixture.advance(6);
        assertThat(attempts).hasSize(2);
    }

    @Test
    void 저널이_멈춰도_다른방의_생성_입력_시간은_진행되고_저장후에만_점유를_해제한다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var saved = new CopyOnWriteArrayList<SkewerCoopFinished>();
        Fixture fixture = new Fixture(2400, result -> {
            entered.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("테스트 저장 해제 시간 초과");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
            saved.add(result);
        });
        fixture.prepare();
        fixture.engine.forfeit(new GameForfeitCommand(101, fixture.id, "quit"));
        try (var workers = Executors.newFixedThreadPool(2)) {
            var storing = workers.submit(fixture.engine::persistTerminalResults);
            try {
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                workers.submit(() -> {
                    String other = fixture.engine.create(303, "park", "other").path("gameId").asText();
                    fixture.engine.join(404, "park", other);
                    List<Map<String, Object>> commands = List.of(
                            Map.of("type", "ROLE", "role", "server"),
                            Map.of("type", "ROLE", "role", "chef"),
                            Map.of("type", "READY", "ready", true),
                            Map.of("type", "READY", "ready", true));
                    for (int index = 0; index < commands.size(); index++) {
                        long user = index % 2 == 0 ? 303 : 404;
                        long version = fixture.engine.load(user, other).orElseThrow().publicState()
                                .path("actionVersion").asLong();
                        fixture.engine.apply(new GameActionCommand(user, other, UUID.randomUUID().toString(), version,
                                fixture.mapper.valueToTree(commands.get(index))));
                    }
                    for (int i = 0; i < 42; i++) {
                        fixture.clock.millis += 100;
                        fixture.engine.tick();
                    }
                    assertThat(fixture.engine.load(303, other).orElseThrow().publicState()
                            .path("elapsed").asDouble()).isGreaterThan(0);
                    fixture.engine.persistTerminalResults(); // 중복 작업자는 저장을 기다리지 않고 반환한다.
                    assertThatThrownBy(() -> fixture.engine.create(101, "park", "too-early"))
                            .isInstanceOf(IllegalStateException.class);
                    fixture.engine.forfeit(new GameForfeitCommand(202, fixture.id, "duplicate-end"));
                    assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).isEmpty();
                    assertThat(saved).isEmpty();
                }).get(2, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
            storing.get(2, TimeUnit.SECONDS);
        }
        fixture.engine.persistTerminalResults();
        assertThat(saved).hasSize(1);
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
        String next = fixture.engine.create(101, "park", "after-save").path("gameId").asText();
        fixture.engine.join(202, "park", next);
    }

    @Test
    void 저장대기_경기도_방_상한에_포함하여_디스크_장애중_무한_적재하지_않는다() {
        Fixture fixture = new Fixture(2400);
        fixture.engine.forfeit(new GameForfeitCommand(101, fixture.id, "quit"));
        for (int i = 0; i < 63; i++) {
            fixture.engine.create(1000 + i, "park", "room-" + i);
        }
        assertThatThrownBy(() -> fixture.engine.create(2000, "park", "overflow"))
                .isInstanceOf(IllegalStateException.class);
        fixture.engine.persistTerminalResults();
        assertThat(fixture.engine.create(2000, "park", "after-save").path("gameId").asText()).isNotBlank();
    }

    @Test
    void 한_경기의_저장실패가_다른_경기의_저장과_종료를_막지_않는다() {
        var saved = new ArrayList<SkewerCoopFinished>();
        Fixture fixture = new Fixture(2400, result -> {
            if (result.users().contains(101L)) {
                throw new IllegalStateException("첫 경기의 저장 실패");
            }
            saved.add(result);
        });
        String other = fixture.engine.create(303, "park", "other").path("gameId").asText();
        fixture.engine.join(404, "park", other);
        fixture.engine.forfeit(new GameForfeitCommand(101, fixture.id, "quit"));
        fixture.engine.forfeit(new GameForfeitCommand(303, other, "quit"));

        fixture.engine.persistTerminalResults();

        assertThat(saved).singleElement().satisfies(result -> assertThat(result.result().gameId()).isEqualTo(other));
        assertThat(fixture.events.stream().filter(SkewerCoopFinished.class::isInstance)).hasSize(1);
        assertThatThrownBy(() -> fixture.engine.create(101, "park", "not-saved"))
                .isInstanceOf(IllegalStateException.class);
        String next = fixture.engine.create(303, "park", "saved").path("gameId").asText();
        fixture.engine.join(404, "park", next);
    }

    private static final class Fixture {
        final ObjectMapper mapper = new ObjectMapper();
        final MutableClock clock = new MutableClock();
        final GameEngineRouter router = new GameEngineRouter();
        final List<Object> events = new CopyOnWriteArrayList<>();
        final SkewerCoopEngine engine;
        final String id;
        boolean connected = true;

        Fixture(double duration) {
            this(duration, result -> { });
        }

        Fixture(double duration, BooleanSupplier newActivityAllowed) {
            this(duration, result -> { }, new Random(18), newActivityAllowed);
        }

        Fixture(double duration, java.util.function.Consumer<SkewerCoopFinished> recorder) {
            this(duration, recorder, new Random(18));
        }

        Fixture(double duration, java.util.function.Consumer<SkewerCoopFinished> recorder, Random random) {
            this(duration, recorder, random, () -> true);
        }

        Fixture(double duration, java.util.function.Consumer<SkewerCoopFinished> recorder, Random random,
                BooleanSupplier newActivityAllowed) {
            engine = new SkewerCoopEngine(mapper, clock, router, events::add, user -> { },
                    (user, channel) -> connected || user == 101, random, duration, recorder, newActivityAllowed);
            id = engine.create(101, "park", "create").path("gameId").asText();
            engine.join(202, "park", id);
        }

        com.ssafy.ontop.game.state.GameStateView view(long user) { return engine.load(user, id).orElseThrow(); }
        JsonNode secret(long user) { return view(user).privateState(); }
        void act(long user, Map<String, Object> input) {
            long expectedVersion = view(user).publicState().path("actionVersion").asLong();
            engine.apply(new GameActionCommand(user, id, UUID.randomUUID().toString(), expectedVersion,
                    mapper.valueToTree(input)));
        }
        void roles() {
            act(101, Map.of("type", "ROLE", "role", "server"));
            act(202, Map.of("type", "ROLE", "role", "chef"));
        }
        void ready() {
            act(101, Map.of("type", "READY", "ready", true));
            act(202, Map.of("type", "READY", "ready", true));
            advance(3.2);
        }
        void prepare() { roles(); ready(); advance(7); }
        void advance(double seconds) {
            for (int step = 0; step < Math.round(seconds * 10); step++) {
                clock.millis += 100;
                engine.tick();
                engine.persistTerminalResults();
            }
        }
        void interact() { act(101, Map.of("type", "INTERACT")); }
        void receiveFirst() { walk(-5.5, 1.15); walk(-5.5, 0); walk(-7.5, 0); interact(); }
        void deliverOrder() { walk(-5.5, 0); walk(-5.5, -4.25); walk(-2.6, -4.25); interact(); }
        void assembleFirst() {
            for (JsonNode ingredient : secret(202).at("/chef/visible/0/recipe")) {
                act(202, Map.of("type", "THREAD", "ingredient", ingredient.asText()));
            }
        }
        void cookFirst() { assembleFirst(); act(202, Map.of("type", "SUBMIT")); }
        void walk(double x, double z) {
            for (int step = 0; step < 500; step++) {
                JsonNode position = secret(101).at("/hall/position");
                double dx = x - position.path("x").asDouble(), dz = z - position.path("z").asDouble();
                if (Math.hypot(dx, dz) < .18) {
                    act(101, Map.of("type", "MOVE", "dx", 0, "dz", 0));
                    return;
                }
                double scale = Math.max(.375, Math.hypot(dx, dz));
                act(101, Map.of("type", "MOVE", "dx", dx / scale, "dz", dz / scale));
                advance(.1);
            }
            throw new AssertionError("목적지에 도착하지 못했습니다: " + x + "," + z);
        }
    }

    private static final class MutableClock extends Clock {
        long millis = Instant.parse("2026-11-02T00:00:00Z").toEpochMilli();
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
    }
}
