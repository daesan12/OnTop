package com.ssafy.ontop.game.result.persistence;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.ssafy.ontop.game.result.GameFinished;
import java.sql.SQLIntegrityConstraintViolationException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class GameFinishedPersistenceListenerTests {
    private final GameFinishPersistenceService finishes = mock(GameFinishPersistenceService.class);
    private final GameSettlementPersistenceService settlements = mock(GameSettlementPersistenceService.class);
    private final GameFinishedPersistenceListener listener = new GameFinishedPersistenceListener(finishes, settlements);
    private final Logger logger = (Logger) LoggerFactory.getLogger(GameFinishedPersistenceListener.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach void capture() {
        previousLevel = logger.getLevel(); logger.setLevel(Level.ERROR);
        logs.start(); logger.addAppender(logs);
    }

    @AfterEach void release() { logger.detachAppender(logs); logger.setLevel(previousLevel); logs.stop(); }

    @Test void 수신이_성공한_경기만_순서대로_정산하고_실패로그를_남기지않는다() {
        var event = event("7", "7:finished");
        when(finishes.accept(event)).thenReturn(7L);
        listener.finished(event);
        var order = inOrder(finishes, settlements);
        order.verify(finishes).accept(event); order.verify(settlements).settle(7);
        verifyNoMoreInteractions(finishes, settlements);
        assertThat(logs.list).isEmpty();
    }

    @Test void 수신실패는_ACCEPT로_기록하고_동일예외를_전파하며_정산하지않는다() {
        var event = event("7", "7:finished");
        var failure = new IllegalArgumentException("private-table-marker secret-fixture-message 331001");
        when(finishes.accept(event)).thenThrow(failure);
        assertThatThrownBy(() -> listener.finished(event)).isSameAs(failure);
        verifyNoInteractions(settlements); verify(finishes, times(1)).accept(event);
        assertLog("ACCEPT", failure.getClass(), failure.getClass(), "NONE", 0);
    }

    @Test void 수신_커밋실패도_성공으로_처리하거나_정산을_호출하지않는다() {
        var event = event("7", "7:finished");
        var failure = new TransactionSystemException("secret-fixture-message", new IllegalStateException("331001"));
        when(finishes.accept(event)).thenThrow(failure);
        assertThatThrownBy(() -> listener.finished(event)).isSameAs(failure);
        verifyNoInteractions(settlements);
        assertLog("ACCEPT", TransactionSystemException.class, IllegalStateException.class, "NONE", 0);
    }

    @Test void 정산_저장실패는_SETTLE로_기록하고_메시지대신_SQL원인만_남긴다() {
        var event = event("7", "7:finished");
        var sql = new SQLIntegrityConstraintViolationException("331001 secret-fixture-message", "23000", 1062);
        var failure = new DataIntegrityViolationException("private-table-marker", sql);
        when(finishes.accept(event)).thenReturn(7L);
        doThrow(failure).when(settlements).settle(7);
        assertThatThrownBy(() -> listener.finished(event)).isSameAs(failure);
        verify(finishes, times(1)).accept(event); verify(settlements, times(1)).settle(7);
        verifyNoMoreInteractions(finishes, settlements);
        assertLog("SETTLE", DataIntegrityViolationException.class, SQLIntegrityConstraintViolationException.class, "23000", 1062);
    }

    @Test void 정산_커밋실패는_삼키거나_자동재시도하지않는다() {
        var event = event("7", "7:finished");
        var failure = new TransactionSystemException("secret-fixture-message");
        when(finishes.accept(event)).thenReturn(7L);
        doThrow(failure).when(settlements).settle(7);
        assertThatThrownBy(() -> listener.finished(event)).isSameAs(failure);
        verify(finishes, times(1)).accept(event); verify(settlements, times(1)).settle(7);
        assertLog("SETTLE", failure.getClass(), failure.getClass(), "NONE", 0);
    }

    @Test void 검증되지않은_식별자와_이벤트payload를_로그에_옮기지않는다() {
        var event = event("7\n331001", "7:finished\nsecret-fixture-message");
        var failure = new IllegalArgumentException("private-table-marker");
        when(finishes.accept(event)).thenThrow(failure);
        assertThatThrownBy(() -> listener.finished(event)).isSameAs(failure);
        verifyNoInteractions(settlements);
        assertThat(fields()).containsEntry("gameId", "INVALID").containsEntry("eventId", "INVALID");
        assertPrivateDataAbsent(logs.list.getFirst());
    }

    private GameFinished event(String gameId, String eventId) {
        return new GameFinished(eventId, gameId, "private-table-marker", "OMOK", 9, List.of(
                new GameFinished.Participant(331001, GameFinished.Result.WIN, null, null),
                new GameFinished.Participant(331002, GameFinished.Result.LOSE, null, null)),
                "FIVE_IN_ROW", Instant.parse("2026-10-26T01:00:00Z"));
    }

    private Map<String, Object> fields() {
        assertThat(logs.list).hasSize(1);
        return logs.list.getFirst().getKeyValuePairs().stream().collect(Collectors.toMap(pair -> pair.key, pair -> pair.value));
    }

    private void assertLog(String stage, Class<?> type, Class<?> root, String sqlState, int sqlCode) {
        assertThat(fields()).containsExactlyInAnyOrderEntriesOf(Map.of("gameId", "7", "eventId", "7:finished",
                "stage", stage, "exceptionType", type.getName(), "rootCauseType", root.getName(),
                "sqlState", sqlState, "sqlErrorCode", sqlCode));
        var log = logs.list.getFirst();
        assertThat(log.getLevel()).isEqualTo(Level.ERROR);
        assertThat(log.getFormattedMessage()).contains("gameId=7", "eventId=7:finished", "stage=" + stage,
                "exceptionType=" + type.getName(), "rootCauseType=" + root.getName(), "sqlState=" + sqlState, "sqlErrorCode=" + sqlCode);
        assertPrivateDataAbsent(log);
    }

    private void assertPrivateDataAbsent(ILoggingEvent log) {
        assertThat(log.getThrowableProxy()).isNull();
        assertThat(log.getFormattedMessage() + String.valueOf(log.getKeyValuePairs()))
                .doesNotContain("private-table-marker", "secret-fixture-message", "331001", "331002", "participants", "payload");
    }
}
