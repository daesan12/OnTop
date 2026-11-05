package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopResultStore;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.TransientDataAccessResourceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SkewerCoopSettlementServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-02T12:00:00Z");

    @Test
    void 저장소가_없으면_예상환산만_제공하고_지급완료나_다른사람의_영수증을_표시하지_않는다() {
        var service = new SkewerCoopSettlementService(null, Clock.fixed(NOW, ZoneOffset.UTC));
        var result = result(2399, false, "SKEWER_TIME_UP");
        service.finished(result);

        var response = service.result(101, result.result().gameId());

        assertThat(response.status()).isEqualTo("UNAVAILABLE");
        assertThat(response.coinsCalculated()).isEqualTo(119);
        assertThat(response.coinsGranted()).isNull();
        assertThat(response.rankingStatus()).isEqualTo("EXCLUDED");
        assertThatThrownBy(() -> service.result(303, result.result().gameId())).hasMessage("ACCESS_DENIED");
    }

    @Test
    void 저장실패는_지급완료가_아니며_대기후_같은_서버결과를_재시도한다() {
        var store = mock(SkewerCoopResultStore.class);
        var clock = new MutableClock();
        var service = new SkewerCoopSettlementService(store, clock);
        var result = result(2400, true, "SKEWER_TIME_UP");
        doThrow(new TransientDataAccessResourceException("연결 실패")).doNothing().when(store).settle(eq(result), any());
        when(store.find(eq(101L), any(), any())).thenReturn(Optional.empty());
        service.finished(result);

        service.retry();
        service.retry();
        assertThat(service.result(101, result.result().gameId()).status()).isEqualTo("PENDING");
        verify(store, times(1)).settle(eq(result), any());
        clock.now = NOW.plusSeconds(5);
        service.retry();

        verify(store, times(2)).settle(eq(result), any());
        var receipt = new SkewerCoopResultResponse(result.result().gameId(), "SETTLED", 2400, 3,
                "SKEWER_TIME_UP", "REGISTERED", "ELIGIBLE", 120, 10, 500L, 500, 0L, 600L,
                LocalDate.of(2026, 11, 2), clock.now);
        when(store.find(eq(101L), any(), any())).thenReturn(Optional.of(receipt));
        assertThat(service.result(101, result.result().gameId())).isEqualTo(receipt);
    }

    @Test
    void 정상종료_VR만_랭킹에_포함하고_비VR와_기권과_다른영업시간은_제외한다() {
        assertThat(result(20, true, "SKEWER_TIME_UP").rankingReason()).isEqualTo("ELIGIBLE");
        assertThat(result(20, false, "SKEWER_TIME_UP").rankingReason()).isEqualTo("NON_VR");
        assertThat(result(20, true, "SKEWER_FORFEIT").rankingReason()).isEqualTo("EARLY_END");
        var normal = result(20, true, "SKEWER_TIME_UP");
        var changed = new SkewerCoopFinished(normal.result(), 20, 0, 101L, 202L, true, 60_000, 60_000);
        assertThat(changed.rankingReason()).isEqualTo("RULES_MISMATCH");
    }

    static SkewerCoopFinished result(int score, boolean vr, String reason) {
        String id = "skewer-coop-" + UUID.randomUUID();
        return new SkewerCoopFinished(new GameLifecycle().finished(id, "vr:" + id, "SKEWER_COOP", 10,
                List.of(101L, 202L), List.of(101L, 202L), reason, NOW), score, 3, 101L, 202L, vr,
                240_000, 240_000);
    }

    private static final class MutableClock extends Clock {
        private Instant now = NOW;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
