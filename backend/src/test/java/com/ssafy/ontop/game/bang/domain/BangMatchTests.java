package com.ssafy.ontop.game.bang.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BangMatchTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");

    @Test
    void 기본판_덱은_문양과_숫자가_있는_서로_다른_80장이다() {
        var deck = BangCard.deck();

        assertThat(deck).hasSize(80);
        assertThat(deck.stream().map(BangCard::id)).doesNotHaveDuplicates();
        assertThat(deck.stream().filter(card -> card.kind() == BangCard.Kind.BANG)).hasSize(25);
        assertThat(deck.stream().filter(card -> card.kind() == BangCard.Kind.MISSED)).hasSize(12);
        assertThat(deck.stream().filter(card -> card.kind() == BangCard.Kind.BEER)).hasSize(6);
    }

    @Test
    void 인원별_역할과_보안관_추가_생명력을_적용한다() {
        for (int count = 4; count <= 7; count++) {
            BangMatch match = match(count, count);
            JsonNode state = match.publicState();
            List<BangMatch.Role> roles = BangMatch.roles(count);

            assertThat(roles).hasSize(count);
            assertThat(roles.stream().filter(role -> role == BangMatch.Role.SHERIFF)).hasSize(1);
            assertThat(roles.stream().filter(role -> role == BangMatch.Role.RENEGADE)).hasSize(1);
            assertThat(roles.stream().filter(role -> role == BangMatch.Role.OUTLAW)).hasSize(count >= 6 ? 3 : 2);
            int revealed = 0;
            for (JsonNode player : state.path("players")) {
                if (player.path("role").asText().equals("SHERIFF")) {
                    revealed++;
                    assertThat(player.path("maxHp").asInt()).isEqualTo(BangCharacter.valueOf(player.path("character").asText()).life() + 1);
                    assertThat(player.path("userId").asText()).isEqualTo(state.path("turnUserId").asText());
                }
            }
            assertThat(revealed).isEqualTo(1);
        }
    }

    @Test
    void 역할과_손패는_본인만_볼_수_있고_관전자는_빈_개인상태를_받는다() {
        BangMatch match = match(7, 10);

        assertThat(match.privateState(999)).isEmpty();
        for (long user : match.users()) {
            assertThat(match.privateState(user).path("userId").asText()).isEqualTo(Long.toString(user));
            assertThat(match.privateState(user).path("hand").isArray()).isTrue();
        }
        assertThat(match.publicState().toString()).doesNotContain("\"hand\"", "\"choices\"", "\"actions\"");
    }

    @Test
    void 같은_행동은_멱등하고_다른_내용과_낡은_버전은_거절한다() {
        BangMatch match = match(4, 12);
        long actor = match.publicState().path("actorUserId").asLong();
        JsonNode input = match.actions(actor).getFirst();
        GameActionCommand command = new GameActionCommand(actor, "bang-test", "same", 0, input);

        var first = match.apply(command, now.plusSeconds(1));

        assertThat(match.apply(command, now.plusSeconds(2))).isEqualTo(first);
        assertThatThrownBy(() -> match.apply(new GameActionCommand(actor, "bang-test", "same", 0,
                mapper.createObjectNode().put("kind", "unknown")), now)).isInstanceOf(Rejected.class)
                .hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> match.apply(new GameActionCommand(actor, "bang-test", "stale", 0, input), now))
                .isInstanceOf(Rejected.class).hasMessage("STALE_VERSION");
    }

    @Test
    void 비참가자와_허용되지_않은_입력은_상태를_바꾸지_못한다() {
        BangMatch match = match(4, 42);
        String before = match.publicState().toString();

        assertThatThrownBy(() -> match.apply(new GameActionCommand(999, "bang-test", "attack", 0,
                mapper.createObjectNode().put("kind", "end_turn")), now)).isInstanceOf(Rejected.class)
                .hasMessage("ACCESS_DENIED");
        long actor = match.publicState().path("actorUserId").asLong();
        assertThatThrownBy(() -> match.apply(new GameActionCommand(actor, "bang-test", "attack", 0,
                mapper.createObjectNode().put("kind", "play").put("cardId", "not-mine")), now)).isInstanceOf(Rejected.class);
        assertThat(match.publicState().toString()).isEqualTo(before);
    }

    @Test
    void 결정적_다인_경기에서_모든_단계를_진행하고_카드를_복제하거나_잃지_않는다() {
        for (int count = 4; count <= 7; count++) {
            for (int seed = 0; seed < 12; seed++) {
                BangMatch match = match(count, seed);
                Random random = new Random(seed);
                for (int step = 0; step < 2500 && match.endedAt() == null; step++) {
                    JsonNode state = match.publicState();
                    long actor = state.path("actorUserId").asLong();
                    var actions = match.actions(actor);
                    assertThat(actions).as("count=%s seed=%s step=%s state=%s", count, seed, step, state).isNotEmpty();
                    var choices = actions.stream().filter(action -> !action.path("kind").asText().equals("sid_heal")).toList();
                    var selected = choices.get(random.nextInt(choices.size()));
                    if (random.nextInt(3) == 0) {
                        selected = choices.stream().filter(action -> Set.of("take_hit", "give_up", "end_turn")
                                .contains(action.path("kind").asText())).findFirst().orElse(selected);
                    }
                    match.apply(new GameActionCommand(actor, "bang-test", "action-" + step, match.version(), selected),
                            now.plusMillis(step));
                    Set<String> visible = new HashSet<>();
                    for (long user : match.users()) {
                        for (JsonNode card : match.privateState(user).path("hand")) {
                            assertThat(visible.add(card.path("id").asText())).isTrue();
                        }
                    }
                    for (JsonNode player : match.publicState().path("players")) {
                        for (JsonNode card : player.path("equipment")) {
                            assertThat(visible.add(card.path("id").asText())).isTrue();
                        }
                        assertThat(player.path("hp").asInt()).isLessThanOrEqualTo(player.path("maxHp").asInt());
                    }
                }
                assertThat(match.endedAt()).as("count=%s seed=%s", count, seed).isNotNull();
                assertThat(match.winners()).isNotEmpty();
            }
        }
    }

    @Test
    void 시간_만료와_기권을_반복해도_종료한_경기는_다시_변하지_않는다() {
        BangMatch match = match(7, 9);
        match.expire(now.plusSeconds(61));
        assertThat(match.version()).isPositive();
        for (long user : new ArrayList<>(match.users())) { match.forfeit(user, now.plusSeconds(62)); }
        long version = match.version();

        match.expire(now.plusSeconds(500));
        match.forfeit(1, now.plusSeconds(501));

        assertThat(match.endedAt()).isNotNull();
        assertThat(match.version()).isEqualTo(version);
    }

    private BangMatch match(int count, int seed) {
        List<Long> users = java.util.stream.LongStream.rangeClosed(1, count).boxed().toList();
        return new BangMatch("bang-test", "table-1", users, mapper, new Random(seed), now);
    }
}
