package com.ssafy.ontop.behavior.service;

import java.time.Duration;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PositionSamplerTests {

    private static final long SECOND = Duration.ofSeconds(1).toNanos();

    private final PositionSampler sampler = new PositionSampler(Duration.ofSeconds(1));

    @Test
    void 처음_본_위치는_멈춰_있어도_남긴다() {
        assertThat(sampler.shouldSample("101", false, 0)).isTrue();
        assertThat(sampler.shouldSample("101", false, 5 * SECOND)).isFalse();
    }

    @Test
    void 움직이는_동안은_간격마다_한_번만_남긴다() {
        sampler.shouldSample("101", true, 0);

        assertThat(sampler.shouldSample("101", true, SECOND / 2)).isFalse();
        assertThat(sampler.shouldSample("101", true, SECOND)).isTrue();
        assertThat(sampler.shouldSample("101", true, SECOND + SECOND / 2)).isFalse();
    }

    @Test
    void 멈추면_한_번_남기고_다시_움직이면_바로_남긴다() {
        sampler.shouldSample("101", true, 0);

        assertThat(sampler.shouldSample("101", false, SECOND / 10)).isTrue();
        assertThat(sampler.shouldSample("101", false, SECOND / 5)).isFalse();
        assertThat(sampler.shouldSample("101", true, SECOND / 4)).isTrue();
    }

    @Test
    void 잊은_사용자는_다시_처음부터_남긴다() {
        sampler.shouldSample("101", false, 0);

        sampler.forget("101");

        assertThat(sampler.shouldSample("101", false, 1)).isTrue();
    }

    @Test
    void 사용자마다_따로_판단한다() {
        sampler.shouldSample("101", true, 0);

        assertThat(sampler.shouldSample("202", true, 1)).isTrue();
    }

    @Test
    void 간격은_0보다_커야_한다() {
        assertThatThrownBy(() -> new PositionSampler(Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
    }
}
