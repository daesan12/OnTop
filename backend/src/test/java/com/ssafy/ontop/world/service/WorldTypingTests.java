package com.ssafy.ontop.world.service;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class WorldTypingTests {
    private final AtomicLong now = new AtomicLong();
    private final WorldTyping typing = new WorldTyping(now::get);

    @Test void 입력중만_같은채널에_5초_보관하고_본문은_저장하지않는다() {
        typing.update("one", "101", true);
        assertThat(typing.state("one").users()).containsExactly(new WorldTyping.User("101", 5000));
        assertThat(typing.state("two").users()).isEmpty();
        now.set(Duration.ofSeconds(5).toNanos());
        assertThat(typing.state("one").users()).isEmpty();
    }

    @Test void 빠른갱신은_방송하지않고_중지는_즉시_적용한다() {
        assertThat(typing.update("one", "101", true)).isTrue();
        long version = typing.state("one").version();
        for (int i = 0; i < 20; i++) assertThat(typing.update("one", "101", true)).isFalse();
        assertThat(typing.state("one").version()).isEqualTo(version);
        assertThat(typing.update("one", "101", false)).isTrue();
        assertThat(typing.state("one").users()).isEmpty();
        assertThat(typing.update("one", "101", true)).isTrue();
        assertThat(typing.state("one").users()).hasSize(1);
        now.addAndGet(Duration.ofSeconds(1).toNanos());
        assertThat(typing.update("one", "101", true)).isTrue();
    }

    @Test void 새참가자에게_원래남은수명만_주고_퇴장과단절은_제거한다() {
        typing.update("one", "101", true);
        now.addAndGet(Duration.ofSeconds(2).toNanos());
        assertThat(typing.state("one").users().getFirst().expiresInMs()).isEqualTo(3000);
        assertThat(typing.disconnected("101")).isEqualTo("one");
        assertThat(typing.state("one").users()).isEmpty();
        assertThat(typing.update("two", "101", true)).isTrue();
        assertThat(typing.remove("101")).isEqualTo("two");
        assertThat(typing.state("two").users()).isEmpty();
    }
}
