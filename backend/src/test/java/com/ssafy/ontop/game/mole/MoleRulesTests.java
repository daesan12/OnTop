package com.ssafy.ontop.game.mole;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.domain.MoleRules.Hit;
import com.ssafy.ontop.game.mole.domain.MoleRules.Kind;
import com.ssafy.ontop.game.mole.domain.MoleRules.Mole;
import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MoleRulesTests {

    @Test
    void 같은_시드는_같은_출현표를_만들고_구멍마다_한_마리_구간별_동시_출현을_지킨다() {
        for (long seed = 1; seed <= 200; seed++) {
            List<Mole> moles = MoleRules.schedule(seed);
            assertThat(MoleRules.schedule(seed)).isEqualTo(moles);
            for (Mole mole : moles) {
                assertThat(mole.appearAt()).isGreaterThanOrEqualTo(0);
                assertThat(mole.leaveAt()).isLessThanOrEqualTo(MoleRules.DURATION_MS);
                int phase = MoleRules.phaseOf(mole.appearAt());
                long active = moles.stream().filter(other -> other.appearAt() <= mole.appearAt()
                        && other.leaveAt() > mole.appearAt()).count();
                assertThat(active).isLessThanOrEqualTo(List.of(2, 3, 4).get(phase));
                assertThat(moles.stream().filter(other -> other != mole && other.hole() == mole.hole()
                        && other.appearAt() < mole.leaveAt() && mole.appearAt() < other.leaveAt())).isEmpty();
                if (mole.kind() == Kind.RAPID) {
                    assertThat(mole.hits()).isBetween(2, 3 + phase);
                    assertThat(mole.leaveAt() - mole.appearAt()).isEqualTo(mole.hits() * 200 + 500);
                } else {
                    assertThat(mole.hits()).isEqualTo(1);
                }
            }
        }
    }

    @Test
    void 구간마다_두더지가_늘어난다_평균_36_50_65마리() {
        double[] perPhase = new double[3];
        for (long seed = 1; seed <= 300; seed++) {
            MoleRules.schedule(seed).forEach(mole -> perPhase[MoleRules.phaseOf(mole.appearAt())]++);
        }
        assertThat(perPhase[0] / 300).isBetween(32.0, 40.0);
        assertThat(perPhase[1] / 300).isBetween(46.0, 55.0);
        assertThat(perPhase[2] / 300).isBetween(60.0, 70.0);
    }

    /** frontend/tests/unit/mole.test.ts와 같은 기록이다. 두 계산이 어긋나면 진행 중 점수가 최종 점수와 달라진다. */
    @Test
    void 일반_금색_연타_치면_안_되는_친구와_빈_구멍을_정해진_대로_계산한다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 0, 900), new Mole(1, 1, Kind.GOLD, 1, 0, 450),
                new Mole(2, 2, Kind.RAPID, 3, 1000, 2100), new Mole(3, 3, Kind.DECOY, 1, 1000, 1900));
        List<Hit> hits = List.of(new Hit(0, 150), new Hit(1, 120), new Hit(1, 200), new Hit(2, 1050),
                new Hit(2, 1150), new Hit(2, 1180), new Hit(2, 1250), new Hit(2, 1400), new Hit(3, 1500),
                new Hit(5, 1600));

        var score = MoleRules.score(moles, hits);

        // 1050은 출현 100ms 안이라 무시, 1180은 같은 구멍 60ms 안이라 무시, 1150·1250·1400 세 번으로 연타 완료.
        // 구멍1 200은 금색을 잡은 직후 잔타라 콤보를 끊지 않는다.
        assertThat(score).isEqualTo(new MoleRules.Score(10 + 30 + 30 - 20, 3, 3, 1));
    }

    @Test
    void 콤보는_10부터_1_2배_20부터_1_5배_30부터_2배이고_빈_구멍을_치면_끊긴다() {
        List<Mole> moles = IntStream.range(0, 35).mapToObj(i -> new Mole(i, i % 8, Kind.NORMAL, 1, i * 1000, i * 1000 + 900))
                .toList();
        List<Hit> hits = new ArrayList<>(IntStream.range(0, 35).mapToObj(i -> new Hit(i % 8, i * 1000 + 200)).toList());

        assertThat(MoleRules.score(moles, hits).score()).isEqualTo(9 * 10 + 10 * 12 + 10 * 15 + 6 * 20);

        hits.add(new Hit(7, 9500));
        var broken = MoleRules.score(moles, hits);
        assertThat(broken.maxCombo()).isEqualTo(25);
        assertThat(broken.score()).isEqualTo(9 * 10 + 12 + 9 * 10 + 10 * 12 + 6 * 15);
    }

    @Test
    void 연타_점수는_클릭당_10에_4회_5점_5회_10점을_더하고_엽전은_30점당_1냥이다() {
        assertThat(MoleRules.RAPID_POINTS.subList(2, 6)).containsExactly(20, 30, 45, 60);
        assertThat(MoleRules.coins(59)).isEqualTo(1);
        assertThat(MoleRules.coins(60)).isEqualTo(2);
        assertThat(MoleRules.score(List.of(new Mole(0, 3, Kind.DECOY, 1, 0, 900)), List.of(new Hit(3, 300))))
                .isEqualTo(new MoleRules.Score(0, 0, 0, 0));
    }

    @Test
    void 판_밖의_시각과_없는_구멍은_세지_않는다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 89_000, 89_900));
        var score = MoleRules.score(moles, List.of(new Hit(8, 89_200), new Hit(-1, 89_200),
                new Hit(0, MoleRules.DURATION_MS + 1), new Hit(0, 89_300)));
        assertThat(score.caught()).isEqualTo(1);
        assertThat(score.maxCombo()).isEqualTo(1);
    }

    /** 보통 실력(1구간 85%, 2구간 70%, 3구간 55% 적중, 가끔 헛치기)의 한 판 평균이 40~50냥이 되도록 출현표를 맞춘다. */
    @Test
    void 보통_실력의_한_판_평균은_40에서_50냥이다() {
        double total = 0;
        int games = 300;
        for (int game = 1; game <= games; game++) {
            List<Mole> moles = MoleRules.schedule(game * 7919L);
            total += MoleRules.score(moles, averagePlayer(moles, new SplittableRandom(game))).coins();
        }
        assertThat(total / games).isBetween(40.0, 50.0);
    }

    private static List<Hit> averagePlayer(List<Mole> moles, SplittableRandom random) {
        List<Hit> hits = new ArrayList<>();
        double[] catchRate = {0.85, 0.70, 0.55};
        for (Mole mole : moles) {
            int reaction = 250 + random.nextInt(150);
            if (random.nextDouble() < 0.07) {
                int empty = (mole.hole() + 1 + random.nextInt(7)) % 8;
                if (moles.stream().noneMatch(other -> other.hole() == empty
                        && other.appearAt() <= mole.appearAt() + reaction && mole.appearAt() + reaction < other.leaveAt())) {
                    hits.add(new Hit(empty, mole.appearAt() + reaction));
                }
            }
            if (mole.kind() == Kind.DECOY) {
                if (random.nextDouble() < 0.12) {
                    hits.add(new Hit(mole.hole(), mole.appearAt() + reaction));
                }
                continue;
            }
            double chance = mole.kind() == Kind.GOLD ? 0.5 : mole.kind() == Kind.RAPID ? 0.65
                    : catchRate[MoleRules.phaseOf(mole.appearAt())];
            if (random.nextDouble() >= chance) {
                continue;
            }
            int at = Math.min(mole.appearAt() + reaction, mole.leaveAt() - 1 - (mole.hits() - 1) * 110);
            for (int tap = 0; tap < mole.hits(); tap++) {
                hits.add(new Hit(mole.hole(), at + tap * 110));
            }
        }
        return hits;
    }
}
