package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.ChannelPresence;
import com.ssafy.ontop.world.service.ChannelQueryService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChannelQueryServiceTests {

    @Test
    void 설정이_없으면_임의_채널이나_정원을_만들지_않는다() {
        var service = service(new WorldChannelProperties(null), null);

        assertThat(service.listChannels().items()).isEmpty();
    }

    @Test
    void 광장_입장_공급자가_없으면_설정된_채널의_인원은_0이다() {
        var properties = new WorldChannelProperties(List.of(new Channel("channel-1", "검증 채널", 3)));
        var service = service(properties, null);

        var response = service.listChannels().items().getFirst();

        assertThat(response.currentUsers()).isZero();
        assertThat(response.capacity()).isEqualTo(3);
        assertThat(response.joinable()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    void 정원이_없거나_양수가_아니면_설정을_거절한다(int capacity) {
        assertThatThrownBy(() -> new Channel("channel-1", "검증 채널", capacity))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 중복_ID와_비어있는_이름을_설정하지_못한다() {
        var channel = new Channel("channel-1", "검증 채널", 3);

        assertThatThrownBy(() -> new WorldChannelProperties(List.of(channel, channel)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Channel("channel-1", " ", 3))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 잘못된_인원은_빈_채널로_위장하지_않는다() {
        var properties = new WorldChannelProperties(List.of(new Channel("channel-1", "검증 채널", 3)));
        var service = service(properties, () -> Map.of("channel-1", -1));

        assertThatThrownBy(service::listChannels).isInstanceOf(ChannelQueryService.UnavailableException.class);
    }

    private ChannelQueryService service(WorldChannelProperties properties, ChannelPresence presence) {
        var beans = new DefaultListableBeanFactory();
        if (presence != null) {
            beans.registerSingleton("presence", presence);
        }
        return new ChannelQueryService(properties, beans.getBeanProvider(ChannelPresence.class));
    }
}
