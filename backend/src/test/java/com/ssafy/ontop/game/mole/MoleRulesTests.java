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
                assertThat(mole.hole()).isBetween(0, MoleRules.KEYS.size() - 1);
                assertThat(active).isLessThanOrEqualTo(List.of(2, 2, 3).get(phase));
                assertThat(moles.stream().filter(other -> other != mole && other.hole() == mole.hole()
                        && other.appearAt() < mole.leaveAt() && mole.appearAt() < other.leaveAt())).isEmpty();
                if (mole.kind() == Kind.RAPID) {
                    assertThat(mole.hits()).isBetween(2, 3 + phase);
                    assertThat(mole.leaveAt() - mole.appearAt()).isEqualTo(mole.hits() * 220 + 600);
                } else {
                    assertThat(mole.hits()).isEqualTo(1);
                    int stay = List.of(1_100, 950, 800).get(phase);
                    assertThat(mole.leaveAt() - mole.appearAt()).isEqualTo(mole.kind() == Kind.GOLD ? stay * 55 / 100 : stay);
                }
            }
        }
    }

    @Test
    void 구간마다_두더지가_늘어난다_평균_45_56_78마리() {
        double[] perPhase = new double[3];
        for (long seed = 1; seed <= 300; seed++) {
            MoleRules.schedule(seed).forEach(mole -> perPhase[MoleRules.phaseOf(mole.appearAt())]++);
        }
        assertThat(perPhase[0] / 300).isBetween(40.0, 50.0);
        assertThat(perPhase[1] / 300).isBetween(50.0, 62.0);
        assertThat(perPhase[2] / 300).isBetween(70.0, 86.0);
    }

    /** frontend/tests/unit/mole.test.ts와 같은 기록이다. 두 계산이 어긋나면 진행 중 점수가 최종 점수와 달라진다. */
    @Test
    void 일반_금색_연타_치면_안_되는_친구와_빈_구멍을_정해진_대로_계산한다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 0, 900), new Mole(1, 1, Kind.GOLD, 1, 0, 450),
                new Mole(2, 2, Kind.RAPID, 3, 1000, 2100), new Mole(3, 3, Kind.DECOY, 1, 1000, 1900));
        List<Hit> hits = List.of(new Hit(1, 120), new Hit(0, 210), new Hit(1, 300), new Hit(2, 1040),
                new Hit(2, 1130), new Hit(2, 1160), new Hit(2, 1250), new Hit(2, 1400), new Hit(3, 1500),
                new Hit(3, 1600), new Hit(5, 1700), new Hit(0, 2000));

        var score = MoleRules.score(moles, hits);

        // 구멍1 300은 금색을 잡은 직후 잔타, 1040은 출현 60ms 안, 1160은 같은 구멍 60ms 안이라 무시한다.
        // 1130·1250·1400 세 번으로 연타 완료. 구멍3 1600은 고슴도치를 친 직후 잔타다.
        // 구멍5 1700은 아무것도 없는 구멍이라 2초 기절해 2000의 타격은 무시된다.
        assertThat(score).isEqualTo(new MoleRules.Score(30 + 10 + 30 - 20, 3, 3, 1));
    }

    @Test
    void 콤보는_10부터_1_2배_20부터_1_5배_30부터_2배이고_빈_구멍을_치면_끊긴다() {
        List<Mole> moles = IntStream.range(0, 35).mapToObj(i -> new Mole(i, i % 6, Kind.NORMAL, 1, i * 1000, i * 1000 + 900))
                .toList();
        List<Hit> hits = new ArrayList<>(IntStream.range(0, 35).mapToObj(i -> new Hit(i % 6, i * 1000 + 200)).toList());

        assertThat(MoleRules.score(moles, hits).score()).isEqualTo(9 * 10 + 10 * 12 + 10 * 15 + 6 * 20);

        // 빈 구멍을 치면 콤보가 끊기고 2초 기절해 10·11번째 두더지를 놓친다.
        hits.add(new Hit(5, 9500));
        var broken = MoleRules.score(moles, hits);
        assertThat(broken.maxCombo()).isEqualTo(23);
        assertThat(broken.score()).isEqualTo(9 * 10 + 12 + 9 * 10 + 10 * 12 + 4 * 15);
    }

    @Test
    void 아슬아슬하게_일찍_치거나_막_들어간_뒤_친_것은_기절하지_않는다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 1000, 1900), new Mole(1, 1, Kind.NORMAL, 1, 3000, 3900));

        // 나오기 0.1초 전에 친 것은 그냥 넘어가고, 나온 뒤 다시 쳐서 잡는다.
        var early = MoleRules.score(moles, List.of(new Hit(0, 900), new Hit(0, 1200)));
        assertThat(early.caught()).isEqualTo(1);
        // 들어간 뒤 0.2초에 친 것은 콤보만 끊고 기절하지 않아 다음 두더지를 잡는다.
        var late = MoleRules.score(moles, List.of(new Hit(0, 2100), new Hit(1, 3200)));
        assertThat(late.caught()).isEqualTo(1);
        // 아무것도 없을 때 친 것은 2초 기절해 다음 두더지(1.1초 뒤)를 칠 수 없다.
        var stunned = MoleRules.score(moles, List.of(new Hit(1, 2100), new Hit(1, 3200)));
        assertThat(stunned.caught()).isZero();
        assertThat(MoleRules.score(moles, List.of(new Hit(1, 900), new Hit(1, 3200))).caught()).isEqualTo(1);
    }

    @Test
    void 다른_구멍은_동시에_쳐도_모두_세고_같은_구멍은_60ms_안에_다시_세지_않고_올라오는_모션_중에도_잡힌다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 0, 900), new Mole(1, 1, Kind.NORMAL, 1, 0, 900),
                new Mole(2, 2, Kind.RAPID, 2, 0, 1040));

        assertThat(MoleRules.score(moles, List.of(new Hit(0, 300), new Hit(1, 300))).caught()).isEqualTo(2);
        assertThat(MoleRules.score(moles, List.of(new Hit(2, 300), new Hit(2, 330))).caught()).isZero();
        assertThat(MoleRules.score(moles, List.of(new Hit(2, 300), new Hit(2, 360))).caught()).isEqualTo(1);
        assertThat(MoleRules.score(moles, List.of(new Hit(0, 70))).caught()).isEqualTo(1);
        assertThat(MoleRules.score(moles, List.of(new Hit(0, 50))).caught()).isZero();
    }

    @Test
    void 마구_누르면_기절이_이어져_엽전을_거의_받지_못한다() {
        double total = 0;
        for (int game = 1; game <= 100; game++) {
            SplittableRandom random = new SplittableRandom(game);
            List<Hit> mash = IntStream.range(0, 3600).mapToObj(i -> new Hit(random.nextInt(MoleRules.KEYS.size()), 150 + i * 25)).toList();
            total += MoleRules.score(MoleRules.schedule(game * 7919L), mash).coins();
        }
        assertThat(total / 100).isLessThan(5.0);
    }

    @Test
    void 연타_점수는_클릭당_10에_4회_5점_5회_10점을_더하고_엽전은_40점당_1냥이다() {
        assertThat(MoleRules.RAPID_POINTS.subList(2, 6)).containsExactly(20, 30, 45, 60);
        assertThat(MoleRules.coins(79)).isEqualTo(1);
        assertThat(MoleRules.coins(80)).isEqualTo(2);
        assertThat(MoleRules.score(List.of(new Mole(0, 3, Kind.DECOY, 1, 0, 900)), List.of(new Hit(3, 300))))
                .isEqualTo(new MoleRules.Score(0, 0, 0, 0));
    }

    @Test
    void 판_밖의_시각과_없는_구멍은_세지_않는다() {
        List<Mole> moles = List.of(new Mole(0, 0, Kind.NORMAL, 1, 89_000, 89_900));
        var score = MoleRules.score(moles, List.of(new Hit(6, 89_200), new Hit(-1, 89_200),
                new Hit(0, MoleRules.DURATION_MS + 1), new Hit(0, 89_300)));
        assertThat(score.caught()).isEqualTo(1);
        assertThat(score.maxCombo()).isEqualTo(1);
    }

    /**
     * 보통 실력의 한 판 평균이 40~50냥이 되도록 출현표를 맞춘다. 사람은 두더지를 보고 0.38~0.63초 뒤에 반응하고,
     * 망치를 옮기는 데 0.35초가 걸리며, 그 안에 두더지가 들어가면 놓치고 가끔 늦게 친다. 이 모델은 규칙 1에서 약 45냥이었다.
     */
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
        int holes = MoleRules.KEYS.size();
        int hand = 0;
        for (Mole mole : moles) {
            int start = Math.max(mole.appearAt() + 380 + random.nextInt(250), hand + 350);
            if (mole.kind() == Kind.DECOY) {
                if (random.nextDouble() < 0.12) {
                    hits.add(new Hit(mole.hole(), start));
                }
                continue;
            }
            if (random.nextDouble() < 0.2) {
                continue;
            }
            int end = start + (mole.hits() - 1) * 130;
            if (end < mole.leaveAt() - 20) {
                for (int tap = 0; tap < mole.hits(); tap++) {
                    hits.add(new Hit(mole.hole(), start + tap * 130));
                }
                hand = end;
            } else if (random.nextDouble() < 0.35) {
                hits.add(new Hit(mole.hole(), mole.leaveAt() + 60 + random.nextInt(150)));
            }
            if (random.nextDouble() < 0.04) {
                hits.add(new Hit((mole.hole() + 1 + random.nextInt(holes - 1)) % holes, start + 40));
            }
        }
        return hits;
    }
}
