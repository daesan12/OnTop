package com.ssafy.ontop.game.rummikub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.rummikub.domain.RummikubMatch;
import com.ssafy.ontop.game.rummikub.domain.RummikubRules;
import com.ssafy.ontop.game.rummikub.domain.RummikubRules.Placed;
import com.ssafy.ontop.game.rummikub.domain.RummikubTile;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RummikubMatchTests {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-11-21T00:00:00Z");

    @Test
    void 타일은_106개이며_4인에게_14개씩_나눈다() {
        var match = new RummikubMatch("game", "table", List.of(1L, 2L, 3L, 4L), RummikubTile.deck(), 0, NOW);

        assertThat(RummikubTile.deck()).hasSize(106).doesNotHaveDuplicates();
        assertThat(match.snapshot().poolCount()).isEqualTo(50);
        assertThat(match.snapshot().playerViews()).allMatch(player -> player.tileCount() == 14);
        assertThat(RummikubTile.deck().stream().filter(RummikubTile::joker)).hasSize(2);
    }

    @Test
    void 네명의_차례는_좌석순으로_순환하고_기권자를_건너뛴다() {
        var match = new RummikubMatch("game", "table", List.of(1L, 2L, 3L, 4L), RummikubTile.deck(), 0, NOW);
        for (long user = 1; user <= 4; user++) { draw(match, user); }
        assertThat(match.snapshot().turnUserId()).isEqualTo(1);
        assertThat(match.snapshot().playerViews()).allMatch(player -> player.tileCount() == 15);
        match.forfeit(2, NOW);
        draw(match, 1);
        assertThat(match.snapshot().turnUserId()).isEqualTo(3);
        assertThat(match.snapshot().winnerUserIds()).isEmpty();
    }

    @Test
    void 그룹은_서로_다른_색_3개_또는_4개다() {
        assertThat(RummikubRules.validMeld(group(10))).isTrue();
        assertThat(RummikubRules.validMeld(List.of(p("RED", 7), p("RED", 7, 1), p("BLUE", 7)))).isFalse();
        assertThat(RummikubRules.validMeld(List.of(p("RED", 7), p("BLUE", 7)))).isFalse();
    }

    @Test
    void 런은_같은_색_연속_숫자이며_13에서_순환하지_않는다() {
        assertThat(RummikubRules.validMeld(run("RED", 11, 13))).isTrue();
        assertThat(RummikubRules.validMeld(List.of(p("RED", 12), p("RED", 13), p("RED", 1)))).isFalse();
        assertThat(RummikubRules.validMeld(List.of(p("RED", 3), p("BLUE", 4), p("RED", 5)))).isFalse();
    }

    @Test
    void 최초등록_30점_미만은_상태를_변경하지_않는다() {
        var match = match(run("RED", 1, 3), List.of());
        var before = match.snapshot();

        assertThatThrownBy(() -> play(match, 1, List.of(run("RED", 1, 3)))).isInstanceOf(Rejected.class);
        assertThat(match.snapshot()).isEqualTo(before);
        assertThat(match.hand(1)).hasSize(14);
    }

    @Test
    void 여러_조합으로_30점을_등록할_수_있다() {
        List<Placed> tiles = new ArrayList<>(run("RED", 3, 5));
        tiles.addAll(run("BLUE", 5, 7));
        var match = match(tiles, List.of());

        play(match, 1, List.of(run("RED", 3, 5), run("BLUE", 5, 7)));

        assertThat(match.snapshot().playerViews().getFirst().registered()).isTrue();
        assertThat(match.hand(1)).hasSize(8);
    }

    @Test
    void 조커는_대신하는_숫자로_최초등록_점수를_계산한다() {
        var meld = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var match = match(meld, List.of());

        play(match, 1, List.of(meld));

        assertThat(match.snapshot().melds()).containsExactly(meld);
    }

    @Test
    void 최초등록_턴에는_기존_조합을_바꿀_수_없다() {
        var match = match(group(10), List.of(p("YELLOW", 10), p("YELLOW", 11), p("YELLOW", 12)));
        play(match, 1, List.of(group(10)));
        var modified = new ArrayList<>(group(10));
        modified.add(p("YELLOW", 10));
        var before = match.snapshot();

        assertThatThrownBy(() -> play(match, 2, List.of(modified))).isInstanceOf(Rejected.class);
        assertThat(match.snapshot()).isEqualTo(before);
    }

    @Test
    void 공개_타일_누락과_중복과_다른_사람의_타일은_거절한다() {
        var match = match(group(10), group(11));
        play(match, 1, List.of(group(10)));
        var before = match.snapshot();

        assertThatThrownBy(() -> play(match, 2, List.of(group(11)))).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> play(match, 2, List.of(group(10), group(10), group(11)))).isInstanceOf(Rejected.class);
        assertThat(match.snapshot()).isEqualTo(before);
    }

    @Test
    void 등록_이후에는_공개_타일을_분해하고_모든_묶음을_완성한다() {
        List<Placed> own = new ArrayList<>(group(10));
        own.addAll(List.of(p("RED", 9), p("RED", 11), p("YELLOW", 10)));
        var match = match(own, group(12));
        play(match, 1, List.of(group(10)));
        play(match, 2, List.of(group(10), group(12)));
        var run = List.of(p("RED", 9), p("RED", 10), p("RED", 11));
        var group = List.of(p("BLUE", 10), p("BLACK", 10), p("YELLOW", 10));

        play(match, 1, List.of(run, group, group(12)));

        assertThat(match.snapshot().melds()).containsExactly(run, group, group(12));
        assertThat(match.hand(1)).hasSize(8);
    }

    @Test
    void 손패를_내지_않은_재배열만으로_턴을_마칠_수_없다() {
        var match = match(group(10), group(11));
        play(match, 1, List.of(group(10)));
        play(match, 2, List.of(group(10), group(11)));

        assertThatThrownBy(() -> play(match, 1, List.of(group(11), group(10)))).isInstanceOf(Rejected.class);
    }

    @Test
    void 조커_회수에는_손패의_실제_타일과_다른_묶음_즉시사용이_필요하다() {
        var jokerGroup = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var own = new ArrayList<>(jokerGroup);
        own.addAll(List.of(p("BLACK", 10), p("YELLOW", 4), p("YELLOW", 6)));
        var match = match(own, group(12));
        play(match, 1, List.of(jokerGroup));
        play(match, 2, List.of(jokerGroup, group(12)));
        var replaced = List.of(p("RED", 10), p("BLUE", 10), p("BLACK", 10));
        var reused = List.of(p("YELLOW", 4), new Placed("JOKER-0", "YELLOW", 5), p("YELLOW", 6));

        play(match, 1, List.of(replaced, group(12), reused));

        assertThat(match.snapshot().melds()).contains(reused);
        assertThat(match.hand(1)).noneMatch(RummikubTile::joker);
    }

    @Test
    void 조커_교체_타일_없이_회수하면_거절한다() {
        var jokerGroup = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var own = new ArrayList<>(jokerGroup);
        own.addAll(List.of(p("YELLOW", 10), p("YELLOW", 4), p("YELLOW", 6)));
        var match = match(own, group(12));
        play(match, 1, List.of(jokerGroup));
        play(match, 2, List.of(jokerGroup, group(12)));

        assertThatThrownBy(() -> play(match, 1, List.of(List.of(p("RED", 10), p("BLUE", 10), p("YELLOW", 10)),
                group(12), List.of(p("YELLOW", 4), new Placed("JOKER-0", "YELLOW", 5), p("YELLOW", 6)))))
                .isInstanceOf(Rejected.class);
    }

    @Test
    void 여러_묶음의_순서를_바꾸고_조커_묶음에_붙여도_교체_타일을_요구하지_않는다() {
        var jokerGroup = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var own = new ArrayList<>(jokerGroup);
        own.add(p("YELLOW", 10));
        var match = match(own, group(12));
        play(match, 1, List.of(jokerGroup));
        play(match, 2, List.of(jokerGroup, group(12)));
        var extended = new ArrayList<>(jokerGroup);
        extended.add(p("YELLOW", 10));

        play(match, 1, List.of(group(12), extended));

        assertThat(match.snapshot().melds()).containsExactly(group(12), extended);
        assertThat(match.hand(1)).hasSize(10);
    }

    @Test
    void 두_조커가_각각_기존_묶음에_남으면_새_묶음이_추가되어도_교체를_요구하지_않는다() {
        var jokerGroup = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var jokerRun = List.of(p("BLUE", 10, 1), new Placed("JOKER-1", "BLUE", 11), p("BLUE", 12));
        var own = new ArrayList<>(jokerGroup);
        own.addAll(jokerRun);
        own.addAll(run("RED", 4, 6));
        var match = match(own, group(13));
        play(match, 1, List.of(jokerGroup, jokerRun));
        play(match, 2, List.of(jokerGroup, jokerRun, group(13)));

        play(match, 1, List.of(group(13), jokerRun, run("RED", 4, 6), jokerGroup));

        assertThat(match.snapshot().melds()).containsExactly(group(13), jokerRun, run("RED", 4, 6), jokerGroup);
        assertThat(match.hand(1)).hasSize(5);
    }

    @Test
    void 한_조커만_교체할_때_다른_조커의_묶음에는_교체를_요구하지_않는다() {
        var jokerGroup = List.of(p("RED", 10), p("BLUE", 10), new Placed("JOKER-0", "BLACK", 10));
        var jokerRun = List.of(p("BLUE", 10, 1), new Placed("JOKER-1", "BLUE", 11), p("BLUE", 12));
        var own = new ArrayList<>(jokerGroup);
        own.addAll(jokerRun);
        own.addAll(List.of(p("BLACK", 10), p("YELLOW", 4), p("YELLOW", 6)));
        var match = match(own, group(13));
        play(match, 1, List.of(jokerGroup, jokerRun));
        play(match, 2, List.of(jokerGroup, jokerRun, group(13)));
        var reused = List.of(p("YELLOW", 4), new Placed("JOKER-0", "YELLOW", 5), p("YELLOW", 6));

        play(match, 1, List.of(jokerRun, group(13), reused, group(10)));

        assertThat(match.snapshot().melds()).containsExactly(jokerRun, group(13), reused, group(10));
        assertThat(match.hand(1)).hasSize(5);
    }

    @Test
    void 뽑기는_한개만_지급하고_즉시_다음_차례로_넘긴다() {
        var match = match(List.of(), List.of());
        draw(match, 1);

        assertThat(match.hand(1)).hasSize(15);
        assertThat(match.snapshot().poolCount()).isEqualTo(77);
        assertThat(match.snapshot().turnUserId()).isEqualTo(2);
    }

    @Test
    void 같은_행동은_멱등적이고_같은_ID의_다른_내용은_거절한다() {
        var match = match(List.of(), List.of());
        var command = new GameActionCommand(1, "game", "same", 0, MAPPER.valueToTree(Map.of("kind", "draw")));
        var result = match.apply(command, NOW);

        assertThat(match.apply(command, NOW)).isEqualTo(result);
        assertThat(match.hand(1)).hasSize(15);
        assertThatThrownBy(() -> match.apply(new GameActionCommand(1, "game", "same", 1,
                MAPPER.valueToTree(Map.of("kind", "draw"))), NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 다른_차례와_낡은_버전과_비참가자_입력은_거절한다() {
        var match = match(List.of(), List.of());
        assertThatThrownBy(() -> draw(match, 2)).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> draw(match, 99)).isInstanceOf(Rejected.class);
        draw(match, 1);
        assertThatThrownBy(() -> match.apply(new GameActionCommand(2, "game", "old", 0,
                MAPPER.valueToTree(Map.of("kind", "draw"))), NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 제한시간은_60초이며_초과시_벌칙_3개를_중복없이_받는다() {
        var match = match(List.of(), List.of());
        match.expire(NOW.plusSeconds(59));
        assertThat(match.hand(1)).hasSize(14);
        match.expire(NOW.plusSeconds(60));
        match.expire(NOW.plusSeconds(60));

        assertThat(match.hand(1)).hasSize(17);
        assertThat(match.snapshot().poolCount()).isEqualTo(75);
        assertThat(match.snapshot().version()).isEqualTo(1);
        assertThat(match.snapshot().lastEvent()).isEqualTo("TURN_TIMEOUT");
    }

    @Test
    void 시간초과_뒤_도착한_미완성_판은_반영하지_않고_기존_조합을_유지한다() {
        var match = match(group(10), group(11));
        play(match, 1, List.of(group(10)));
        var board = match.snapshot().melds();
        var late = new GameActionCommand(2, "game", "late", match.snapshot().version(),
                MAPPER.valueToTree(Map.of("kind", "play", "melds", List.of(group(11)))));

        assertThatThrownBy(() -> match.apply(late, NOW.plusSeconds(60))).isInstanceOf(Rejected.class);

        assertThat(match.snapshot().melds()).isEqualTo(board);
        assertThat(match.hand(2)).hasSize(17);
        assertThat(match.snapshot().turnUserId()).isEqualTo(1);
    }

    @Test
    void 마지막_타일을_내면_승리하고_잔여_조커는_30점이다() {
        var own = new ArrayList<>(run("RED", 1, 7));
        own.addAll(run("BLUE", 7, 13));
        var match = match(own, List.of(new Placed("JOKER-0", "BLACK", 1)));
        int penalty = match.hand(2).stream().mapToInt(RummikubTile::penalty).sum();

        play(match, 1, List.of(run("RED", 1, 7), run("BLUE", 7, 13)));

        assertThat(match.snapshot().winnerUserIds()).containsExactly(1L);
        assertThat(match.snapshot().endReason()).isEqualTo("EMPTY_HAND");
        assertThat(match.snapshot().playerViews().getFirst().score()).isEqualTo(penalty);
        assertThat(match.snapshot().playerViews().get(1).score()).isEqualTo(-penalty);
        assertThat(new RummikubTile("JOKER-0", null, 0).penalty()).isEqualTo(30);
    }

    @Test
    void 더미소진_뒤_전원에게_정확히_한_차례씩_더_준다() {
        var match = match(List.of(), List.of());
        for (int index = 0; index < 78; index++) { draw(match, match.snapshot().turnUserId()); }

        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(1L, 2L);
        assertThat(match.snapshot().endReason()).isNull();
        draw(match, 1);
        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(2L);
        assertThat(match.snapshot().endReason()).isNull();
        draw(match, 2);

        assertThat(match.snapshot().poolCount()).isZero();
        assertThat(match.snapshot().endReason()).isEqualTo("STALEMATE");
        assertThat(match.hand(1).size() + match.hand(2).size()).isEqualTo(106);
    }

    @Test
    void 마지막_차례에_타일을_내도_다른_사람의_차례만_남는다() {
        var match = match(group(10), List.of());
        for (int index = 0; index < 78; index++) { draw(match, match.snapshot().turnUserId()); }

        play(match, 1, List.of(group(10)));

        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(2L);
        draw(match, 2);
        assertThat(match.snapshot().endReason()).isEqualTo("STALEMATE");
        int lowest = match.snapshot().playerViews().stream().filter(p -> !p.forfeited())
                .mapToInt(p -> match.hand(p.userId()).stream().mapToInt(RummikubTile::penalty).sum()).min().orElseThrow();
        assertThat(match.snapshot().winnerUserIds()).allMatch(user -> match.hand(user).stream()
                .mapToInt(RummikubTile::penalty).sum() == lowest);
    }

    @Test
    void 벌칙_뽑기에서_더미가_부족하면_남은_타일만_받는다() {
        var match = match(List.of(), List.of());
        for (int index = 0; index < 77; index++) { draw(match, match.snapshot().turnUserId()); }
        long user = match.snapshot().turnUserId();
        int before = match.hand(user).size();

        match.expire(NOW.plusSeconds(60));

        assertThat(match.hand(user)).hasSize(before + 1);
        assertThat(match.snapshot().poolCount()).isZero();
        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(1L, 2L);
    }

    @Test
    void 마지막_차례의_기권자는_남은_차례에서_빠진다() {
        var match = new RummikubMatch("game", "table", List.of(1L, 2L, 3L, 4L), RummikubTile.deck(), 0, NOW);
        for (int index = 0; index < 50; index++) { draw(match, match.snapshot().turnUserId()); }
        assertThat(match.snapshot().turnUserId()).isEqualTo(3);
        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(1L, 2L, 3L, 4L);

        match.forfeit(3, NOW);

        assertThat(match.snapshot().finalTurnUserIds()).containsExactly(1L, 2L, 4L);
        assertThat(match.snapshot().turnUserId()).isEqualTo(4);
    }

    @Test
    void 기권은_중복처리되지_않고_마지막_참가자가_승리한다() {
        var match = match(List.of(), List.of());
        match.forfeit(1, NOW);
        match.forfeit(1, NOW);

        assertThat(match.snapshot().winnerUserIds()).containsExactly(2L);
        assertThat(match.snapshot().version()).isEqualTo(1);
    }

    static RummikubMatch match(List<Placed> first, List<Placed> second) {
        List<RummikubTile> all = RummikubTile.deck();
        var ids = new ArrayList<String>();
        ids.addAll(first.stream().map(Placed::id).toList());
        ids.addAll(second.stream().map(Placed::id).toList());
        List<RummikubTile> ordered = new ArrayList<>();
        for (var wanted : List.of(first, second)) {
            var hand = new ArrayList<>(wanted.stream().map(p -> all.stream()
                    .filter(t -> t.id().equals(p.id())).findFirst().orElseThrow()).toList());
            all.stream().filter(t -> !ids.contains(t.id())).limit(14 - hand.size()).forEach(t -> {
                hand.add(t); ids.add(t.id());
            });
            ordered.addAll(hand);
        }
        all.stream().filter(t -> !ids.contains(t.id())).forEach(ordered::add);
        return new RummikubMatch("game", "table", List.of(1L, 2L), ordered, 0, NOW);
    }

    static Placed p(String color, int number) { return p(color, number, 0); }
    static Placed p(String color, int number, int copy) { return new Placed(color + "-" + number + "-" + copy, color, number); }
    static List<Placed> group(int number) { return List.of(p("RED", number), p("BLUE", number), p("BLACK", number)); }
    static List<Placed> run(String color, int from, int to) {
        List<Placed> tiles = new ArrayList<>();
        for (int number = from; number <= to; number++) { tiles.add(p(color, number)); }
        return tiles;
    }
    static void play(RummikubMatch match, long user, List<List<Placed>> board) {
        match.apply(new GameActionCommand(user, "game", UUID.randomUUID().toString(), match.snapshot().version(),
                MAPPER.valueToTree(Map.of("kind", "play", "melds", board))), NOW);
    }
    static void draw(RummikubMatch match, long user) {
        match.apply(new GameActionCommand(user, "game", UUID.randomUUID().toString(), match.snapshot().version(),
                MAPPER.valueToTree(Map.of("kind", "draw"))), NOW);
    }
}
