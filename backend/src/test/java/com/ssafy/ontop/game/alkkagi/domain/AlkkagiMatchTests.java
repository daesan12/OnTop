package com.ssafy.ontop.game.alkkagi.domain;

import org.junit.jupiter.api.Test;
import org.dyn4j.dynamics.Body;
import org.dyn4j.geometry.Geometry;
import org.dyn4j.geometry.MassType;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AlkkagiMatchTests {
    @Test
    void 모든_크기의_최대힘_자유발사는_네칸_안에_멈추고_약한_당김은_짧게_간다() throws Exception {
        var settings = AlkkagiSettings.provisional();
        var previous = new AlkkagiSettings(4.5, 5, 1.0 / 120, 5, .9, 12, .025,
                24, 3600, 30_000, 720_000);
        var pieces = started().snapshot(0).pieces();
        var rows = new java.util.ArrayList<String>();
        for (int id : new int[]{13, 0, 8}) {
            var piece = pieces.get(id);
            var old = freeFlight(piece, 1, previous);
            var full = freeFlight(piece, 1, settings);
            var half = freeFlight(piece, .5, settings);
            var quarter = freeFlight(piece, .25, settings);
            assertThat(old[0]).isGreaterThan(full[0]);
            assertThat(full[0]).isBetween(2.5, 4.1);
            assertThat(full[1]).isLessThan(.75);
            assertThat(half[0]).isBetween(.9, 1.7);
            assertThat(quarter[0]).isBetween(.25, .55);
            assertThat(quarter[0]).isLessThan(half[0]);
            assertThat(half[0]).isLessThan(full[0]);
            rows.add("{\"type\":\"" + piece.type() + "\",\"beforeFullDistance\":" + old[0]
                    + ",\"fullDistance\":" + full[0] + ",\"movingSeconds\":" + full[1]
                    + ",\"halfDistance\":" + half[0] + ",\"quarterDistance\":" + quarter[0] + "}");
        }
        var path = java.nio.file.Path.of("build/alkkagi/free-flight-comparison.json");
        java.nio.file.Files.createDirectories(path.getParent());
        java.nio.file.Files.writeString(path, "{\"conditions\":\"isolated no collision/boundary, actual body/deceleration, 120Hz, impulse12, deceleration5 vs18, separated model\",\"rows\":["
                + String.join(",", rows) + "]}");
    }

    private double[] freeFlight(AlkkagiMatch.PieceView piece, double power, AlkkagiSettings settings) {
        var world = new World<Body>();
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(settings.stepSeconds());
        var body = AlkkagiMatch.collisionBody(piece.radius(), piece.mass(), settings.restitution());
        world.addBody(body);
        body.applyImpulse(new Vector2(AlkkagiPhysics.experimental().launchImpulse(settings.maximumImpulse(), power, AlkkagiPhysics.experimental().profile(piece.type())), 0));
        int movingSteps = 0;
        for (int i = 0; i < 480; i++) {
            AlkkagiMatch.decelerate(body, settings);
            world.step(1);
            if (body.getLinearVelocity().getMagnitude() > settings.stopSpeed()) movingSteps++;
        }
        return new double[]{body.getWorldCenter().x, movingSteps * settings.stepSeconds()};
    }

    @Test
    void 출발속도는_종류별_상한으로_제어하고_큰알_충격량은_더_크다() {
        var small = started(); var large = started();
        small.shoot(0, shot(small, "small", "p13", 1, 0, .6), 1);
        large.shoot(0, shot(large, "large", "p8", 1, 0, .6), 1);
        small.advance(2); large.advance(2);
        var soldier = small.snapshot(2).pieces().get(13);
        var king = large.snapshot(2).pieces().get(8);
        assertThat(king.vx()).isLessThan(soldier.vx()).isGreaterThan(soldier.vx() * .75);
        assertThat(king.mass() * king.vx()).isGreaterThan(soldier.mass() * soldier.vx() * 5);
    }

    @Test
    void 최대힘_졸의_정면충돌에도_왕은_거의_밀리지_않고_왕은_졸을_크게_민다() throws Exception {
        var pieces = started().snapshot(0).pieces();
        var soldier = pieces.get(13); var middle = pieces.get(0); var king = pieces.get(8);
        double pawnToKing = targetTravel(soldier, king);
        double middleToKing = targetTravel(middle, king);
        double kingToPawn = targetTravel(king, soldier);
        assertThat(pawnToKing).isBetween(0.0, .15);
        assertThat(middleToKing).isGreaterThan(pawnToKing).isLessThan(2);
        assertThat(kingToPawn).isBetween(2., 6.);
        assertThat(kingToPawn).isGreaterThan(pawnToKing * 20);
        var report = java.nio.file.Path.of("build/alkkagi/size-knockback.json");
        java.nio.file.Files.createDirectories(report.getParent());
        java.nio.file.Files.writeString(report, "{\"conditions\":\"head-on gap .05, power 1, actual profiles/fixtures/deceleration, 120Hz 4s, isolated unbounded world\","
                + "\"pawnToKingDistance\":" + pawnToKing + ",\"middleToKingDistance\":" + middleToKing
                + ",\"kingToPawnDistance\":" + kingToPawn + "}");
    }

    private double targetTravel(AlkkagiMatch.PieceView projectilePiece, AlkkagiMatch.PieceView targetPiece) {
        var settings = AlkkagiSettings.provisional();
        var world = new World<Body>();
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(settings.stepSeconds());
        var projectile = AlkkagiMatch.collisionBody(projectilePiece.radius(), projectilePiece.mass(), settings.restitution());
        var target = AlkkagiMatch.collisionBody(targetPiece.radius(), targetPiece.mass(), settings.restitution());
        double initialX = projectilePiece.radius() + targetPiece.radius() + .05;
        target.translate(initialX, 0);
        world.addBody(projectile); world.addBody(target);
        projectile.applyImpulse(new Vector2(AlkkagiPhysics.experimental().launchImpulse(settings.maximumImpulse(), 1, AlkkagiPhysics.experimental().profile(projectilePiece.type())), 0));
        for (int i = 0; i < 480; i++) {
            AlkkagiMatch.decelerate(projectile, settings);
            AlkkagiMatch.decelerate(target, settings);
            world.step(1);
        }
        return target.getWorldCenter().x - initialX;
    }

    @Test
    void 영상의_세_크기_그룹과_뒤줄_중앙_빈칸을_사용한다() {
        var pieces = started().snapshot(0).pieces();
        assertThat(pieces.get(3).radius()).isEqualTo(pieces.get(13).radius());
        assertThat(pieces.get(0).radius()).isEqualTo(pieces.get(1).radius())
                .isEqualTo(pieces.get(2).radius()).isEqualTo(pieces.get(9).radius());
        assertThat(pieces.get(8).radius()).isGreaterThan(pieces.get(0).radius());
        assertThat(pieces.subList(0, 8)).extracting(AlkkagiMatch.PieceView::x)
                .containsExactly(-4., -3., -2., -1., 1., 2., 3., 4.);
        assertThat(pieces.get(9).x()).isEqualTo(-3);
        assertThat(pieces.get(10).x()).isEqualTo(3);
    }

    @Test
    void 같은_발사에서_초기속도는_높이고_전체_미끄러짐은_짧게_줄인다() throws Exception {
        var current = AlkkagiSettings.provisional();
        var previous = new AlkkagiSettings(4.5, 5, 1.0 / 120, 1.8, .82, 8, .025,
                24, 3600, 30_000, 720_000);
        var before = measureShot(previous);
        var after = measureShot(current);

        assertThat(after[0]).isGreaterThan(before[0]);
        assertThat(after[1]).isLessThan(before[1]);
        var report = java.nio.file.Path.of("build/alkkagi/feel-comparison.json");
        java.nio.file.Files.createDirectories(report.getParent());
        java.nio.file.Files.writeString(report, "{\"conditions\":\"same 32 pieces, p13, power .6, fixed 120Hz\","
                + "\"beforeInitialSpeed\":" + before[0] + ",\"afterInitialSpeed\":" + after[0]
                + ",\"beforeSimulationSeconds\":" + before[1] + ",\"afterSimulationSeconds\":" + after[1] + "}");
    }

    private double[] measureShot(AlkkagiSettings settings) {
        var match = new AlkkagiMatch(settings);
        match.start(0);
        match.shoot(0, shot(match, "feel", "p13", 0, -1, .6), 1);
        int steps = 0;
        double initialSpeed = 0;
        while (match.snapshot(0).stage().equals("SIMULATING") && steps < 3600) {
            match.advance(2 + Math.round(steps * settings.stepSeconds() * 1000));
            if (steps == 0) {
                var piece = match.snapshot(0).pieces().get(13);
                initialSpeed = Math.hypot(piece.vx(), piece.vy());
            }
            steps++;
        }
        assertThat(match.snapshot(0).stage()).isEqualTo("AIMING");
        return new double[]{initialSpeed, steps * settings.stepSeconds()};
    }

    @Test
    void 임시_구성은_각_16개이며_서로_겹치지_않는다() {
        var match = new AlkkagiMatch(AlkkagiSettings.provisional());
        var state = match.snapshot(0);

        assertThat(state.provisional()).isTrue();
        assertThat(state.pieces()).hasSize(32);
        assertThat(state.pieces().stream().filter(p -> p.owner() == 0)).hasSize(16);
        for (var a : state.pieces()) {
            for (var b : state.pieces()) {
                if (!a.id().equals(b.id())) {
                    assertThat(Math.hypot(a.x() - b.x(), a.y() - b.y())).isGreaterThan(a.radius() + b.radius());
                }
            }
        }
    }

    @Test
    void 관전자와_상대_알과_차례_밖_발사를_거절한다() {
        var match = started();

        assertThatThrownBy(() -> match.shoot(-1, shot(match, "a", "p11", 0, -1, .5), 1))
                .hasMessage("PLAYER_REQUIRED");
        assertThatThrownBy(() -> match.shoot(1, shot(match, "b", "p27", 0, 1, .5), 1))
                .hasMessage("NOT_YOUR_TURN");
        assertThatThrownBy(() -> match.shoot(0, shot(match, "c", "p27", 0, -1, .5), 1))
                .hasMessage("NOT_YOUR_PIECE");
    }

    @Test
    void 비정상_방향과_힘과_과거_경기를_거절한다() {
        var match = started();

        for (double invalid : new double[]{Double.NaN, Double.POSITIVE_INFINITY, -1, 1.01}) {
            assertThatThrownBy(() -> match.shoot(0, shot(match, "a", "p11", 0, -1, invalid), 1))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> match.shoot(0, shot(match, "b", "p11", 0, 0, .5), 1))
                .hasMessage("INVALID_DIRECTION");
        var stale = new AlkkagiMatch.Shot("old", "c", 1, "p11", 0, -1, .5);
        assertThatThrownBy(() -> match.shoot(0, stale, 1)).hasMessage("STALE_GAME");
    }

    @Test
    void 같은_발사는_재전송해도_한번만_반영하고_다른_내용은_거절한다() {
        var match = started();
        var command = shot(match, "a", "p11", 0, -1, 1);
        long accepted = match.shoot(0, command, 1);
        for (int i = 0; i < 20; i++) { match.advance(2 + i * 9); }
        var before = match.snapshot(200);

        assertThat(match.shoot(0, command, 201)).isEqualTo(accepted);
        assertThat(match.snapshot(201).pieces()).isEqualTo(before.pieces());
        assertThatThrownBy(() -> match.shoot(0, new AlkkagiMatch.Shot(command.gameId(), "a", 1,
                "p11", 1, 0, .8), 201)).hasMessage("ACTION_ID_CONFLICT");
    }

    @Test
    void 움직이는_동안_추가_발사를_허용하지_않는다() {
        var match = started();
        match.shoot(0, shot(match, "a", "p11", 0, -1, .7), 1);

        assertThatThrownBy(() -> match.shoot(0, shot(match, "b", "p12", 0, -1, .5), 2))
                .hasMessage("NOT_AIMING");
    }

    @Test
    void 한_발사의_충돌이_끝난_뒤에만_차례가_한번_넘어간다() {
        var match = started();
        var originalTarget = match.snapshot(0).pieces().get(27);
        match.shoot(0, shot(match, "a", "p11", 0, -1, 1), 1);
        for (int i = 0; i < 2400; i++) { match.advance(2 + i * 8); }
        var after = match.snapshot(20_000);

        assertThat(after.stage()).isEqualTo("AIMING");
        assertThat(after.turn()).isEqualTo(1);
        assertThat(after.turnNumber()).isEqualTo(2);
        assertThat(after.pieces().get(27).y()).isNotEqualTo(originalTarget.y());
        assertThat(after.endReason()).isNull();
    }

    @Test
    void 전체_시간이_끝나도_현재_발사를_마친_뒤_개수로_판정한다() {
        var s = AlkkagiSettings.provisional();
        var match = new AlkkagiMatch(new AlkkagiSettings(s.halfWidth(), s.halfHeight(), s.stepSeconds(),
                s.deceleration(), s.restitution(), s.maximumImpulse(), s.stopSpeed(), s.settleSteps(),
                s.maximumSimulationSteps(), 30_000, 30_000));
        match.start(0);
        match.shoot(0, shot(match, "a", "p11", 0, -1, .5), 29_999);
        match.advance(30_001);

        assertThat(match.snapshot(30_001).stage()).isEqualTo("SIMULATING");
        for (int i = 0; i < 1200; i++) { match.advance(30_010 + i * 8); }
        assertThat(match.snapshot(40_000).endReason()).isEqualTo("MATCH_TIME_LIMIT");
    }

    @Test
    void 알_중심이_판_밖으로_나가면_탈락하고_다시_충돌하지_않는다() {
        var match = started();
        match.shoot(0, shot(match, "a", "p0", 0, 1, 1), 1);
        for (int i = 0; i < 1200; i++) { match.advance(2 + i * 8); }

        assertThat(match.snapshot(10_000).pieces().getFirst().alive()).isFalse();
    }

    @Test
    void 한_플레이어의_자기턴_2연속_시간초과는_기권패이다() {
        var match = started();
        match.advance(30_000);
        match.advance(60_000);
        match.advance(90_000);

        assertThat(match.snapshot(90_000).endReason()).isEqualTo("AFK_FORFEIT");
        assertThat(match.snapshot(90_000).winner()).isEqualTo(1);
        long version = match.snapshot(90_000).version();
        match.advance(100_000);
        assertThat(match.snapshot(100_000).version()).isEqualTo(version);
    }

    @Test
    void 마감_시각에_도착한_발사는_이전_턴으로_반영되지_않는다() {
        var match = started();

        assertThatThrownBy(() -> match.shoot(0, shot(match, "a", "p11", 0, -1, 1), 30_000))
                .hasMessage("NOT_YOUR_TURN");
        assertThat(match.snapshot(30_000).simulationId()).isZero();
    }

    @Test
    void 같은_배치와_발사는_고정_스텝에서_같은_결과를_만든다() {
        var a = started(); var b = started();
        a.shoot(0, shot(a, "a", "p13", .2, -.9, 1), 1);
        b.shoot(0, shot(b, "b", "p13", .2, -.9, 1), 1);
        for (int i = 0; i < 1200; i++) { a.advance(2 + i * 8); b.advance(2 + i * 8); }

        assertThat(a.snapshot(10_000).pieces()).isEqualTo(b.snapshot(10_000).pieces());
    }

    private AlkkagiMatch started() {
        var match = new AlkkagiMatch(AlkkagiSettings.provisional());
        match.start(0);
        return match;
    }

    private AlkkagiMatch.Shot shot(AlkkagiMatch match, String id, String piece, double dx, double dy, double power) {
        var state = match.snapshot(0);
        return new AlkkagiMatch.Shot(state.gameId(), id, state.version(), piece, dx, dy, power);
    }
}
