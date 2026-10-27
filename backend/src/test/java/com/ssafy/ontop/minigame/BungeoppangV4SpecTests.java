package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import java.time.Instant;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BungeoppangV4SpecTests {
    private static final Instant ISSUED_AT = Instant.parse("2026-10-27T00:00:00Z");

    @Test
    void 서버가_1초_준비와_3점5초_카운트다운_60초_플레이_제출과_drain을_확정한다() {
        var timing = BungeoppangV4Spec.timing(ISSUED_AT);

        assertThat(timing.countdownStartsAt()).isEqualTo(ISSUED_AT.plusMillis(1_000));
        assertThat(timing.playStartsAt()).isEqualTo(ISSUED_AT.plusMillis(4_500));
        assertThat(timing.playEndsAt()).isEqualTo(ISSUED_AT.plusMillis(64_500));
        assertThat(timing.submitDeadline()).isEqualTo(ISSUED_AT.plusMillis(79_500));
        assertThat(timing.expiresAt()).isEqualTo(ISSUED_AT.plusMillis(89_500));
    }

    @Test
    void v4_설정은_512개불과_팥두개_첫주문을_고정한다() {
        var rules = BungeoppangV4Spec.rules();
        var order = BungeoppangV4Spec.firstOrder();

        assertThat(BungeoppangV4Spec.RULES_VERSION).isEqualTo("v4");
        assertThat(rules.slots()).isEqualTo(6);
        assertThat(rules.heatMin()).isEqualTo(85);
        assertThat(rules.heatMax()).isEqualTo(115);
        assertThat(rules.heatListLength()).isEqualTo(512);
        assertThat(rules.trayCapacity()).isEqualTo(4);
        assertThat(rules.specialOrderChancePercent()).isEqualTo(20);
        assertThat(rules.specialBonusPercent()).isEqualTo(50);
        assertThat(order.orderId()).isEqualTo("1");
        assertThat(order.orderIndex()).isZero();
        assertThat(order.items().bean()).isEqualTo(2);
        assertThat(order.items().custard()).isZero();
        assertThat(order.items().pizza()).isZero();
        assertThat(order.items().chocolate()).isZero();
    }

    @Test
    void 최초_checkpoint는_빈철판과_세션별_고유한_prefix를_가진다() {
        var checkpoint = BungeoppangV4Spec.initialCheckpoint(901);

        assertThat(checkpoint.revision()).isZero();
        assertThat(checkpoint.throughSeq()).isZero();
        assertThat(checkpoint.heatCursor()).isZero();
        assertThat(checkpoint.slots()).hasSize(6).allSatisfy(slot -> {
            assertThat(slot.phase()).isEqualTo("empty");
            assertThat(slot.heat()).isEqualTo(100);
            assertThat(slot.filling()).isNull();
        });
        assertThat(checkpoint.tray()).isEmpty();
        assertThat(checkpoint.stats().score()).isZero();
        assertThat(checkpoint.currentOrder()).isEqualTo(BungeoppangV4Spec.firstOrder());
        assertThat(checkpoint.prefixHash()).hasSize(64)
                .isNotEqualTo(BungeoppangV4Spec.initialPrefixHash(902));
    }

    @Test
    void 현재시각에_따라_waiting_countdown_playing_완료대기_단계를_구분한다() {
        var timing = BungeoppangV4Spec.timing(ISSUED_AT);
        var round = new BungeoppangV4Round(901, BungeoppangV4Spec.CONFIG_VERSION, "{}", ISSUED_AT,
                timing.countdownStartsAt(), timing.playStartsAt(), timing.playEndsAt(), timing.submitDeadline(),
                timing.expiresAt(), BungeoppangV4Spec.initialPrefixHash(901), "{}");

        assertThat(BungeoppangV4Spec.phase("PLAYING", ISSUED_AT, round)).isEqualTo("WAITING_START");
        assertThat(BungeoppangV4Spec.phase("PLAYING", timing.countdownStartsAt(), round)).isEqualTo("COUNTDOWN");
        assertThat(BungeoppangV4Spec.phase("PLAYING", timing.playStartsAt(), round)).isEqualTo("PLAYING");
        assertThat(BungeoppangV4Spec.phase("PLAYING", timing.playEndsAt(), round))
                .isEqualTo("AWAITING_COMPLETION");
        assertThat(BungeoppangV4Spec.phase("ABANDONED", timing.playStartsAt(), round)).isEqualTo("ABANDONED");
    }
}
