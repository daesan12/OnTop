package com.ssafy.ontop.table;

import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class GameResultDeliveryRetryTests {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 저장조회_결과의_전송이_실패하면_같은버전_정산알림을_재전달한다(boolean explicit) throws Exception {
        var result = GameResultTests.result(101, "701", 2, SettlementStatus.SETTLED);
        var failed = new CountDownLatch(1);
        var attempts = new AtomicInteger();
        var accepted = new LinkedBlockingQueue<GameResultService.Delivery>();
        var service = new GameResultService(Optional.of((user, game) -> Optional.of(result)));
        try {
            service.connected("member", 101, message -> {
                if (attempts.incrementAndGet() == 1) {
                    failed.countDown();
                    throw new IllegalStateException("test-only transport handoff failure");
                }
                accepted.add(message);
            });
            if (explicit) { service.check("member", "request-1", "701"); }
            else { service.finished("701", List.of(101L, 202L)); }
            assertThat(failed.await(3, TimeUnit.SECONDS)).isTrue();

            // 같은 저장 결과의 outbox 재전달. 성공한 인계만 중복 억제해야 한다.
            service.committed(new GameResultCommitted(result));
            assertThat(accepted.poll(500, TimeUnit.MILLISECONDS)).isNotNull()
                    .satisfies(message -> assertThat(message.result()).isEqualTo(result));
            service.committed(new GameResultCommitted(result));
            assertThat(attempts).hasValue(2);
            assertThat(accepted).isEmpty();
        } finally { service.shutdown(); }
    }
}
