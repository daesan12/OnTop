package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.auth.service.AuthenticationRevocations.Reason;
import com.ssafy.ontop.auth.service.AuthenticationRevocations.Revoked;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.LoginSessionKey;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.shop.ShopModels.EquipmentChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AccountBehaviorListenerTests {

    private static final Instant NOW = Instant.parse("2026-10-23T02:00:00Z");

    private final CapturingLog log = new CapturingLog();
    private final AccountBehaviorListener listener =
            new AccountBehaviorListener(log, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void 로그아웃은_로그인_계열_해시와_함께_기록한다() {
        listener.revoked(new Revoked(101, "session-1", Reason.LOGOUT));

        assertThat(log.events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.AUTH_LOGOUT);
            assertThat(event.userId()).isEqualTo(101L);
            assertThat(event.occurredAt()).isEqualTo(NOW);
            assertThat(event.loginSessionId()).isEqualTo(LoginSessionKey.of("session-1")).isNotEqualTo("session-1");
        });
    }

    @Test
    void 회원_비활성화는_탈퇴로_기록한다() {
        listener.revoked(new Revoked(101, null));

        assertThat(log.events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.USER_WITHDRAWN);
            assertThat(event.loginSessionId()).isNull();
        });
    }

    @Test
    void 보안상_세션_폐기는_사용자_행동이_아니므로_기록하지_않는다() {
        listener.revoked(new Revoked(101, "session-1"));

        assertThat(log.events).isEmpty();
    }

    @Test
    void 장착은_아이템_번호와_함께_기록한다() {
        listener.equipped(new EquipmentChanged(101, 7L));

        assertThat(log.events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.ITEM_EQUIPPED);
            assertThat(event.props()).containsEntry("itemId", 7L);
        });
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new ArrayList<>();

        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }
    }
}
