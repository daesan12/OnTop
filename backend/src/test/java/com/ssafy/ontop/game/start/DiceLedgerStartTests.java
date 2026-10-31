package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.ledger.service.DiceLedgerEngine;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 주사위 장부(DICE_LEDGER)의 공통 시작 연결: 예약 커밋 뒤에만 엔진을 만들고, 게임별 시작 검증과 충돌하지 않는다. */
class DiceLedgerStartTests {
    private final GameStartGateway gateway = mock(GameStartGateway.class);
    private final DiceLedgerEngine engine = mock(DiceLedgerEngine.class);

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 엔진이_켜져있으면_2명부터_4명까지_예약_커밋_뒤에_엔진을_생성한다(int count) {
        var command = command(count, null);
        when(gateway.startGame(command)).thenReturn(GameStartResult.reserved(command, "7"));

        var result = service(Optional.of(engine)).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.RESERVED);
        verify(engine).create("7", "table", IntStream.rangeClosed(1, count).mapToObj(i -> 10L + i).toList());
    }

    @Test
    void 예약이_확정되지_않으면_엔진을_생성하지_않는다() {
        var command = command(3, null);
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()));

        var result = service(Optional.of(engine)).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        verify(engine, never()).create(anyString(), anyString(), anyList());
    }

    @Test
    void 엔진이_꺼져있으면_예약_요청_전에_거절한다() {
        var command = command(2, null);

        var result = service(Optional.empty()).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        assertThat(result.code()).isEqualTo("GAME_RUNTIME_UNAVAILABLE");
        verify(gateway, never()).startGame(any());
    }

    @Test
    void 주사위_한판_전용_목표점수를_받지않고_시작과_예약은_2명부터_4명까지만_허용한다() {
        assertThatIllegalArgumentException().isThrownBy(() -> command(2, 4000));
        assertThatIllegalArgumentException().isThrownBy(() -> command(1, null));

        for (int count = 2; count <= 4; count++) {
            assertThat(GameReservationRequest.from(command(count, null))).isNotNull();
        }
    }

    private CommittedGameStartService service(Optional<DiceLedgerEngine> ledger) {
        return new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), ledger, Optional.empty(), true, false);
    }

    private static GameStartCommand command(int count, Integer targetScore) {
        var participants = IntStream.rangeClosed(1, count)
                .mapToObj(i -> new GameStartCommand.Participant(String.valueOf(10 + i), i)).toList();
        return new GameStartCommand(UUID.randomUUID(), "table", 1, "DICE_LEDGER", participants, targetScore, 5);
    }
}
