package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameEventDeliveryTests {
    private final GameFinishedPersistenceListener finishes = mock(GameFinishedPersistenceListener.class);
    private final GameParticipantLeftPersistenceService departures = mock(GameParticipantLeftPersistenceService.class);
    private final MutableClock clock = new MutableClock();
    private final GameEventDelivery delivery = new GameEventDelivery(finishes, departures, clock, false);

    @AfterEach void close() { delivery.stop(); }

    @Test void 엔진호출은_DB를_기다리지않고_별도작업자에서_커밋_ACK한다() throws Exception {
        var event = finish();
        var called = new AtomicReference<Thread>();
        when(finishes.accept(event)).thenAnswer(invocation -> { called.set(Thread.currentThread()); return 7L; });
        var ack = delivery.submit(event).toCompletableFuture();
        assertThat(ack.isDone()).isFalse();
        verifyNoInteractions(finishes, departures);

        try (var worker = Executors.newSingleThreadExecutor()) {
            assertThat(worker.submit(() -> delivery.drain(50)).get(5, TimeUnit.SECONDS)).isEqualTo(1);
        }

        assertThat(called.get()).isNotSameAs(Thread.currentThread());
        assertThat(ack.join().eventId()).isEqualTo("7:finished");
        assertThat(delivery.pendingCount()).isZero();
    }

    @Test void 최초_DB수신실패는_ACK없이_보존하고_원래이벤트를_재전달한다() {
        var event = finish();
        when(finishes.accept(event)).thenThrow(new DataAccessResourceFailureException("fixture")).thenReturn(7L);
        var ack = delivery.submit(event).toCompletableFuture();

        assertThat(delivery.drain(50)).isZero();
        assertThat(ack.isDone()).isFalse();
        assertThat(delivery.pendingCount()).isEqualTo(1);
        assertThat(delivery.drain(50)).isZero();
        clock.advance();
        assertThat(delivery.drain(50)).isEqualTo(1);

        assertThat(ack.isCompletedExceptionally()).isFalse();
        verify(finishes, times(2)).accept(event);
        verify(finishes).settle(event, 7);
    }

    @Test void 정산실패가_이미_커밋된_판정의_ACK를_되돌리지않는다() {
        var event = finish();
        when(finishes.accept(event)).thenReturn(7L);
        doThrow(new DataAccessResourceFailureException("fixture")).when(finishes).settle(event, 7);
        var ack = delivery.submit(event).toCompletableFuture();

        assertThat(delivery.drain(50)).isEqualTo(1);

        assertThat(ack.isDone()).isTrue();
        assertThat(ack.isCompletedExceptionally()).isFalse();
        assertThat(delivery.pendingCount()).isZero();
    }

    @Test void 대기중인_중복은_한번만_수신하고_상충판정은_거절한다() {
        var event = finish();
        when(finishes.accept(event)).thenReturn(7L);
        var first = delivery.submit(event).toCompletableFuture();
        var second = delivery.submit(event).toCompletableFuture();
        var different = new GameFinished(event.eventId(), "7", "table", "OMOK", 9,
                event.participants(), "TURN_TIMEOUT", event.endedAt());
        assertThatThrownBy(() -> delivery.submit(different)).isInstanceOf(IllegalArgumentException.class);

        assertThat(delivery.drain(50)).isEqualTo(1);

        assertThat(first.join()).isEqualTo(second.join());
        verify(finishes).accept(event);
    }

    @Test void 영속판정과_충돌한_이벤트는_성공_ACK하지않는다() {
        var event = finish();
        when(finishes.accept(event)).thenThrow(new IllegalStateException("fixture conflict"));
        var ack = delivery.submit(event).toCompletableFuture();

        assertThat(delivery.drain(50)).isZero();

        assertThat(ack.isCompletedExceptionally()).isTrue();
        assertThat(delivery.pendingCount()).isZero();
    }

    @Test void 이탈과_종료의_역순인계도_원본_수신서비스로_각각_전달한다() {
        var finish = finish();
        var left = new GameParticipantLeft("7:left:2", "7", "table", "OMOK", 8, 2,
                GameDepartureReason.LOGOUT, clock.instant());
        when(finishes.accept(finish)).thenReturn(7L);
        delivery.submit(finish);
        var ack = delivery.submit(left).toCompletableFuture();

        assertThat(delivery.drain(50)).isEqualTo(2);

        verify(departures).accept(left);
        assertThat(ack.join().eventId()).isEqualTo("7:left:2");
    }

    private GameFinished finish() {
        return new GameFinished("7:finished", "7", "table", "OMOK", 9, List.of(
                new GameFinished.Participant(1, GameFinished.Result.WIN, null, null),
                new GameFinished.Participant(2, GameFinished.Result.LOSE, null, null)), "FIVE_IN_ROW", clock.instant());
    }

    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-26T00:00:00Z");
        void advance() { now = now.plusSeconds(1); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
