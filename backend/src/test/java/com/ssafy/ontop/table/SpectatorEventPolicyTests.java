package com.ssafy.ontop.table;

import com.ssafy.ontop.table.service.SpectatorEventPolicy;
import com.ssafy.ontop.table.service.SpectatorEventPolicy.Kind;
import com.ssafy.ontop.table.service.SpectatorEventPolicy.Rejected;
import com.ssafy.ontop.table.service.SpectatorEventPolicy.Settings;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class SpectatorEventPolicyTests {

    private final AtomicLong nanos = new AtomicLong(TimeUnit.HOURS.toNanos(1));
    private final SpectatorEventPolicy policy = new SpectatorEventPolicy(Settings.DEFAULT, nanos::get);
    private long millis = 1_793_062_800_000L;

    @Test
    void 승인시각과_종류별_TTL로_만료시각을_정한다() {
        var chat = accept(505, "c1", Kind.CHAT, "g", "hi");
        assertThat(chat.sentAt()).isEqualTo(millis);
        assertThat(chat.expiresAt()).isEqualTo(millis + 3000);
        var ping = accept(505, "p1", Kind.PING, "g", "8:7:7");
        assertThat(ping.expiresAt()).isEqualTo(millis + 2000);
        assertThat(policy.ttl(Kind.CHAT)).isEqualTo(Duration.ofSeconds(3));
        assertThat(policy.ttl(Kind.PING)).isEqualTo(Duration.ofSeconds(2));
    }

    @Test
    void 같은_내용의_중복은_원래시각을_돌려주고_빈도를_소비하지않는다() {
        var original = accept(505, "e1", Kind.PING, "g", "8:7:7");
        advance(500);
        assertThat(policy.previous(505, "e1", Kind.PING, "g", "8:7:7", millis)).isEqualTo(original);
        assertThat(policy.previous(606, "e1", Kind.PING, "g", "8:7:7", millis)).as("다른 발신자는 별도 키").isNull();
        advance(600);
        // 중복 확인은 마지막 승인 시각을 바꾸지 않으므로 1초 뒤 새 이벤트를 받을 수 있다.
        assertThat(accept(505, "e2", Kind.PING, "g", "8:7:8")).isNotNull();
    }

    @Test
    void 다른_내용_종류_경기로_같은_eventId를_쓰면_충돌이다() {
        accept(505, "e1", Kind.CHAT, "g", "hi");
        assertThat(code(() -> policy.previous(505, "e1", Kind.CHAT, "g", "bye", millis)))
                .isEqualTo("GAME_SPECTATOR_EVENT_ID_CONFLICT");
        assertThat(code(() -> policy.previous(505, "e1", Kind.PING, "g", "hi", millis)))
                .isEqualTo("GAME_SPECTATOR_EVENT_ID_CONFLICT");
        assertThat(code(() -> policy.previous(505, "e1", Kind.CHAT, "other", "hi", millis)))
                .isEqualTo("GAME_SPECTATOR_EVENT_ID_CONFLICT");
    }

    @Test
    void 만료된_이벤트는_재요청해도_다시_살리지않고_보존시간뒤에는_잊는다() {
        accept(505, "e1", Kind.PING, "g", "8:7:7");
        advance(2000);
        assertThat(code(() -> policy.previous(505, "e1", Kind.PING, "g", "8:7:7", millis)))
                .isEqualTo("GAME_SPECTATOR_EVENT_EXPIRED");
        advance(28_000);
        assertThat(policy.previous(505, "e1", Kind.PING, "g", "8:7:7", millis)).isNull();
    }

    @Test
    void 사용자별_종류별_1초_간격이며_거절은_쿨다운을_연장하지않는다() {
        accept(505, "c1", Kind.CHAT, "g", "a");
        assertThat(accept(505, "p1", Kind.PING, "g", "0:0:0")).as("종류가 다르면 별도 간격").isNotNull();
        assertThat(accept(606, "c2", Kind.CHAT, "g", "b")).as("사용자가 다르면 별도 간격").isNotNull();
        advance(999);
        assertThat(code(() -> accept(505, "c3", Kind.CHAT, "g", "c"))).isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
        assertThat(code(() -> accept(505, "p2", Kind.PING, "g", "0:0:1"))).isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
        advance(1);
        assertThat(accept(505, "c3", Kind.CHAT, "g", "c")).isNotNull();
        assertThat(policy.previous(505, "p2", Kind.PING, "g", "0:0:1", millis)).as("거절된 요청은 기록하지 않음").isNull();
    }

    @Test
    void 경기별_채팅은_3초에_3건_핑은_2초에_5건까지다() {
        for (int user = 1; user <= 3; user++) {
            accept(user, "c" + user, Kind.CHAT, "g", "hi");
        }
        assertThat(code(() -> accept(4, "c4", Kind.CHAT, "g", "hi"))).isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
        assertThat(accept(4, "c4-other", Kind.CHAT, "other-game", "hi")).as("다른 경기는 별도 상한").isNotNull();
        for (int user = 1; user <= 5; user++) {
            accept(user, "p" + user, Kind.PING, "g", "0:0:" + user);
        }
        assertThat(code(() -> accept(6, "p6", Kind.PING, "g", "0:0:6"))).isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
        advance(2000);
        assertThat(accept(6, "p6", Kind.PING, "g", "0:0:6")).isNotNull();
        assertThat(code(() -> accept(4, "c4", Kind.CHAT, "g", "hi"))).isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
        advance(1000);
        assertThat(accept(4, "c4", Kind.CHAT, "g", "hi")).isNotNull();
    }

    @Test
    void 사용자당_중복기록은_최대64건이다() {
        var small = new SpectatorEventPolicy(new Settings(Duration.ofSeconds(3), Duration.ofSeconds(2),
                Duration.ofMillis(1), 1000, Duration.ofSeconds(3), 1000, Duration.ofSeconds(2),
                Duration.ofSeconds(30), 64), nanos::get);
        for (int index = 0; index <= 64; index++) {
            small.accept(505, "e" + index, Kind.CHAT, "g", "t" + index, millis);
            advance(1);
        }
        assertThat(small.previous(505, "e0", Kind.CHAT, "g", "t0", millis)).isNull();
        assertThat(small.previous(505, "e1", Kind.CHAT, "g", "t1", millis)).isNotNull();
    }

    @Test
    void 설정은_양수와_표시수명이상의_중복보존만_허용한다() {
        assertThatThrownBy(() -> new Settings(Duration.ZERO, Duration.ofSeconds(2), Duration.ofSeconds(1), 3,
                Duration.ofSeconds(3), 5, Duration.ofSeconds(2), Duration.ofSeconds(30), 64))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Settings(Duration.ofSeconds(3), Duration.ofSeconds(2), Duration.ofSeconds(1), 3,
                Duration.ofSeconds(3), 5, Duration.ofSeconds(2), Duration.ofSeconds(1), 64))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Settings(Duration.ofSeconds(3), Duration.ofSeconds(2), Duration.ofSeconds(1), 0,
                Duration.ofSeconds(3), 5, Duration.ofSeconds(2), Duration.ofSeconds(30), 64))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private SpectatorEventPolicy.Stamp accept(long user, String event, Kind kind, String game, String content) {
        return policy.accept(user, event, kind, game, content, millis);
    }

    private void advance(long milliseconds) {
        nanos.addAndGet(TimeUnit.MILLISECONDS.toNanos(milliseconds));
        millis += milliseconds;
    }

    private String code(Runnable action) {
        return catchThrowableOfType(Rejected.class, action::run).code();
    }
}
