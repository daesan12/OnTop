package com.ssafy.ontop.game.halligalli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.domain.FruitCard;
import com.ssafy.ontop.game.halligalli.domain.FruitType;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliBellLog;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliDeck;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
import com.ssafy.ontop.game.halligalli.service.HalliGalliBellStats;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import com.ssafy.ontop.game.halligalli.service.HalliGalliGameFinished;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.StreamSupport;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;

import static com.ssafy.ontop.game.halligalli.domain.FruitType.BANANA;
import static com.ssafy.ontop.game.halligalli.domain.FruitType.STRAWBERRY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HalliGalliEngineTests {
    private static final String GAME = "halli";
    private static final Instant START = Instant.parse("2026-11-01T00:00:00Z");
    private static final long A = 101;
    private static final long B = 202;
    private static final long C = 303;
    private static final long D = 404;
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final Map<Integer, FruitCard> fixed = new HashMap<>();
    private final HalliGalliEngine engine = new HalliGalliEngine(mapper, clock, events::add, router, this::arrange,
            new Random(5), HalliGalliTiming.DEFAULT);

    @Test
    void 경기를_만들면_라우터에_참가자를_등록하고_첫_좌석부터_5초_턴을_연다() {
        engine.create(GAME, "table", List.of(A, B, C));
        engine.create(GAME, "table", List.of(A, B, C));

        JsonNode state = state();
        assertThat(router.load(B).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.PLAYING);
        assertThat(router.load(B).orElseThrow().participantCount()).isEqualTo(3);
        assertThat(state.path("gameCode").asText()).isEqualTo("HALLI_GALLI");
        assertThat(state.path("status").asText()).isEqualTo("PLAYING");
        assertThat(state.path("players")).extracting(player -> player.path("userId").asText())
                .containsExactly("101", "202", "303");
        assertThat(state.path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(19, 19, 18);
        assertThat(state.path("turnUserId").asText()).isEqualTo("101");
        assertThat(state.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(5).toString());
        assertThat(state.path("flipTimeLimitMs").asLong()).isEqualTo(5_000);
        assertThat(state.path("bellWindowId").isNull()).isTrue();
        assertThatIllegalStateException().isThrownBy(() -> engine.create(GAME, "table", List.of(A, B)));
        assertThatIllegalStateException().isThrownBy(() -> engine.create("other", "table-2", List.of(A, D)));
    }

    @Test
    void 자기_차례의_카드_공개는_한_장을_열고_종_창을_연다() {
        engine.create(GAME, "table", List.of(A, B, C));

        reject(Rejection.NOT_YOUR_TURN, () -> flip(C, "early"));
        flip(A, "a1");

        JsonNode state = state();
        assertThat(state.path("version").asLong()).isEqualTo(1);
        assertThat(state.path("bellWindowId").asLong()).isEqualTo(1);
        assertThat(player(0).path("faceUpCount").asInt()).isEqualTo(1);
        assertThat(player(0).path("topCard").path("fruit").asText()).isEqualTo("STRAWBERRY");
        assertThat(state.path("turnUserId").asText()).isEqualTo("202");
        assertThat(events).contains(new GameStateChanged(GAME, 1));
    }

    @Test
    void 정답_종은_공개_더미를_가져가고_결과_연출_뒤_자기_턴을_받는다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");

        ring(C, "bell", 2);

        JsonNode state = state();
        assertThat(state.path("lastEvent").path("type").asText()).isEqualTo("RING_SUCCESS");
        assertThat(state.path("lastEvent").path("userId").asText()).isEqualTo("303");
        assertThat(state.path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(18, 18, 20);
        assertThat(state.path("bellWindowId").isNull()).isTrue();
        assertThat(state.path("turnUserId").asText()).isEqualTo("303");
        assertThat(state.path("resultUntil").asText()).isEqualTo(START.plusSeconds(1).toString());
        assertThat(state.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(6).toString());
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 두_참가자가_같은_창에_동시에_종을_치면_먼저_처리된_한_명만_가져간다() throws Exception {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");
        long version = version();

        List<String> outcomes = race(
                () -> outcome(() -> act(A, "bell-a", version, ringInput(2))),
                () -> outcome(() -> act(C, "bell-c", version, ringInput(2))));

        JsonNode state = state();
        String winner = state.path("lastEvent").path("userId").asText();
        assertThat(outcomes).containsExactlyInAnyOrder("ACCEPTED", "STALE_VERSION");
        assertThat(winner).isIn("101", "303");
        assertThat(state.path("version").asLong()).isEqualTo(version + 1);
        assertThat(state.path("players")).filteredOn(player -> player.path("userId").asText().equals(winner))
                .extracting(player -> player.path("drawCount").asInt()).containsExactly(20);
        assertThat(state.path("issuedPenaltyCards").asInt()).isZero();
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 이미_닫히거나_지난_종_창의_늦은_요청은_벌칙없이_거절한다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");
        reject(Rejection.STALE_VERSION, () -> ring(C, "old-window", 1));
        ring(C, "bell", 2);
        JsonNode afterWinner = state();

        reject(Rejection.STALE_VERSION, () -> ring(A, "late", 2));

        assertThat(state()).isEqualTo(afterWinner);
    }

    @Test
    void 같은_행동_번호는_한_번만_반영하고_다른_내용이면_충돌이다() {
        fixed.put(0, card(STRAWBERRY, 1));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        GameActionCommand wrong = command(C, "wrong", version(), ringInput(1));

        GameActionResult first = router.apply(wrong);
        JsonNode afterPenalty = state();
        GameActionResult repeated = router.apply(wrong);

        assertThat(repeated).isEqualTo(first);
        assertThat(state()).isEqualTo(afterPenalty);
        assertThat(afterPenalty.path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(19, 20, 16);
        reject(Rejection.ACTION_ID_CONFLICT, () -> act(C, "wrong", first.version(), ringInput(1)));
    }

    @Test
    void 마감_시각의_수동_공개와_자동_공개가_겹쳐도_한_장만_공개한다() throws Exception {
        engine.create(GAME, "table", List.of(A, B));
        clock.set(START.plusSeconds(5));

        List<String> outcomes = race(
                () -> { engine.tick(); return "TICK"; },
                () -> outcome(() -> act(A, "manual", 0, flipInput())));

        JsonNode state = state();
        assertThat(outcomes).containsExactlyInAnyOrder("TICK", "STALE_VERSION");
        assertThat(state.path("flipSeq").asLong()).isEqualTo(1);
        assertThat(player(0).path("faceUpCount").asInt()).isEqualTo(1);
        assertThat(state.path("lastEvent").path("type").asText()).isEqualTo("AUTO_FLIP");
        assertThat(state.path("lastEvent").path("at").asText()).isEqualTo(START.plusSeconds(5).toString());
    }

    @Test
    void 마감_직전_수동_공개_뒤에는_이전_마감에_다시_공개하지_않는다() {
        engine.create(GAME, "table", List.of(A, B));
        clock.set(START.plusSeconds(5).minusMillis(1));

        flip(A, "manual");
        clock.set(START.plusSeconds(5));
        engine.tick();

        assertThat(state().path("flipSeq").asLong()).isEqualTo(1);
        assertThat(state().path("lastEvent").path("type").asText()).isEqualTo("FLIP");
        assertThat(state().path("flipDeadline").asText()).isEqualTo(START.plusSeconds(10).minusMillis(1).toString());
    }

    @Test
    void 마감_직전에는_기다리고_마감부터_자동_공개하며_늦은_틱은_밀린_마감을_차례로_처리한다() {
        engine.create(GAME, "table", List.of(A, B));

        clock.set(START.plusSeconds(5).minusMillis(1));
        engine.tick();
        long beforeDeadline = state().path("flipSeq").asLong();
        clock.set(START.plusSeconds(5));
        engine.tick();
        JsonNode atDeadline = state();
        clock.set(START.plusSeconds(16));
        engine.tick();

        assertThat(beforeDeadline).isZero();
        assertThat(atDeadline.path("flipSeq").asLong()).isEqualTo(1);
        assertThat(atDeadline.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(10).toString());
        assertThat(state().path("flipSeq").asLong()).isEqualTo(3);
        assertThat(state().path("lastEvent").path("at").asText()).isEqualTo(START.plusSeconds(15).toString());
        assertThat(state().path("flipDeadline").asText()).isEqualTo(START.plusSeconds(20).toString());
    }

    @Test
    void 결과_연출_1초_동안은_공개를_거절하고_끝난_시각부터_공개할_수_있다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");
        ring(C, "bell", 2);

        clock.set(START.plusMillis(999));
        reject(Rejection.INVALID_ACTION, () -> flip(C, "too-soon"));
        clock.set(START.plusSeconds(1));
        flip(C, "after-pause");

        assertThat(state().path("lastEvent").path("type").asText()).isEqualTo("FLIP");
        assertThat(state().path("resultUntil").isNull()).isTrue();
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
    }

    @Test
    void 결과_연출이_끝나고_5초가_지나면_자동_공개한다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");
        ring(C, "bell", 2);

        clock.set(START.plusSeconds(6).minusMillis(1));
        engine.tick();
        long beforeDeadline = state().path("flipSeq").asLong();
        clock.set(START.plusSeconds(6));
        engine.tick();

        assertThat(beforeDeadline).isEqualTo(2);
        assertThat(state().path("lastEvent").path("type").asText()).isEqualTo("AUTO_FLIP");
        assertThat(state().path("lastEvent").path("userId").asText()).isEqualTo("303");
    }

    @Test
    void 참가자_상태_조회는_공개_정보만_담고_개인_상태는_비어_있다() {
        engine.create(GAME, "table", List.of(A, B));
        flip(A, "a1");

        GameStateView view = engine.load(A, GAME).orElseThrow();

        assertThat(view.role()).isEqualTo(GameStateView.Role.PLAYER);
        assertThat(view.version()).isEqualTo(1);
        assertThat(view.privateState().isEmpty()).isTrue();
        assertThat(fields(view.publicState())).containsExactlyInAnyOrder("gameCode", "status", "version",
                "flipTimeLimitMs", "resultPauseMs", "turnUserId", "flipDeadline", "resultUntil", "flipSeq",
                "issuedPenaltyCards", "endReason", "endedAt", "bellWindowId", "winnerUserIds", "lastEvent", "players");
        assertThat(fields(view.publicState().path("players").get(0))).containsExactlyInAnyOrder("userId", "seat",
                "drawCount", "faceUpCount", "cardCount", "active", "eliminated", "forfeited", "topCard");
        assertThat(fields(view.publicState().path("players").get(0).path("topCard")))
                .containsExactlyInAnyOrder("fruit", "count");
        assertThat(view.publicState().path("players").get(1).path("topCard").isNull()).isTrue();
    }

    @Test
    void 관전자는_같은_공개_상태를_보고_개인_상태와_행동_권한이_없다() {
        engine.create(GAME, "table", List.of(A, B));
        flip(A, "a1");

        GameStateView spectator = engine.load(505, GAME).orElseThrow();

        assertThat(spectator.role()).isEqualTo(GameStateView.Role.SPECTATOR);
        assertThat(spectator.publicState()).isEqualTo(state());
        assertThat(spectator.privateState().isEmpty()).isTrue();
        assertThat(router.load(505)).isEmpty();
        reject(Rejection.ACCESS_DENIED, () -> act(505, "viewer", 1, flipInput()));
    }

    @Test
    void 재접속하면_현재_버전의_카드_턴_종_창과_마감_시각을_돌려준다() {
        fixed.put(0, card(STRAWBERRY, 1));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        clock.set(START.plusSeconds(2));

        GameRecoverySnapshot recovered = router.load(B).orElseThrow();

        assertThat(recovered.gameId()).isEqualTo(GAME);
        assertThat(recovered.phase()).isEqualTo(GameRecoverySnapshot.Phase.PLAYING);
        assertThat(recovered.version()).isEqualTo(version());
        assertThat(recovered.state().path("publicState")).isEqualTo(state());
        assertThat(recovered.state().path("privateState").isEmpty()).isTrue();
        assertThat(recovered.state().path("publicState").path("bellWindowId").asLong()).isEqualTo(1);
        assertThat(recovered.state().path("publicState").path("flipDeadline").asText())
                .isEqualTo(START.plusSeconds(5).toString());
    }

    @Test
    void 재접속_유예_중에는_기권하지_않고_턴_시간은_멈추지_않는다() {
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        clock.set(START.plusSeconds(5));
        engine.tick();
        GraceExpiration early = new GraceExpiration(UUID.randomUUID(), B, GAME, START, START.plusSeconds(30),
                Action.ELIMINATE);

        engine.graceExpired(early);

        assertThat(player(1).path("active").asBoolean()).isTrue();
        assertThat(player(1).path("forfeited").asBoolean()).isFalse();
        assertThat(player(1).path("drawCount").asInt()).isEqualTo(18);
        assertThat(player(1).path("faceUpCount").asInt()).isEqualTo(1);
        assertThat(state().path("lastEvent").path("type").asText()).isEqualTo("AUTO_FLIP");
        assertThat(router.load(B).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.PLAYING);
        assertThat(events).noneMatch(GameParticipantLeft.class::isInstance);
    }

    @Test
    void 명시적_기권은_행동_자격만_없애고_공개_차례면_다음_좌석에_새_턴을_준다() {
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        clock.set(START.plusSeconds(2));

        var result = engine.forfeit(new GameForfeitCommand(B, GAME, "leave-b"));

        JsonNode state = state();
        assertThat(result.duplicate()).isFalse();
        assertThat(state.path("status").asText()).isEqualTo("PLAYING");
        assertThat(state.path("turnUserId").asText()).isEqualTo("303");
        assertThat(state.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(7).toString());
        assertThat(player(1).path("forfeited").asBoolean()).isTrue();
        assertThat(player(1).path("active").asBoolean()).isFalse();
        assertThat(player(1).path("drawCount").asInt()).isEqualTo(19);
        assertThat(router.load(B).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.ELIMINATED);
        assertThat(engine.forfeit(new GameForfeitCommand(B, GAME, "leave-again")).duplicate()).isTrue();
        reject(Rejection.NOT_ACTIVE, () -> ring(B, "ghost", 1));
        assertThat(events).filteredOn(GameParticipantLeft.class::isInstance).map(GameParticipantLeft.class::cast)
                .extracting(GameParticipantLeft::userId, GameParticipantLeft::leaveReason)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(B, GameDepartureReason.EXPLICIT_LEAVE));
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 재접속_유예가_끝나면_마감_시각까지_밀린_공개를_처리한_뒤_기권을_확정한다() {
        engine.create(GAME, "table", List.of(A, B, C));
        GraceExpiration expired = new GraceExpiration(UUID.randomUUID(), B, GAME, START, START.plusSeconds(30),
                Action.ELIMINATE);
        clock.set(START.plusSeconds(31));

        engine.graceExpired(expired);
        engine.graceExpired(expired);
        JsonNode afterGrace = state();
        clock.set(START.plusSeconds(35));
        engine.tick();

        assertThat(afterGrace.path("flipSeq").asLong()).isEqualTo(6);
        assertThat(afterGrace.path("status").asText()).isEqualTo("PLAYING");
        assertThat(afterGrace.path("players").get(1).path("forfeited").asBoolean()).isTrue();
        assertThat(afterGrace.path("players").get(1).path("faceUpCount").asInt()).isEqualTo(2);
        assertThat(state().path("lastEvent").path("userId").asText()).isEqualTo("101");
        assertThat(state().path("turnUserId").asText()).isEqualTo("303");
        assertThat(events).filteredOn(GameParticipantLeft.class::isInstance).map(GameParticipantLeft.class::cast)
                .extracting(GameParticipantLeft::leaveReason).containsExactly(GameDepartureReason.DISCONNECT_TIMEOUT);
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 두_명_중_한_명이_기권하면_남은_사람의_단독_승리로_끝난다() {
        engine.create(GAME, "table", List.of(A, B));
        flip(A, "a1");

        engine.forfeit(new GameForfeitCommand(A, GAME, "leave-a"));

        JsonNode state = state();
        GameFinished finished = only(GameFinished.class);
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("endReason").asText()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(state.path("winnerUserIds").toString()).isEqualTo("[\"202\"]");
        assertThat(finished.gameCode()).isEqualTo("HALLI_GALLI");
        assertThat(finished.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
        assertThat(finished.participants().getFirst().leaveReason()).isEqualTo(GameDepartureReason.EXPLICIT_LEAVE);
        assertThat(router.load(A).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
        assertThat(totalCards()).isEqualTo(56);
        engine.create("next", "table", List.of(A, B));
    }

    @Test
    void 네_명_중_한_명이_기권해도_나머지는_그_좌석을_건너뛰며_계속한다() {
        engine.create(GAME, "table", List.of(A, B, C, D));

        engine.forfeit(new GameForfeitCommand(D, GAME, "leave-d"));
        flip(A, "a1");
        flip(B, "b1");
        flip(C, "c1");

        JsonNode state = state();
        assertThat(state.path("status").asText()).isEqualTo("PLAYING");
        assertThat(state.path("turnUserId").asText()).isEqualTo("101");
        assertThat(player(3).path("forfeited").asBoolean()).isTrue();
        assertThat(player(3).path("drawCount").asInt()).isEqualTo(14);
        reject(Rejection.NOT_ACTIVE, () -> flip(D, "ghost"));
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 기권자의_공개_카드는_종_판정과_수거에_남고_벌칙_카드는_받지_않는다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C, D));
        flip(A, "a1");
        engine.forfeit(new GameForfeitCommand(A, GAME, "leave-a"));
        flip(B, "b1");

        ring(C, "bell", 2);
        JsonNode afterRing = state();
        clock.set(START.plusSeconds(1));
        flip(C, "c1");
        ring(D, "wrong", 3);

        assertThat(afterRing.path("status").asText()).isEqualTo("PLAYING");
        assertThat(afterRing.path("lastEvent").path("type").asText()).isEqualTo("RING_SUCCESS");
        assertThat(afterRing.path("lastEvent").path("cardCount").asInt()).isEqualTo(2);
        assertThat(afterRing.path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(13, 13, 16, 14);
        assertThat(state().path("lastEvent").path("type").asText()).isEqualTo("RING_PENALTY");
        assertThat(state().path("lastEvent").path("cardCount").asInt()).isEqualTo(2);
        assertThat(state().path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(13, 14, 16, 12);
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 세_명_중_한_명이_기권해_두_명이_남아도_정답_뒤에_끝내지_않고_기권자는_FORFEIT이다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        engine.forfeit(new GameForfeitCommand(A, GAME, "leave-a"));
        flip(B, "b1");

        ring(C, "bell", 2);
        JsonNode afterRing = state();
        engine.forfeit(new GameForfeitCommand(B, GAME, "leave-b"));

        GameFinished finished = only(GameFinished.class);
        assertThat(afterRing.path("status").asText()).isEqualTo("PLAYING");
        assertThat(afterRing.path("lastEvent").path("type").asText()).isEqualTo("RING_SUCCESS");
        assertThat(afterRing.path("turnUserId").asText()).isEqualTo("303");
        assertThat(afterRing.path("players")).extracting(player -> player.path("drawCount").asInt())
                .containsExactly(18, 18, 20);
        assertThat(state().path("endReason").asText()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(state().path("winnerUserIds").toString()).isEqualTo("[\"303\"]");
        assertThat(finished.participants()).extracting(GameFinished.Participant::result).containsExactly(
                GameFinished.Result.FORFEIT, GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 경기가_끝나면_참가자별_종_기록_요약을_한_번_발행한다() {
        fixed.putAll(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        engine.create(GAME, "table", List.of(A, B, C));
        flip(A, "a1");
        flip(B, "b1");
        clock.set(START.plusMillis(450));
        ring(C, "bell", 2);

        engine.forfeit(new GameForfeitCommand(A, GAME, "leave-a"));
        engine.forfeit(new GameForfeitCommand(B, GAME, "leave-b"));
        engine.tick();

        HalliGalliBellStats stats = only(HalliGalliBellStats.class);
        assertThat(stats.gameId()).isEqualTo(GAME);
        assertThat(stats.tableId()).isEqualTo("table");
        assertThat(stats.endedAt()).isEqualTo(START.plusMillis(450));
        assertThat(stats.players()).extracting(HalliGalliBellLog.Summary::userId).containsExactly(A, B, C);
        assertThat(stats.players().get(2)).isEqualTo(new HalliGalliBellLog.Summary(C, 1, 0, 0, 450, 450, 450, 0, 0));
    }

    @Test
    void 종료_알림은_경기당_한_번만_발행한다() {
        engine.create(GAME, "table", List.of(A, B));
        engine.forfeit(new GameForfeitCommand(A, GAME, "leave-a"));

        clock.set(START.plusSeconds(60));
        engine.tick();
        engine.load(B, GAME);
        engine.graceExpired(new GraceExpiration(UUID.randomUUID(), B, GAME, START, START.plusSeconds(30),
                Action.FORFEIT));
        reject(Rejection.GAME_FINISHED, () -> engine.forfeit(new GameForfeitCommand(B, GAME, "leave-b")));
        reject(Rejection.INVALID_ACTION, () -> flip(B, "after-end"));

        assertThat(events).filteredOn(GameFinished.class::isInstance).hasSize(1);
        assertThat(events).filteredOn(HalliGalliGameFinished.class::isInstance).hasSize(1);
        assertThat(state().path("winnerUserIds").toString()).isEqualTo("[\"202\"]");
    }

    @Test
    void 활성_2명의_마지막_종_기회가_끝나면_상대_단독_승리로_종료_알림을_한_번만_보낸다() {
        fixed.putAll(Map.of(54, card(STRAWBERRY, 1), 55, card(BANANA, 1)));
        engine.create(GAME, "table", List.of(A, B));
        clock.set(START.plusSeconds(280));
        engine.tick();
        JsonNode waiting = state();
        reject(Rejection.INVALID_ACTION, () -> flip(A, "nothing"));

        clock.set(START.plusSeconds(285));
        engine.tick();
        engine.tick();
        engine.graceExpired(new GraceExpiration(UUID.randomUUID(), A, GAME, START, START.plusSeconds(285),
                Action.FORFEIT));

        JsonNode state = state();
        GameFinished finished = only(GameFinished.class);
        assertThat(waiting.path("status").asText()).isEqualTo("PLAYING");
        assertThat(waiting.path("turnUserId").asText()).isEqualTo("101");
        assertThat(waiting.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(285).toString());
        assertThat(waiting.path("bellWindowId").asLong()).isEqualTo(56);
        assertThat(waiting.path("players").get(0).path("drawCount").asInt()).isZero();
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("endReason").asText()).isEqualTo("NO_CARDS_TO_FLIP");
        assertThat(state.path("flipSeq").asLong()).isEqualTo(56);
        assertThat(state.path("winnerUserIds").toString()).isEqualTo("[\"202\"]");
        assertThat(finished.endReason()).isEqualTo("NO_CARDS_TO_FLIP");
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.LOSE, GameFinished.Result.WIN);
        assertThat(only(HalliGalliGameFinished.class).winnerUserIds()).containsExactly(B);
        assertThat(events).noneMatch(GameParticipantLeft.class::isInstance);
        assertThat(router.load(A).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
        assertThat(totalCards()).isEqualTo(56);
    }

    @Test
    void 재접속_유예가_끝나_2명이_남으면_뒷면이_빈_다음_좌석의_마지막_종_기회_뒤에_끝난다() {
        engine.create(GAME, "table", List.of(A, B, C));
        clock.set(START.plusSeconds(280));

        engine.graceExpired(new GraceExpiration(UUID.randomUUID(), B, GAME, START, START.plusSeconds(276),
                Action.ELIMINATE));
        JsonNode afterGrace = state();
        clock.set(START.plusSeconds(281));
        engine.tick();

        GameFinished finished = only(GameFinished.class);
        assertThat(afterGrace.path("status").asText()).isEqualTo("PLAYING");
        assertThat(afterGrace.path("turnUserId").asText()).isEqualTo("303");
        assertThat(afterGrace.path("flipDeadline").asText()).isEqualTo(START.plusSeconds(281).toString());
        assertThat(state().path("endReason").asText()).isEqualTo("NO_CARDS_TO_FLIP");
        assertThat(state().path("winnerUserIds").toString()).isEqualTo("[\"101\"]");
        assertThat(finished.endedAt()).isEqualTo(START.plusSeconds(281));
        assertThat(finished.participants()).extracting(GameFinished.Participant::result).containsExactly(
                GameFinished.Result.WIN, GameFinished.Result.FORFEIT, GameFinished.Result.LOSE);
        assertThat(finished.participants().get(1).leaveReason()).isEqualTo(GameDepartureReason.DISCONNECT_TIMEOUT);
        assertThat(totalCards()).isEqualTo(56);
    }

    // 지정한 위치에 카드를 두고 나머지는 기본 순서로 채운다. 좌석 s의 k번째 공개 카드는 위치 s + k × 인원이다.
    private void arrange(List<FruitCard> cards) {
        List<FruitCard> rest = new ArrayList<>(HalliGalliDeck.standard());
        rest.removeAll(fixed.values());
        for (int index = 0; index < cards.size(); index++) {
            cards.set(index, fixed.containsKey(index) ? fixed.get(index) : rest.removeFirst());
        }
    }

    private static FruitCard card(FruitType fruit, int count) {
        return HalliGalliDeck.standard().stream().filter(card -> card.fruit() == fruit && card.count() == count)
                .findFirst().orElseThrow();
    }

    private JsonNode state() { return engine.load(A, GAME).orElseThrow().publicState(); }
    private JsonNode player(int seat) { return state().path("players").get(seat); }
    private long version() { return engine.load(A, GAME).orElseThrow().version(); }

    private int totalCards() {
        return StreamSupport.stream(state().path("players").spliterator(), false)
                .mapToInt(player -> player.path("cardCount").asInt()).sum()
                - state().path("issuedPenaltyCards").asInt();
    }

    private <T> T only(Class<T> type) {
        assertThat(events).filteredOn(type::isInstance).hasSize(1);
        return events.stream().filter(type::isInstance).map(type::cast).findFirst().orElseThrow();
    }

    private static List<String> fields(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private JsonNode flipInput() { return mapper.valueToTree(Map.of("kind", "flip")); }
    private JsonNode ringInput(long window) { return mapper.valueToTree(Map.of("kind", "ring", "bellWindowId", window)); }

    private GameActionResult flip(long user, String id) { return act(user, id, version(), flipInput()); }
    private GameActionResult ring(long user, String id, long window) { return act(user, id, version(), ringInput(window)); }

    private GameActionResult act(long user, String id, long version, JsonNode input) {
        return router.apply(command(user, id, version, input));
    }

    private static GameActionCommand command(long user, String id, long version, JsonNode input) {
        return new GameActionCommand(user, GAME, id, version, input);
    }

    private static String outcome(Callable<GameActionResult> action) throws Exception {
        try {
            action.call();
            return "ACCEPTED";
        } catch (Rejected rejected) {
            return rejected.reason().name();
        }
    }

    // 두 작업을 같은 출발 신호로 동시에 시작한다. 순서와 무관하게 성립해야 하는 결과만 검증한다.
    @SafeVarargs
    private static List<String> race(Callable<String>... tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.length);
        try {
            CountDownLatch ready = new CountDownLatch(tasks.length);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<String>> futures = new ArrayList<>();
            for (Callable<String> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            ready.await();
            go.countDown();
            List<String> results = new ArrayList<>();
            for (Future<String> future : futures) { results.add(future.get()); }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private static void reject(Rejection reason, ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class,
                rejected -> assertThat(rejected.reason()).isEqualTo(reason));
    }

    static final class TestClock extends Clock {
        private volatile Instant now = START;
        void set(Instant value) { now = value; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
