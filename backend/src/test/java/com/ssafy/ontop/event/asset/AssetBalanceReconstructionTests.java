package com.ssafy.ontop.event.asset;

import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Change;
import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Wallet;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AssetBalanceReconstructionTests {
    private static final Instant START = Instant.parse("2026-11-09T00:00:00Z");
    private static final Instant END = Instant.parse("2026-11-15T15:00:00Z");

    @Test
    void 마감_뒤_입출금과_예약은_순위_잔액을_바꾸지_않는다() {
        var wallet = new Wallet(1, 11, 300, START.minusSeconds(60));
        var changes = List.of(
                new Change(1, 1, 100, START.plusSeconds(10)),
                new Change(2, 1, 0, START.plusSeconds(20)),
                new Change(3, 1, -50, END),
                new Change(4, 1, 200, END.plusSeconds(10)));

        var result = AssetBalanceReconstruction.reconstruct(List.of(wallet), changes, START, END);
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().coinBalance()).isEqualTo(150);
        assertThat(result.getFirst().firstReachedAt()).isEqualTo(START.plusSeconds(10));
        assertThat(result.getFirst().firstReachedTransactionId()).isEqualTo(1);
    }

    @Test
    void 같은_잔액을_다시_얻어도_처음_도달한_시각을_보존한다() {
        var wallet = new Wallet(1, 11, 130, START.minusSeconds(60));
        var changes = List.of(
                new Change(2, 1, -20, START.plusSeconds(20)),
                new Change(1, 1, 30, START.plusSeconds(10)),
                new Change(3, 1, 20, START.plusSeconds(30)));

        var result = AssetBalanceReconstruction.reconstruct(List.of(wallet), changes, START, END);
        assertThat(result.getFirst().coinBalance()).isEqualTo(130);
        assertThat(result.getFirst().firstReachedAt()).isEqualTo(START.plusSeconds(10));
        assertThat(result.getFirst().firstReachedTransactionId()).isEqualTo(1);
    }

    @Test
    void 시작_잔액과_마감_잔액이_같으면_시작_시각을_선착순_근거로_사용한다() {
        var wallet = new Wallet(1, 11, 100, START.minusSeconds(60));
        var changes = List.of(
                new Change(1, 1, -20, START.plusSeconds(10)),
                new Change(2, 1, 20, START.plusSeconds(20)));

        var result = AssetBalanceReconstruction.reconstruct(List.of(wallet), changes, START, END);
        assertThat(result.getFirst().firstReachedAt()).isEqualTo(START);
        assertThat(result.getFirst().firstReachedTransactionId()).isNull();
    }

    @Test
    void 마감_이후_가입자는_후보에서_제외한다() {
        var wallet = new Wallet(1, 11, 100, END);
        assertThat(AssetBalanceReconstruction.reconstruct(List.of(wallet), List.of(), START, END))
                .isEmpty();
    }

    @Test
    void 원장과_잔액이_모순되면_결과를_확정하지_않는다() {
        var wallet = new Wallet(1, 11, 10, START.minusSeconds(60));
        assertThatThrownBy(() -> AssetBalanceReconstruction.reconstruct(List.of(wallet),
                List.of(new Change(1, 1, 20, START)), START, END))
                .isInstanceOf(IllegalStateException.class);
    }
}
