package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleMatchTests {
    private StoneRumbleMatch started(List<Long> users, long at) {
        var match = new StoneRumbleMatch(users, at);
        users.forEach(user -> match.sceneReady(Long.toString(user), true, at));
        return match;
    }


    // 기존 경기 진행 시각(3000ms)을 유지하고 새 도입부는 별도 테스트에서 검증한다.
    private StoneRumbleMatch matchStartingAtThreeSeconds(List<Long> users) {
        var match = started(users,
                3000 - StoneRumbleMatch.DROP_DURATION - StoneRumbleMatch.COUNTDOWN_DURATION);
        match.advance(3000);
        // 이동·공격 검증은 시작용 작은 발판을 지난 실제 최상단 경기층에서 분리한다.
        var players = (List<?>) ReflectionTestUtils.getField(match, "players");
        for (Object player : players) {
            ReflectionTestUtils.setField(player, "y", 28.0);
            ReflectionTestUtils.setField(player, "vy", 0.0);
            ReflectionTestUtils.setField(player, "floor", 7);
            ReflectionTestUtils.setField(player, "grounded", true);
        }
        var tiles = (List<?>) ReflectionTestUtils.getField(match, "tiles");
        for (Object tile : tiles) {
            if (!Integer.valueOf(7).equals(ReflectionTestUtils.getField(tile, "floor"))) { continue; }
            int q = (Integer) ReflectionTestUtils.getField(tile, "q");
            int r = (Integer) ReflectionTestUtils.getField(tile, "r");
            if (match.snapshot().players().stream().anyMatch(p ->
                    StoneHexGrid.cell(p.x(), p.z()).equals(new StoneHexGrid.Cell(q, r)))) {
                ReflectionTestUtils.setField(tile, "breakAt", 4000L);
                ReflectionTestUtils.setField(tile, "stepped", true);
            }
        }
        return match;
    }

    @Test
    void 구름에서_시작발판에_착지한_뒤_카운트다운_중_이동해도_발판과_공격은_시작하지_않는다() {
        var match = started(List.of(101L, 202L), 0);
        assertThat(match.snapshot().phase()).isEqualTo("DROPPING");
        assertThat(match.snapshot().players().getFirst().y()).isEqualTo(41);
        assertThat(match.snapshot().landsAt()).isEqualTo(1200);
        assertThat(match.snapshot().startsAt()).isEqualTo(4200);
        assertThatThrownBy(() -> match.control("101", 1, 0, 1, 0, false, true))
                .hasMessage("NOT_ACTIVE");
        match.advance(500);
        assertThat(match.snapshot().players().getFirst().y()).isBetween(32.01, 40.99);
        match.advance(1200);
        assertThat(match.snapshot().phase()).isEqualTo("COUNTDOWN");
        assertThat(match.snapshot().players()).allSatisfy(player -> {
            assertThat(player.floor()).isEqualTo(8);
            assertThat(player.y()).isEqualTo(32);
            assertThat(player.grounded()).isTrue();
        });
        double before = match.snapshot().players().getFirst().x();
        for (long time = 1200; time < 4200; time += 100) {
            match.control("101", 1, 0, 1, 0, false, true);
            match.advance(time + 100);
            if (time + 100 < 4200) {
                assertThat(match.snapshot().tiles()).noneMatch(StoneRumbleMatch.TileView::stepped);
                assertThat(match.snapshot().pigeons()).isEmpty();
            }
        }
        assertThat(match.snapshot().players().getFirst().x()).isGreaterThan(before);
        assertThat(match.snapshot().phase()).isEqualTo("RUNNING");
        assertThat(match.snapshot().tiles().stream().filter(StoneRumbleMatch.TileView::stepped))
                .allSatisfy(tile -> assertThat(tile.breakAt()).isEqualTo(5200)).isNotEmpty();
        match.control("101", 0, 0, 1, 0, false, true);
        assertThat(match.snapshot().pigeons()).hasSize(1);
    }

    @Test
    void 착지_직전_누른_점프는_착지한_뒤_한_번_실행된다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("101", 0, 0, 0, 1, true, false);
        match.advance(3680);

        match.control("101", 0, 0, 0, 1, true, false);
        match.control("101", 0, 0, 0, 1, false, false);
        match.advance(3780);

        var player = match.snapshot().players().getFirst();
        assertThat(player.y()).isGreaterThan(28);
        assertThat(player.grounded()).isFalse();
    }

    @Test
    void 착지까지_오래_남은_점프_입력은_만료된다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("101", 0, 0, 0, 1, true, false);
        match.advance(3300);

        match.control("101", 0, 0, 0, 1, true, false);
        match.advance(3780);

        var player = match.snapshot().players().getFirst();
        assertThat(player.y()).isEqualTo(28);
        assertThat(player.grounded()).isTrue();
    }

    @Test
    void 준비중_경계로_계속_이동해도_시작발판에서_떨어지거나_탈락하지_않는다() {
        var match = started(List.of(101L, 202L), 0);
        match.advance(1200);
        for (long time = 1200; time < 4180; time += 20) {
            match.control("101", -1, 0, -1, 0, false, true, true);
            match.advance(time + 20);
        }
        var own = match.snapshot().players().getFirst();
        var cell = StoneHexGrid.cell(own.x(), own.z());
        assertThat(StoneHexGrid.ring(cell.q(), cell.r())).isLessThanOrEqualTo(4);
        assertThat(own.x()).isBetween(-6.5, -3.9);
        assertThat(match.snapshot().players().getFirst().y()).isEqualTo(32);
        assertThat(match.snapshot().players().getFirst().alive()).isTrue();
        assertThat(match.snapshot().tiles()).noneMatch(StoneRumbleMatch.TileView::stepped);
        assertThat(match.snapshot().pigeons()).isEmpty();
    }

    @Test
    void 비둘기는_천오백밀리초_직전에는_막히고_정확히_이후에는_다시_발사된다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("101", 0, 0, 0, 1, false, true);
        match.advance(4480);
        match.control("101", 0, 0, 0, 1, false, true);
        assertThat(match.snapshot().pigeons()).isEmpty();
        assertThat(match.snapshot().players().getFirst().pigeonReadyAt()).isEqualTo(4500);
        match.advance(4500);
        match.control("101", 0, 0, 0, 1, false, true);
        assertThat(match.snapshot().pigeons()).hasSize(1);
        assertThat(match.snapshot().players().getFirst().pigeonReadyAt()).isEqualTo(6000);
    }

    @Test
    void 시작발판_여덟개와_아래로_넓어지는_여덟_경기층을_생성한다() {
        var match = started(List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L), 0);
        var state = match.snapshot();
        assertThat(state.tiles()).hasSize(1378);
        assertThat(state.tiles().stream().filter(t -> t.floor() == 8)).hasSize(8)
                .allSatisfy(t -> assertThat(t.breakAt()).isEqualTo(5200));
        assertThat(state.tiles().stream().filter(t -> t.floor() == 7)).hasSize(127);
        assertThat(state.tiles().stream().filter(t -> t.floor() == 0)).hasSize(217);
        assertThat(state.tiles().stream().filter(t -> t.floor() < 8))
                .allSatisfy(t -> assertThat(t.breakAt()).isGreaterThan(300_000));
    }

    @Test
    void 밟은_발판이_사라지면_네미터_아래층에_착지하고_마지막_층_아래에서_탈락한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        var floors = new java.util.LinkedHashSet<Integer>();
        for (long time = 3040; time <= 25_000 && !match.finished(); time += 20) {
            match.advance(time);
            var own = match.snapshot().players().getFirst();
            if (own.grounded()) { floors.add(own.floor()); }
        }
        assertThat(floors).containsExactly(7, 6, 5, 4, 3, 2, 1, 0);
        assertThat(match.snapshot().status()).isEqualTo("FINISHED");
        assertThat(match.snapshot().endReason()).isEqualTo("ALL_FALLEN");
        assertThat(match.snapshot().winnerUserIds()).isEmpty();
    }

    @Test
    void 일층_발판에서_떨어져도_바로_탈락하지_않고_육미터_아래까지_낙하한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        boolean fallingBelowFloor = false;
        boolean fallingBelowPreviousLimit = false;
        long fallStartedAt = -1;
        double lastAliveHeight = 0;

        for (long time = 3020; time <= 25000 && !match.finished(); time += 20) {
            match.advance(time);
            var own = match.snapshot().players().getFirst();
            if (own.floor() == 0 && own.y() < 0 && fallStartedAt < 0) {
                fallStartedAt = match.snapshot().serverTime();
            }
            if (own.floor() == 0 && own.alive() && own.y() < -0.4) {
                fallingBelowFloor = true;
                fallingBelowPreviousLimit |= own.y() < -3.0;
                lastAliveHeight = own.y();
                assertThat(own.grounded()).isFalse();
                assertThat(own.y()).isGreaterThanOrEqualTo(-6.0);
            }
        }

        assertThat(fallingBelowFloor).isTrue();
        assertThat(fallingBelowPreviousLimit).isTrue();
        assertThat(lastAliveHeight).isBetween(-6.0, -5.5);
        var eliminated = match.snapshot().players().getFirst();
        assertThat(eliminated.alive()).isFalse();
        assertThat(eliminated.y()).isLessThan(-6.0);
        assertThat(eliminated.eliminatedAt() - fallStartedAt).isGreaterThanOrEqualTo(700);
        assertThat(eliminated.forfeited()).isFalse();
        assertThat(match.snapshot().endReason()).isEqualTo("ALL_FALLEN");
    }

    @Test
    void 비둘기는_직선으로_날아가_상대를_밀고_일점오초_재사용을_예약한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        double before = match.snapshot().players().get(1).x();

        match.control("101", 0, 0, 1, 0, false, true);
        match.control("101", 0, 0, 1, 0, false, true);
        assertThat(match.snapshot().pigeons()).hasSize(1);
        assertThat(match.snapshot().pigeons().getFirst().vx()).isEqualTo(20);
        assertThat(match.snapshot().players().getFirst().pigeonReadyAt()).isEqualTo(4500);
        match.advance(3400);
        assertThat(match.snapshot().players().get(1).hitAt()).isZero();
        match.advance(3500);

        assertThat(match.snapshot().players().get(1).hitAt()).isBetween(3401L, 3500L);
        match.advance(3900);

        assertThat(match.snapshot().players().get(1).x()).isGreaterThan(before + .5);
        assertThat(match.snapshot().players().get(1).hitAt()).isPositive();
        assertThat(match.snapshot().pigeons()).isEmpty();
    }

    @Test
    void 비둘기에_맞으면_반대_입력에도_사백밀리초_동안_한칸_밀린다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("101", 0, 0, 1, 0, false, true);
        long time = 3000;
        while (match.snapshot().players().get(1).hitAt() == 0 && time < 3800) {
            match.advance(time += 20);
        }
        var struck = match.snapshot().players().get(1);
        assertThat(struck.hitAt()).isPositive();
        for (int step = 1; step <= 20; step++) {
            match.control("202", -1, 0, -1, 0, false, false, true);
            match.advance(time + step * 20);
        }

        double distance = match.snapshot().players().get(1).x() - struck.x();
        assertThat(distance).isCloseTo(StoneRumbleMatch.TILE_SIZE,
                org.assertj.core.data.Offset.offset(0.000001));
        match.control("202", -1, 0, -1, 0, false, false);
        match.advance(time + 420);
        assertThat(match.snapshot().players().get(1).x()).isLessThan(struck.x() + distance);
    }

    @Test
    void 대각선_명중도_방향을_유지하며_한칸_밀어낸다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L, 303L));
        match.advance(3000);
        var source = match.snapshot().players().getFirst();
        var target = match.snapshot().players().get(2);
        double dx = target.x() - source.x(), dz = target.z() - source.z();
        double aimX = dx / Math.hypot(dx, dz), aimZ = dz / Math.hypot(dx, dz);
        match.control("101", 0, 0, aimX, aimZ, false, true);
        long time = 3000;
        while (match.snapshot().players().get(2).hitAt() == 0 && time < 3800) {
            match.advance(time += 20);
        }
        var struck = match.snapshot().players().get(2);
        assertThat(struck.hitAt()).isPositive();
        for (int step = 1; step <= 20; step++) {
            match.control("303", -aimX, -aimZ, -aimX, -aimZ, false, false);
            match.advance(time + step * 20);
        }
        var after = match.snapshot().players().get(2);
        assertThat(Math.hypot(after.x() - struck.x(), after.z() - struck.z()))
                .isCloseTo(StoneRumbleMatch.TILE_SIZE, org.assertj.core.data.Offset.offset(0.000001));
        assertThat(after.x()).isGreaterThan(struck.x());
        assertThat(after.z()).isLessThan(struck.z());
    }

    @Test
    void 빠른_비둘기가_프레임_사이로_스쳐도_이동_선분으로_명중한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("202", 0.8888888888888888, 0, -1, 0, false, false);
        match.advance(3100);
        match.control("202", 0, .9, -1, 0, false, false);
        match.advance(3240);
        match.control("202", 0, 0, -1, 0, false, false);
        match.control("101", 0, 0, 1, 0, false, true);
        match.advance(3740);

        var target = match.snapshot().players().get(1);
        var pigeon = match.snapshot().pigeons().getFirst();
        assertThat(target.hitAt()).isZero();
        // 양 끝점은 명중 반경 밖이지만 그 사이 선분은 몸을 스치는 배치다.
        assertThat(Math.hypot(pigeon.x() - target.x(), pigeon.z() - target.z())).isGreaterThan(.6);
        assertThat(Math.hypot(pigeon.x() + pigeon.vx() * .02 - target.x(), pigeon.z() - target.z()))
                .isGreaterThan(.6);
        match.advance(3760);

        assertThat(match.snapshot().players().get(1).hitAt()).isPositive();
        assertThat(match.snapshot().pigeons()).isEmpty();
    }

    @Test
    void 육각형_격자의_대각선_이동은_실제_착지한_발판을_예약한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        assertThat(match.snapshot().players().getFirst().x()).isEqualTo(-2 * StoneRumbleMatch.TILE_SIZE);
        match.control("101", 1, 1, 1, 0, false, false);

        match.advance(3320);
        match.control("101", 1, 1, 1, 0, false, false);
        match.advance(3440);

        assertThat(match.snapshot().tiles().stream().filter(t -> t.floor() == 7 && t.q() == -2 && t.r() == 1)
                .findFirst().orElseThrow().stepped()).isTrue();
        assertThat(match.snapshot().players().getFirst().grounded()).isTrue();
    }

    @Test
    void 일층_아래_탈락자는_입력할_수_없고_퇴장해도_다른_생존자의_경기는_계속된다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L, 303L));
        match.advance(3000);
        int[][] route = {{0, 1}, {-1, 0}, {0, -1}, {1, 0}};
        boolean firedBelowFirstFloor = false;
        for (long time = 3020; time <= 25000 && match.snapshot().players().getFirst().alive(); time += 20) {
            int phase = (int) ((time - 3000) / 2000) % 4;
            int[] first = route[phase], second = route[(phase + 3) % 4];
            match.control("202", first[0], first[1], 1, 0, false, false);
            match.control("303", second[0], second[1], 1, 0, false, false);
            var own = match.snapshot().players().getFirst();
            if (!firedBelowFirstFloor && own.floor() == 0 && own.y() < 0) {
                match.control("101", 0, 0, 1, 0, false, true);
                firedBelowFirstFloor = true;
            }
            match.advance(time);
        }

        assertThat(match.snapshot().players().getFirst().alive()).isFalse();
        assertThat(match.snapshot().players().getFirst().y()).isLessThan(StoneRumbleMatch.ELIMINATION_HEIGHT);
        assertThat(match.snapshot().players().getFirst().grounded()).isFalse();
        assertThat(firedBelowFirstFloor).isTrue();
        assertThat(match.snapshot().pigeons().stream().filter(p -> p.owner().equals("101"))).isEmpty();
        assertThat(match.snapshot().players().stream().filter(StoneRumbleMatch.PlayerView::alive)).hasSize(2);
        match.depart("101", match.snapshot().serverTime());

        assertThat(match.finished()).isFalse();
        assertThat(match.snapshot().players().getFirst().forfeited()).isFalse();
        assertThatThrownBy(() -> match.control("101", 1, 0, 1, 0, true, true)).hasMessage("GAME_FINISHED");
        assertThatThrownBy(() -> match.control("101", 1, 0, 1, 0, false, false, true)).hasMessage("GAME_FINISHED");
    }

    @Test
    void 바닥_다이빙은_감속하고_일초_재사용_대기를_지킨다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        double start = match.snapshot().players().getFirst().x();
        match.control("101", 0, 0, 1, 0, false, false, true);
        match.advance(3300);

        assertThat(match.snapshot().players().getFirst().x() - start).isBetween(1.2, 1.5);
        assertThat(match.snapshot().players().getFirst().slideReadyAt()).isEqualTo(4000);
        match.control("101", 0, 0, 1, 0, false, false, true);
        match.advance(3600);
        assertThat(match.snapshot().players().getFirst().slideStartedAt()).isEqualTo(3000);
        match.advance(4000);
        match.control("101", 0, 0, 1, 0, false, false, true);
        match.advance(4300);
        assertThat(match.snapshot().players().getFirst().x() - start).isBetween(2.5, 2.9);
    }

    @Test
    void 이동방향_다이빙은_대각선_속도가_같고_반대입력으로_방향을_바꾸지_않는다() {
        for (double[] direction : List.of(new double[] {0, -1}, new double[] {1, 1})) {
            var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
            match.advance(3000);
            var start = match.snapshot().players().getFirst();
            match.control("101", direction[0], direction[1], 1, 0, false, false, true);
            match.advance(3120);
            match.control("101", -direction[0], -direction[1], -1, 0, false, false, false);
            match.advance(3300);
            var after = match.snapshot().players().getFirst();
            double length = Math.hypot(direction[0], direction[1]);
            assertThat(after.slideX()).isCloseTo(direction[0] / length * StoneRumbleMatch.DIVE_SPEED,
                    org.assertj.core.data.Offset.offset(0.000001));
            assertThat(after.slideZ()).isCloseTo(direction[1] / length * StoneRumbleMatch.DIVE_SPEED,
                    org.assertj.core.data.Offset.offset(0.000001));
            assertThat(Math.hypot(after.x() - start.x(), after.z() - start.z())).isBetween(1.2, 1.5);
            assertThat((after.x() - start.x()) * direction[0] + (after.z() - start.z()) * direction[1]).isPositive();
        }
    }

    @Test
    void 공중_다이빙은_상승과_하강_중에도_관성을_유지하고_수직_운동을_보존한다() {
        for (boolean jumping : List.of(true, false)) {
            var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
            var baseline = matchStartingAtThreeSeconds(List.of(101L, 202L));
            match.advance(3000);
            baseline.advance(3000);
            if (jumping) {
                match.control("101", 0, 0, 1, 0, true, false);
                baseline.control("101", 0, 0, 1, 0, true, false);
            }
            long startedAt = jumping ? 3100 : 4300;
            match.advance(startedAt);
            baseline.advance(startedAt);
            var before = match.snapshot().players().getFirst();
            assertThat(before.grounded()).isFalse();
            match.control("101", 0, 0, 1, 0, false, false, true);
            match.advance(startedAt + 300);
            baseline.advance(startedAt + 300);
            var after = match.snapshot().players().getFirst();

            assertThat(after.x() - before.x()).isBetween(2.6, 2.9);
            assertThat(after.y()).isCloseTo(baseline.snapshot().players().getFirst().y(),
                    org.assertj.core.data.Offset.offset(0.000001));
            assertThat(after.slideReadyAt()).isEqualTo(startedAt + 1000);
            match.control("101", 0, 0, -1, 0, false, false, true);
            assertThat(match.snapshot().players().getFirst().slideStartedAt()).isEqualTo(startedAt);
        }
    }

    @Test
    void 점프와_다이빙을_동시에_입력해도_공중에서_감속하며_정상적으로_상승한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        double before = match.snapshot().players().getFirst().x();
        match.control("101", 0, 0, 1, 0, true, false, true);
        match.advance(3300);

        assertThat(match.snapshot().players().getFirst().x() - before).isBetween(2.6, 2.9);
        assertThat(match.snapshot().players().getFirst().slideUntil()).isGreaterThan(3300);
        assertThat(match.snapshot().players().getFirst().slideReadyAt()).isEqualTo(4000);
        assertThat(match.snapshot().players().getFirst().grounded()).isFalse();
        assertThat(match.snapshot().players().getFirst().y()).isGreaterThan(28);
    }

    @Test
    void 슬라이딩_중_비둘기에_맞으면_슬라이딩을_중단하고_넉백을_적용한다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(2600);
        match.control("202", -1, 0, -1, 0, false, false);
        match.advance(2800);
        match.control("202", -1, 0, -1, 0, false, false);
        match.advance(3000);
        match.control("202", 0, 0, -1, 0, false, false, true);
        match.control("101", 0, 0, 1, 0, false, true);
        long time = 3000;
        while (match.snapshot().players().get(1).hitAt() == 0 && time < 3800) {
            match.advance(time += 20);
        }
        var hit = match.snapshot().players().get(1);
        assertThat(hit.hitAt()).isBetween(3001L, 3400L);
        assertThat(hit.slideUntil()).isEqualTo(hit.hitAt());
        match.advance(time + 400);
        assertThat(match.snapshot().players().get(1).x() - hit.x()).isCloseTo(StoneRumbleMatch.KNOCKBACK_DISTANCE,
                org.assertj.core.data.Offset.offset(0.000001));
    }

    @Test
    void 점프와_입력_만료는_서버_시간을_따른다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.advance(3000);
        match.control("101", 1, 0, 1, 0, true, false);
        match.advance(3320);
        double x = match.snapshot().players().getFirst().x();
        assertThat(match.snapshot().players().getFirst().y()).isGreaterThan(28);

        match.advance(4000);

        assertThat(match.snapshot().players().getFirst().x() - x).isLessThan(.2);
    }

    @Test
    void 잘못된_입력과_구름_낙하중_입력을_거절한다() {
        var match = started(List.of(101L, 202L), -1200);
        assertThatThrownBy(() -> match.control("101", 0, 0, 1, 0, false, false))
                .hasMessage("NOT_ACTIVE");
        match.advance(3000);
        assertThatThrownBy(() -> match.control("101", Double.NaN, 0, 1, 0, false, false))
                .hasMessage("INVALID_INPUT");
        assertThatThrownBy(() -> match.control("999", 0, 0, 1, 0, false, false))
                .hasMessage("ACCESS_DENIED");
    }

    @Test
    void 마지막_생존자와_기권을_구분하고_종료후_시간은_멈춘다() {
        var match = matchStartingAtThreeSeconds(List.of(101L, 202L));
        match.depart("202", 1000);
        long endedAt = match.snapshot().endedAt();

        match.depart("202", 2000);
        match.advance(3000);

        assertThat(match.snapshot().winnerUserIds()).containsExactly("101");
        assertThat(match.snapshot().players().get(1).forfeited()).isTrue();
        assertThat(match.snapshot().endedAt()).isEqualTo(endedAt);
    }
}
