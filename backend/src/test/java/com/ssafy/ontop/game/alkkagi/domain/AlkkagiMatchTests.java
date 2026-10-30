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
    void 같은_당김에서_큰_알은_더_큰_충격량으로_출발한다() {
        var small = started(); var large = started();
        small.shoot(0, shot(small, "small", "p13", 1, 0, .6), 1);
        large.shoot(0, shot(large, "large", "p8", 1, 0, .6), 1);
        small.advance(2); large.advance(2);
        var soldier = small.snapshot(2).pieces().get(13);
        var king = large.snapshot(2).pieces().get(8);

        assertThat(AlkkagiMatch.launchImpulse(12, .6, king.mass()))
                .isCloseTo(23.4, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(AlkkagiMatch.launchImpulse(12, .6, soldier.mass()))
                .isCloseTo(7.2, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(king.vx()).isCloseTo(soldier.vx(), org.assertj.core.data.Offset.offset(1e-9));
        assertThat(king.mass() * king.vx()).isGreaterThan(soldier.mass() * soldier.vx());
    }

    @Test
    void 같은_작은_표적을_같은_당김으로_치면_큰_알의_충돌_효과가_더_크다() throws Exception {
        double smallTargetSpeed = impactTargetSpeed(.8, .24);
        double largeTargetSpeed = impactTargetSpeed(2.6, .42);

        assertThat(largeTargetSpeed).isGreaterThan(smallTargetSpeed * 1.3);
        var report = java.nio.file.Path.of("build/alkkagi/mass-impact.json");
        java.nio.file.Files.createDirectories(report.getParent());
        java.nio.file.Files.writeString(report, "{\"conditions\":\"stationary .8 target, power .6, restitution .9, 120Hz\","
                + "\"smallProjectileMass\":0.8,\"largeProjectileMass\":2.6,\"smallTargetSpeed\":"
                + smallTargetSpeed + ",\"largeTargetSpeed\":" + largeTargetSpeed + "}");
    }

    private double impactTargetSpeed(double mass, double radius) {
        var world = new World<Body>();
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(1.0 / 120);
        var projectile = collisionBody(mass, radius);
        var target = collisionBody(.8, .24);
        target.translate(1.5, 0);
        world.addBody(projectile); world.addBody(target);
        projectile.applyImpulse(new Vector2(AlkkagiMatch.launchImpulse(12, .6, mass), 0));
        for (int i = 0; i < 30; i++) { world.step(1); }
        return target.getLinearVelocity().getMagnitude();
    }

    private Body collisionBody(double mass, double radius) {
        var body = new Body();
        var fixture = body.addFixture(Geometry.createCircle(radius));
        fixture.setDensity(mass / (Math.PI * radius * radius));
        fixture.setRestitution(.9);
        fixture.setFriction(0);
        body.setMass(MassType.FIXED_ANGULAR_VELOCITY);
        body.setLinearDamping(0);
        body.setBullet(true);
        return body;
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
