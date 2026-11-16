package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class MoleAuditServiceTests {
    private static final Instant QUERY_TIME = Instant.parse("2026-11-15T13:00:00Z");
    private static final Duration WINDOW = Duration.ofDays(30);

    private final MoleAuditStore store = mock(MoleAuditStore.class);
    private final MoleAuditService service =
            new MoleAuditService(store, mock(BehaviorLog.class), mock(BehaviorLogProperties.class));

    @Test
    void 같은_게임은_기존_집계_시각을_유지하고_만료되면_다시_조회한다() {
        Instant expiresAt = QUERY_TIME.plusSeconds(30);
        when(store.detections(MoleAuditGame.MOLE, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100))
                .thenReturn(List.of());
        when(store.detections(MoleAuditGame.SPEED, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100))
                .thenReturn(List.of());
        when(store.detections(MoleAuditGame.MOLE, expiresAt.minus(WINDOW), expiresAt, 100))
                .thenReturn(List.of());

        var mole = service.detections(MoleAuditGame.MOLE, QUERY_TIME);
        var speed = service.detections(MoleAuditGame.SPEED, QUERY_TIME);
        assertThat(speed).isNotSameAs(mole);
        assertThat(service.detections(MoleAuditGame.MOLE, expiresAt.minusNanos(1))).isSameAs(mole);

        var refreshed = service.detections(MoleAuditGame.MOLE, expiresAt);
        assertThat(refreshed.until()).isEqualTo(expiresAt);
        assertThat(refreshed.from()).isEqualTo(expiresAt.minus(WINDOW));
        verify(store).detections(MoleAuditGame.MOLE, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100);
        verify(store).detections(MoleAuditGame.SPEED, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100);
        verify(store).detections(MoleAuditGame.MOLE, expiresAt.minus(WINDOW), expiresAt, 100);
        verifyNoMoreInteractions(store);
    }

    @Test
    void 타이밍_적발도_게임별로_30초_동안_같은_집계를_재사용한다() {
        Instant expiresAt = QUERY_TIME.plusSeconds(30);
        when(store.timingDetections(MoleAuditGame.SPEED, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100))
                .thenReturn(List.of());
        when(store.timingDetections(MoleAuditGame.SPEED, expiresAt.minus(WINDOW), expiresAt, 100))
                .thenReturn(List.of());

        var speed = service.timingDetections(MoleAuditGame.SPEED, QUERY_TIME);
        assertThat(service.timingDetections(MoleAuditGame.SPEED, expiresAt.minusNanos(1))).isSameAs(speed);
        assertThat(service.timingDetections(MoleAuditGame.SPEED, expiresAt).until()).isEqualTo(expiresAt);
        assertThat(speed.limit()).isEqualTo(100);
        verify(store).timingDetections(MoleAuditGame.SPEED, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100);
        verify(store).timingDetections(MoleAuditGame.SPEED, expiresAt.minus(WINDOW), expiresAt, 100);
        verifyNoMoreInteractions(store);
    }

    @Test
    void DB_조회가_실패하면_다음_요청이_다시_조회한다() {
        when(store.detections(MoleAuditGame.MOLE, QUERY_TIME.minus(WINDOW), QUERY_TIME, 100))
                .thenThrow(new DataAccessResourceFailureException("DB unavailable"))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.detections(MoleAuditGame.MOLE, QUERY_TIME))
                .isInstanceOf(DataAccessResourceFailureException.class);
        assertThat(service.detections(MoleAuditGame.MOLE, QUERY_TIME).items()).isEmpty();
    }
}
