package com.ssafy.ontop.game.bang.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BangRulesTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");
    private int sequence;

    @Test
    void 슬랩의_뱅은_방어_두_장이_필요하고_일반_뱅은_한_턴_한_장이다() {
        BangMatch match = scenario(BangCharacter.SLAB_THE_KILLER, List.of(BangCard.Kind.BANG, BangCard.Kind.BANG),
                List.of(BangCard.Kind.MISSED, BangCard.Kind.MISSED));
        act(match, 1, action(match, 1, "play", "BANG", "2"));

        assertThat(match.publicState().path("response").path("remaining").asInt()).isEqualTo(2);
        act(match, 2, action(match, 2, "respond", "MISSED", null));
        assertThat(match.publicState().path("phase").asText()).isEqualTo("RESPONSE");
        assertThat(match.publicState().path("response").path("remaining").asInt()).isEqualTo(1);
        act(match, 2, action(match, 2, "respond", "MISSED", null));

        assertThat(match.publicState().path("phase").asText()).isEqualTo("PLAY");
        assertThat(match.publicState().path("players").get(1).path("hp").asInt()).isEqualTo(4);
        assertThat(match.actions(1)).noneMatch(input -> input.path("kind").asText().equals("play")
                && kind(match, 1, input.path("cardId").asText()).equals("BANG"));
    }

    @Test
    void 윌리는_연속_뱅을_쓸_수_있지만_사거리는_그대로다() {
        BangMatch match = scenario(BangCharacter.WILLY_THE_KID, List.of(BangCard.Kind.BANG, BangCard.Kind.BANG), List.of());
        assertThat(match.actions(1)).noneMatch(input -> input.path("targetUserId").asText().equals("3")
                && kind(match, 1, input.path("cardId").asText()).equals("BANG"));
        act(match, 1, action(match, 1, "play", "BANG", "2"));
        act(match, 2, action(match, 2, "take_hit", null, null));

        assertThat(match.actions(1)).anyMatch(input -> input.path("kind").asText().equals("play")
                && kind(match, 1, input.path("cardId").asText()).equals("BANG"));
    }

    @Test
    void 무기를_교체하면_기존_무기를_버리고_장비만_있어도_기본_사거리_1을_유지한다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY,
                List.of(BangCard.Kind.BARREL, BangCard.Kind.SCHOFIELD, BangCard.Kind.WINCHESTER), List.of());
        act(match, 1, action(match, 1, "play", "BARREL", null));
        assertThat(match.publicState().path("players").get(0).path("range").asInt()).isEqualTo(1);
        act(match, 1, action(match, 1, "play", "SCHOFIELD", null));
        act(match, 1, action(match, 1, "play", "WINCHESTER", null));

        JsonNode player = match.publicState().path("players").get(0);
        assertThat(player.path("range").asInt()).isEqualTo(5);
        assertThat(player.path("equipment").toString()).contains("BARREL", "WINCHESTER").doesNotContain("SCHOFIELD");
    }

    @Test
    void 보안관에게_감옥을_설치할_수_없고_감옥은_자신의_턴_시작에_제거된다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY, List.of(BangCard.Kind.JAIL), List.of());
        assertThat(match.actions(1)).noneMatch(input -> input.path("targetUserId").asText().equals("1"));
        act(match, 1, action(match, 1, "play", "JAIL", "2"));
        finishTurn(match, 1);

        assertThat(match.publicState().path("players").get(1).path("equipment").isEmpty()).isTrue();
        assertThat(match.publicState().path("turnUserId").asText()).isIn("2", "3");
    }

    @Test
    void 맥주는_최대_생명력을_넘지_않고_마지막_두_명에게_회복을_주지_않는다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY, List.of(BangCard.Kind.BEER, BangCard.Kind.BEER), List.of());
        act(match, 1, action(match, 1, "play", "BEER", null));
        assertThat(match.publicState().path("players").get(0).path("hp").asInt()).isEqualTo(5);
        match.forfeit(2, now);
        match.forfeit(3, now);
        assertThat(match.endedAt()).isNull();
        act(match, 1, action(match, 1, "play", "BEER", null));

        assertThat(match.publicState().path("players").get(0).path("hp").asInt()).isEqualTo(5);
        assertThat(match.privateState(1).path("hand").toString()).doesNotContain("BEER");
    }

    @Test
    void 백화점은_사용자부터_시계_방향으로_한_장씩_선택한다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY, List.of(BangCard.Kind.GENERAL_STORE), List.of());
        act(match, 1, action(match, 1, "play", "GENERAL_STORE", null));

        for (long user = 1; user <= 4; user++) {
            assertThat(match.publicState().path("actorUserId").asLong()).isEqualTo(user);
            assertThat(match.publicState().path("store")).hasSize(5 - (int) user);
            act(match, user, action(match, user, "choose", null, null));
        }

        assertThat(match.publicState().path("phase").asText()).isEqualTo("PLAY");
        assertThat(match.publicState().path("store").isEmpty()).isTrue();
    }

    @Test
    void 감옥에_있어도_응답하고_탈락자는_거리에서_제외한다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY, List.of(BangCard.Kind.JAIL, BangCard.Kind.BANG), List.of(BangCard.Kind.MISSED));
        act(match, 1, action(match, 1, "play", "JAIL", "2"));
        act(match, 1, action(match, 1, "play", "BANG", "2"));
        act(match, 2, action(match, 2, "respond", "MISSED", null));
        assertThat(match.distance(1, 3)).isEqualTo(2);

        match.forfeit(2, now);

        assertThat(match.distance(1, 3)).isEqualTo(1);
    }

    @Test
    void 결투_도중_공격자가_기권해도_응답_대기에서_멈추지_않는다() {
        BangMatch match = scenario(BangCharacter.BART_CASSIDY, List.of(BangCard.Kind.DUEL), List.of(BangCard.Kind.BANG));
        // 보안관 기권은 즉시 종료하므로 먼저 상대가 결투에 응답한 뒤 그 상대를 기권 처리한다.
        act(match, 1, action(match, 1, "play", "DUEL", "2"));
        act(match, 2, action(match, 2, "respond", "BANG", null));

        match.forfeit(2, now);

        assertThat(match.publicState().path("phase").asText()).isNotEqualTo("RESPONSE");
        assertThat(match.actions(1)).isNotEmpty();
    }

    @Test
    void 수지는_마지막_결투가_해결된_뒤에_빈_손패를_보충한다() {
        BangMatch match = arranged(BangCharacter.SUZY_LAFAYETTE,
                List.of(BangCard.Kind.BARREL, BangCard.Kind.SCOPE, BangCard.Kind.MUSTANG,
                        BangCard.Kind.SCHOFIELD, BangCard.Kind.DUEL),
                List.of(BangCard.Kind.BANG, BangCard.Kind.MISSED, BangCard.Kind.MISSED, BangCard.Kind.MISSED),
                List.of(BangCard.Kind.WINCHESTER, BangCard.Kind.REMINGTON));
        for (String kind : List.of("BARREL", "SCOPE", "MUSTANG", "SCHOFIELD", "WINCHESTER", "REMINGTON")) {
            act(match, 1, action(match, 1, "play", kind, null));
        }
        act(match, 1, action(match, 1, "play", "DUEL", "2"));
        assertThat(match.privateState(1).path("hand")).isEmpty();
        act(match, 2, action(match, 2, "respond", "BANG", null));
        assertThat(match.privateState(1).path("hand")).isEmpty();
        act(match, 1, action(match, 1, "take_hit", null, null));
        assertThat(match.privateState(1).path("hand")).hasSize(1);
    }

    @Test
    void 결투를_시작한_엘_그링고는_자신이_패해도_상대_카드를_가져오지_않는다() {
        BangMatch match = arranged(BangCharacter.EL_GRINGO,
                List.of(BangCard.Kind.DUEL, BangCard.Kind.BEER, BangCard.Kind.BEER, BangCard.Kind.MISSED),
                List.of(BangCard.Kind.BANG, BangCard.Kind.MISSED, BangCard.Kind.MISSED, BangCard.Kind.MISSED),
                List.of(BangCard.Kind.BEER, BangCard.Kind.MISSED));
        act(match, 1, action(match, 1, "play", "DUEL", "2"));
        act(match, 2, action(match, 2, "respond", "BANG", null));
        int opponentCards = match.privateState(2).path("hand").size();
        act(match, 1, action(match, 1, "take_hit", null, null));
        assertThat(match.privateState(2).path("hand")).hasSize(opponentCards);
    }

    @Test
    void 바트는_치명상_보충으로_맥주를_얻어_살아날_수_없다() {
        BangMatch match = arranged(BangCharacter.WILLY_THE_KID,
                java.util.Collections.nCopies(5, BangCard.Kind.BANG),
                java.util.Collections.nCopies(4, BangCard.Kind.MISSED),
                List.of(BangCard.Kind.BANG, BangCard.Kind.BANG, BangCard.Kind.BANG,
                        BangCard.Kind.BANG, BangCard.Kind.BANG, BangCard.Kind.BEER));
        for (int shot = 0; shot < 4; shot++) {
            act(match, 1, action(match, 1, "play", "BANG", "2"));
            act(match, 2, action(match, 2, "take_hit", null, null));
        }
        assertThat(match.publicState().path("players").get(1).path("active").asBoolean()).isFalse();
        assertThat(match.publicState().path("phase").asText()).isNotEqualTo("RESCUE");
    }

    private BangMatch arranged(BangCharacter first, List<BangCard.Kind> own,
            List<BangCard.Kind> second, List<BangCard.Kind> next) {
        List<BangCard> pool = new ArrayList<>(BangCard.deck()), deck = new ArrayList<>();
        List<BangCard.Kind> plan = new ArrayList<>(own);
        plan.addAll(second);
        plan.addAll(java.util.Collections.nCopies(8, BangCard.Kind.BANG));
        plan.addAll(next);
        for (BangCard.Kind kind : plan) {
            BangCard selected = pool.stream().filter(card -> card.kind() == kind).findFirst().orElseThrow();
            pool.remove(selected);
            deck.add(selected);
        }
        deck.addAll(pool);
        return new BangMatch("rules", "table", List.of(1L, 2L, 3L, 4L), mapper, new Random(3), now,
                List.of(BangMatch.Role.SHERIFF, BangMatch.Role.OUTLAW, BangMatch.Role.OUTLAW, BangMatch.Role.RENEGADE),
                List.of(first, BangCharacter.BART_CASSIDY, BangCharacter.SUZY_LAFAYETTE, BangCharacter.WILLY_THE_KID), deck);
    }

    private BangMatch scenario(BangCharacter first, List<BangCard.Kind> own, List<BangCard.Kind> second) {
        List<BangCard> pool = new ArrayList<>(BangCard.deck()), deck = new ArrayList<>();
        for (int player = 0; player < 4; player++) {
            List<BangCard.Kind> opening = player == 0 ? own : player == 1 ? second : List.of();
            for (BangCard.Kind kind : opening) {
                BangCard selected = pool.stream().filter(card -> card.kind() == kind).findFirst().orElseThrow();
                pool.remove(selected); deck.add(selected);
            }
            int life = player == 0 ? first.life() + 1 : 4;
            while (deck.size() < (player == 0 ? life : first.life() + 1 + player * 4)) { deck.add(pool.removeFirst()); }
        }
        deck.addAll(pool);
        List<BangCharacter> characters = List.of(first, BangCharacter.BART_CASSIDY, BangCharacter.SUZY_LAFAYETTE, BangCharacter.WILLY_THE_KID);
        return new BangMatch("rules", "table", List.of(1L, 2L, 3L, 4L), mapper, new Random(3), now,
                List.of(BangMatch.Role.SHERIFF, BangMatch.Role.OUTLAW, BangMatch.Role.OUTLAW, BangMatch.Role.RENEGADE), characters, deck);
    }

    private String kind(BangMatch match, long user, String id) {
        for (JsonNode card : match.privateState(user).path("hand")) {
            if (card.path("id").asText().equals(id)) { return card.path("kind").asText(); }
        }
        return "";
    }

    private JsonNode action(BangMatch match, long user, String actionKind, String cardKind, String target) {
        return match.actions(user).stream().filter(input -> input.path("kind").asText().equals(actionKind)
                && (cardKind == null || kind(match, user, input.path("cardId").asText()).equals(cardKind))
                && (target == null || input.path("targetUserId").asText().equals(target))).findFirst().orElseThrow();
    }

    private void act(BangMatch match, long user, JsonNode input) {
        match.apply(new GameActionCommand(user, "rules", "a" + sequence++, match.version(), input), now);
    }

    private void finishTurn(BangMatch match, long user) {
        act(match, user, action(match, user, "end_turn", null, null));
        while (match.publicState().path("phase").asText().equals("DISCARD")) {
            act(match, user, action(match, user, "discard", null, null));
        }
    }
}
