package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.skewer.coop.repository.SkewerCoopResultJournal;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopResultStore;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.TransientDataAccessResourceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SkewerCoopResultJournalTests {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-02T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void DB실패_후_새_서비스가_미확정_결과를_읽고_정산한_뒤에만_저널을_제거한다() throws Exception {
        var result = SkewerCoopSettlementServiceTests.result(2407, false, "SKEWER_TIME_UP");
        var unavailable = mock(SkewerCoopResultStore.class);
        doThrow(new TransientDataAccessResourceException("DB 중단")).when(unavailable).settle(any(), any());
        var first = new SkewerCoopSettlementService(unavailable, clock, journal());
        first.finished(result);
        first.retry();
        first.close();

        var restored = mock(SkewerCoopResultStore.class);
        var second = new SkewerCoopSettlementService(restored, clock, journal());
        assertThat(second.result(101, result.result().gameId()).status()).isEqualTo("PENDING");
        assertThatThrownBy(() -> second.result(303, result.result().gameId())).hasMessage("ACCESS_DENIED");
        second.retry();
        second.close();

        verify(restored).settle(eq(result), any());
        try (var third = journal()) {
            assertThat(third.load()).isEmpty();
        }
    }

    @Test
    void DB커밋_후_저널정리_전_재시작하면_동일한_불변_결과를_다시_전달한다() throws Exception {
        var result = SkewerCoopSettlementServiceTests.result(200, true, "SKEWER_TIME_UP");
        try (var first = journal()) {
            first.append(result);
            first.append(result);
        }
        try (var second = journal()) {
            assertThat(second.load()).containsExactly(result);
            var conflicting = new SkewerCoopFinished(result.result(), 999, result.served(), 101L, 202L,
                    true, 240_000, 240_000);
            assertThatThrownBy(() -> second.append(conflicting)).isInstanceOf(IllegalStateException.class);
            assertThat(second.load()).containsExactly(result);
        }
    }

    @Test
    void 손상된_확정파일은_건너뛰거나_삭제하지_않고_복구를_중단한다() throws Exception {
        Path damaged = directory.resolve("skewer-coop-00000000-0000-0000-0000-000000000001.json");
        Files.writeString(damaged, "{broken");
        try (var journal = journal()) {
            assertThatThrownBy(journal::load).isInstanceOf(java.io.UncheckedIOException.class);
        }
        assertThat(Files.readString(damaged)).isEqualTo("{broken");
    }

    @Test
    void 동일_저널을_동시에_두_서버가_처리하지_못한다() throws Exception {
        try (var first = journal()) {
            assertThatThrownBy(this::journal).isInstanceOf(java.nio.channels.OverlappingFileLockException.class);
        }
        try (var reopened = journal()) {
            assertThat(reopened.load()).isEmpty();
        }
    }

    private SkewerCoopResultJournal journal() throws Exception {
        return new SkewerCoopResultJournal(directory, mapper);
    }
}
