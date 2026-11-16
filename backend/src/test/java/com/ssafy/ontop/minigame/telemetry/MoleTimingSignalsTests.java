package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.SplittableRandom;
import java.util.function.IntUnaryOperator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MoleTimingSignalsTests {
    /** 구간마다 0.9초 간격으로 30마리, 구멍을 돌아가며 0.8초씩 머문다. */
    private static List<MoleRules.Mole> moles(int perPhase) {
        var moles = new ArrayList<MoleRules.Mole>();
        for (int phase = 0; phase < 3; phase++) {
            for (int n = 0; n < perPhase; n++) {
                int appear = phase * MoleRules.PHASE_MS + 1_000 + n * 900;
                moles.add(new MoleRules.Mole(moles.size(), moles.size() % 6, MoleRules.Kind.NORMAL, 1, appear,
                        appear + 800));
            }
        }
        return moles;
    }

    private static List<MoleRules.Hit> hits(List<MoleRules.Mole> moles, IntUnaryOperator reactionOf) {
        return moles.stream().map(mole -> new MoleRules.Hit(mole.hole(), mole.appearAt()
                + reactionOf.applyAsInt(mole.id()))).toList();
    }

    @Test
    void 사람처럼_흔들리는_반응은_신호를_내지_않는다() {
        var random = new SplittableRandom(7);
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> 230 + random.nextInt(160)));

        assertThat(signals.reactions()).isEqualTo(90);
        assertThat(signals.medianReactionMs()).isBetween(280, 340);
        assertThat(signals.segments()).hasSize(3).allSatisfy(segment -> {
            assertThat(segment.samples()).isEqualTo(30);
            assertThat(segment.spreadMs()).isGreaterThan(MoleTimingSignals.STEADY_REACTION_MS);
        });
        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.steady()).isFalse();
    }

    @Test
    void 고정_지연으로_반응하면_일정한_반응으로_적발한다() {
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> 210 + id % 3));

        assertThat(signals.steady()).isTrue();
        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.segments()).allSatisfy(segment -> assertThat(segment.spreadMs()).isLessThanOrEqualTo(2));
    }

    @Test
    void 구간마다_지연을_바꿔도_구간_안에서_일정하면_적발한다() {
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> 200 + (id / 30) * 60 + id % 2));

        assertThat(signals.segments()).extracting(MoleTimingSignals.Segment::medianMs)
                .containsExactly(201, 261, 321);
        assertThat(signals.steady()).isTrue();
    }

    @Test
    void 두더지의_한_구간이_불규칙해도_두_구간의_반응이_일정하면_기록한다() {
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> id < 60 ? 250 + id % 3 : 250 + id % 5 * 30));

        assertThat(signals.segments().getLast().spreadMs()).isGreaterThan(MoleTimingSignals.STEADY_REACTION_MS);
        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.steady()).isTrue();
    }

    @Test
    void 반응_중앙값이_150ms보다_짧으면_초고속_반응으로_적발한다() {
        var random = new SplittableRandom(11);
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> 80 + random.nextInt(60)));

        assertThat(signals.medianReactionMs()).isLessThan(MoleTimingSignals.FAST_MEDIAN_MS);
        assertThat(signals.fastReaction()).isTrue();
        assertThat(signals.steady()).isFalse();
    }

    @Test
    void 표본이_부족하면_어느_신호도_내지_않는다() {
        var moles = moles(7);
        var signals = MoleTimingSignals.mole(moles, hits(moles, id -> 100));

        assertThat(signals.reactions()).isEqualTo(21);
        assertThat(signals.fastReaction()).isTrue();
        assertThat(signals.steady()).isFalse();

        var few = moles.subList(0, 19);
        assertThat(MoleTimingSignals.mole(few, hits(few, id -> 100)).fastReaction()).isFalse();
    }

    @Test
    void 치면_안_되는_친구와_같은_두더지의_두_번째_타격과_빈_구멍은_반응으로_세지_않는다() {
        var moles = List.of(new MoleRules.Mole(0, 0, MoleRules.Kind.NORMAL, 1, 1_000, 1_800),
                new MoleRules.Mole(1, 1, MoleRules.Kind.DECOY, 1, 1_000, 1_800),
                new MoleRules.Mole(2, 2, MoleRules.Kind.RAPID, 3, 1_000, 2_200));
        var hits = List.of(new MoleRules.Hit(2, 1_400), new MoleRules.Hit(0, 1_300), new MoleRules.Hit(1, 1_200),
                new MoleRules.Hit(2, 1_500), new MoleRules.Hit(3, 1_250), new MoleRules.Hit(0, 1_900));

        var signals = MoleTimingSignals.mole(moles, hits);

        assertThat(signals.reactions()).isEqualTo(2);
        assertThat(signals.medianReactionMs()).isEqualTo(350);
        assertThat(signals.segments().getFirst()).isEqualTo(new MoleTimingSignals.Segment(2, 350, 74, null,
                new MoleTimingSignals.EarlyReaction(2, 0, false)));
    }

    @Test
    void 스피드_두더지는_일정한_타격_간격과_초고속_반응을_따로_적발한다() {
        var random = new SplittableRandom(3);
        var human = new ArrayList<Integer>();
        var bot = new ArrayList<Integer>();
        for (int at = 0, n = 0; n < 200; n++) {
            at += 180 + random.nextInt(200);
            human.add(at);
            bot.add(n * 280);
        }
        var slowReactions = new ArrayList<MoleTimingSignals.Reaction>();
        for (int n = 0; n < 40; n++) {
            slowReactions.add(new MoleTimingSignals.Reaction(n * 1_000, 400 + n * 20));
        }

        var humanSignals = MoleTimingSignals.speed(slowReactions, human, List.of());
        var botSignals = MoleTimingSignals.speed(slowReactions, bot, List.of());
        var fastReactions = List.of(90, 95, 100, 110, 120, 90, 95, 100, 110, 120,
                90, 95, 100, 110, 120, 90, 95, 100, 110, 120).stream()
                .map(ms -> new MoleTimingSignals.Reaction(0, ms)).toList();
        var fastSignals = MoleTimingSignals.speed(fastReactions, human, List.of());

        assertThat(humanSignals.steady()).isFalse();
        assertThat(humanSignals.fastReaction()).isFalse();
        assertThat(botSignals.steady()).isTrue();
        assertThat(botSignals.segments()).hasSize(3).allSatisfy(segment -> {
            assertThat(segment.medianMs()).isEqualTo(280);
            assertThat(segment.spreadMs()).isZero();
        });
        assertThat(fastSignals.fastReaction()).isTrue();
        assertThat(fastSignals.steady()).isFalse();
    }

    @Test
    void 스피드_두더지의_타격이_없거나_한_구간뿐이면_일정한_간격으로_보지_않는다() {
        var empty = MoleTimingSignals.speed(List.of(), List.of(), List.of());
        assertThat(empty.reactions()).isZero();
        assertThat(empty.medianReactionMs()).isNull();
        assertThat(empty.segments()).containsOnly(new MoleTimingSignals.Segment(0, null, null,
                new MoleTimingSignals.Pace(0, 0, null, false), new MoleTimingSignals.EarlyReaction(0, 0, false)));
        assertThat(empty.steady()).isFalse();
        assertThat(empty.sustainedPace()).isFalse();

        var oneSegment = new ArrayList<Integer>();
        for (int n = 0; n < 50; n++) {
            oneSegment.add(n * 300);
        }
        assertThat(MoleTimingSignals.speed(List.of(), oneSegment, oneSegment).steady()).isFalse();
    }

    @Test
    void 스피드_두더지의_한_구간이_불규칙해도_두_구간의_타격이_일정하면_기록한다() {
        var taps = new ArrayList<Integer>();
        for (int at = 0, n = 0; at < 60_000; n++) {
            taps.add(at);
            at += at < 40_000 ? 250 : 200 + n % 5 * 30;
        }

        var signals = MoleTimingSignals.speed(List.of(), taps, List.of());

        assertThat(signals.segments().getLast().spreadMs()).isGreaterThan(MoleTimingSignals.STEADY_INTERVAL_MS);
        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.steady()).isTrue();
    }

    @Test
    void 입력_간격이_달라도_세_구간_모두_빠르고_정확하면_검토_신호를_남긴다() {
        var taps = new ArrayList<Integer>();
        var hits = new ArrayList<Integer>();
        int[] gap = {95, 125, 150};
        for (int phase = 0; phase < 3; phase++) {
            int at = phase * 20_000 + 200;
            for (int i = 0; i < 160; i++) {
                taps.add(at);
                if (i % 40 != 0) {
                    hits.add(at);
                }
                at += gap[i % gap.length];
            }
        }

        var signals = MoleTimingSignals.speed(List.of(), taps, hits);

        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.steady()).isFalse();
        assertThat(signals.sustainedPace()).isTrue();
        assertThat(signals.segments()).extracting(MoleTimingSignals.Segment::pace)
                .containsOnly(new MoleTimingSignals.Pace(160, 156, 150, true));
        assertThat(MoleTimingSignals.speed(List.of(), taps, hits.subList(0, 312)).sustainedPace()).isFalse();
    }

    @Test
    void 지속_고속_적중은_적중_수와_정확도와_빠른_간격을_모두_요구한다() {
        assertThat(MoleTimingSignals.Pace.measured(144, 140, 180).qualifies()).isTrue();
        assertThat(MoleTimingSignals.Pace.measured(140, 139, 180).qualifies()).isFalse();
        assertThat(MoleTimingSignals.Pace.measured(150, 145, 180).qualifies()).isFalse();
        assertThat(MoleTimingSignals.Pace.measured(145, 145, 181).qualifies()).isFalse();
        assertThat(MoleTimingSignals.Pace.measured(145, 145, null).qualifies()).isFalse();
    }

    @Test
    void 운영_의심_판만_지속_고속_적중_기준을_충족한다() {
        // 익명 운영 관측 통계. 각 구간은 입력 수, 적중 수, 간격 90백분위 순이다.
        int[][] suspected = {{160, 156, 158}, {162, 159, 158}, {160, 159, 155}};
        int[][][] comparison = {
            {{95, 81, 314}, {80, 71, 394}, {85, 76, 347}},
            {{37, 33, 723}, {46, 37, 820}, {68, 67, 489}},
            {{132, 129, 227}, {137, 130, 225}, {135, 126, 237}},
            {{127, 124, 217}, {128, 126, 224}, {119, 118, 240}},
            {{122, 119, 227}, {118, 113, 254}, {118, 117, 259}},
            {{115, 114, 242}, {112, 111, 252}, {110, 109, 258}},
            {{96, 95, 304}, {106, 105, 276}, {99, 99, 309}},
            // 다음 날의 별도 표본에서 빠르고 적중 수가 많았던 판.
            {{170, 161, 173}, {171, 158, 200}, {168, 150, 209}},
            {{155, 155, 190}, {150, 146, 208}, {153, 152, 207}}
        };

        assertThat(MoleTimingSignals.sustainedPace(observed(suspected))).isTrue();
        assertThat(Arrays.asList(comparison)).allSatisfy(
                round -> assertThat(MoleTimingSignals.sustainedPace(observed(round))).isFalse());
    }

    private static List<MoleTimingSignals.Segment> observed(int[][] round) {
        return Arrays.stream(round).map(segment -> new MoleTimingSignals.Segment(0, null, null,
                MoleTimingSignals.Pace.measured(segment[0], segment[1], segment[2]))).toList();
    }

    @Test
    void 일반_두더지에서_판_중앙값이_높아도_두_구간에_초단기_반응이_반복되면_기록한다() {
        var moles = moles(30);
        var signals = MoleTimingSignals.mole(moles,
                hits(moles, id -> id < 60 && id % 2 == 0 ? 50 : 290 + id % 5));

        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.repeatedEarlyReaction()).isTrue();
        assertThat(signals.segments().getFirst().earlyReaction())
                .isEqualTo(new MoleTimingSignals.EarlyReaction(30, 15, true));
        assertThat(MoleTimingSignals.mole(moles, hits(moles, id -> id % 5 == 0 ? 50 : 280))
                .repeatedEarlyReaction()).isFalse();
        assertThat(MoleTimingSignals.mole(moles, hits(moles, id -> id < 60 && id % 2 == 0 ? 51 : 290))
                .repeatedEarlyReaction()).isFalse();
    }

    @Test
    void 스피드_두더지에서_초단기_반응은_출현한_구간에_넣고_두_구간_이상일_때만_기록한다() {
        var reactions = new ArrayList<MoleTimingSignals.Reaction>();
        for (int phase = 0; phase < 3; phase++) {
            int offset = phase * 20_000;
            for (int n = 0; n < 16; n++) {
                int delay = phase < 2 && n % 2 == 0 ? 100 : 450;
                int tail = phase == 2 ? 19_000 : 19_500;
                reactions.add(new MoleTimingSignals.Reaction(offset + tail + n * 30, delay));
            }
        }

        var signals = MoleTimingSignals.speed(reactions, List.of(), List.of());

        assertThat(signals.fastReaction()).isFalse();
        assertThat(signals.repeatedEarlyReaction()).isTrue();
        assertThat(signals.segments().get(1).earlyReaction())
                .isEqualTo(new MoleTimingSignals.EarlyReaction(16, 8, true));
        assertThat(MoleTimingSignals.speed(reactions.subList(0, 31), List.of(), List.of()).repeatedEarlyReaction())
                .isFalse();
    }
}
