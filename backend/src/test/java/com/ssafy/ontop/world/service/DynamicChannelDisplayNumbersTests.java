package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DynamicChannelDisplayNumbersTests {

    @Test
    void 비어_있는_가장_작은_표시_번호를_재사용한다() {
        var channels = List.of(
                new Channel("channel-1", "운영 공원 1", 20),
                new Channel("channel-a", "운영 공원 2", 20),
                new Channel("channel-b", "운영 공원 5", 20));

        assertThat(DynamicChannelDisplayNumbers.nextAvailable(channels, 5)).isEqualTo(3);
    }

    @Test
    void 번호_범위가_가득_차면_생성을_거절한다() {
        var channels = List.of(
                new Channel("channel-1", "운영 공원 1", 20),
                new Channel("channel-a", "운영 공원 2", 20));

        assertThatThrownBy(() -> DynamicChannelDisplayNumbers.nextAvailable(channels, 2))
                .isInstanceOf(IllegalStateException.class);
    }
}
