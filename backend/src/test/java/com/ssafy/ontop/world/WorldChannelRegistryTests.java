package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChannelRegistry.ChannelException;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldChannelRegistryTests {

    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("channel-1", "검증 채널 1", 2), new Channel("channel-2", "검증 채널 2", 3))));

    @Test
    void 마지막_자리에_동시_입장해도_정원을_넘기지_않는다() throws Exception {
        registry.join("owner", "channel-1");
        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<String> first = new AtomicReference<>();
        AtomicReference<String> second = new AtomicReference<>();

        Thread one = Thread.startVirtualThread(() -> joinAfter(start, "first", first));
        Thread two = Thread.startVirtualThread(() -> joinAfter(start, "second", second));
        start.countDown();
        one.join(5000);
        two.join(5000);

        assertThat(one.isAlive()).isFalse();
        assertThat(two.isAlive()).isFalse();
        assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder("JOINED", "CHANNEL_FULL");
        assertThat(registry.snapshot().get("channel-1")).isEqualTo(2);
        var current = registry.join("owner", "channel-1");
        assertThat(current.changed()).isFalse();
        assertThat(current.state().version()).isEqualTo(2);
    }

    @Test
    void 오류와_반복_입장은_기존_채널과_버전을_변경하지_않는다() {
        var initial = registry.join("first", "channel-1").state();

        assertThatThrownBy(() -> registry.join("first", "channel-2"))
                .isInstanceOfSatisfying(ChannelException.class,
                        exception -> assertThat(exception.code()).isEqualTo("ALREADY_IN_CHANNEL"));
        assertThatThrownBy(() -> registry.join("first", "unknown"))
                .isInstanceOfSatisfying(ChannelException.class,
                        exception -> assertThat(exception.code()).isEqualTo("CHANNEL_NOT_FOUND"));
        assertThat(registry.join("first", "channel-1").state()).isEqualTo(initial);
        assertThat(registry.snapshot()).containsEntry("channel-1", 1).containsEntry("channel-2", 0);
    }

    @Test
    void 종료는_한_번만_정리하고_이미_보낸_스냅샷은_바뀌지_않는다() {
        var initial = registry.join("first", "channel-1").state();
        registry.join("second", "channel-1");
        var after = registry.disconnect("first");

        assertThat(after.version()).isEqualTo(3);
        assertThat(after.userIds()).containsExactly("second");
        assertThat(initial.userIds()).containsExactly("first");
        assertThat(registry.disconnect("first")).isNull();
        assertThat(registry.join("second", "channel-1").state().version()).isEqualTo(3);
        assertThatThrownBy(() -> initial.userIds().add("forged"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> registry.leave("first"))
                .isInstanceOfSatisfying(ChannelException.class,
                        exception -> assertThat(exception.code()).isEqualTo("NOT_IN_CHANNEL"));
    }

    private void joinAfter(CountDownLatch start, String user, AtomicReference<String> result) {
        try {
            start.await();
            registry.join(user, "channel-1");
            result.set("JOINED");
        } catch (ChannelException exception) {
            result.set(exception.code());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            result.set("INTERRUPTED");
        }
    }
}
