package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import com.ssafy.ontop.table.domain.TableGame;
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

/** 할리갈리(HALLI_GALLI)의 공통 시작 연결: 예약 커밋 뒤에만 엔진을 만들고, 2~4인만 예약한다. */
class HalliGalliStartTests {
    private final GameStartGateway gateway = mock(GameStartGateway.class);
    private final HalliGalliEngine engine = mock(HalliGalliEngine.class);

    @Test
    void 테이블_게임으로_2명부터_4명까지_등록되어_있다() {
        TableGame game = TableGame.find("HALLI_GALLI");

        assertThat(game).isEqualTo(TableGame.HALLI_GALLI);
        assertThat(game.minimumPlayers()).isEqualTo(2);
        assertThat(game.maximumPlayers()).isEqualTo(4);
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 엔진이_켜져있으면_2명부터_4명까지_예약_커밋_뒤에_엔진을_생성한다(int count) {
        var command = command(count);
        when(gateway.startGame(command)).thenReturn(GameStartResult.reserved(command, "7"));

        var result = service(Optional.of(engine)).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.RESERVED);
        verify(engine).create("7", "table", IntStream.rangeClosed(1, count).mapToObj(i -> 10L + i).toList());
    }

    @Test
    void 예약이_확정되지_않으면_엔진을_생성하지_않는다() {
        var command = command(3);
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()));

        var result = service(Optional.of(engine)).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        verify(engine, never()).create(anyString(), anyString(), anyList());
    }

    @Test
    void 엔진이_꺼져있으면_예약_요청_전에_거절한다() {
        var command = command(2);

        var result = service(Optional.empty()).start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        assertThat(result.code()).isEqualTo("GAME_RUNTIME_UNAVAILABLE");
        verify(gateway, never()).startGame(any());
    }

    @Test
    void 결과_불명_재조회도_같은_경기_ID로만_엔진을_만든다() {
        var command = command(2);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(GameStartResult.reserved(command, "7"));

        service(Optional.of(engine)).find(command);

        verify(gateway, never()).startGame(any());
        verify(engine).create("7", "table", java.util.List.of(11L, 12L));
    }

    @Test
    void 허용_인원_밖이거나_목표점수가_있으면_시작_요청을_거절한다() {
        assertThatIllegalArgumentException().isThrownBy(() -> command(1));
        assertThatIllegalArgumentException().isThrownBy(() -> command(5));
        assertThatIllegalArgumentException().isThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table", 1,
                "HALLI_GALLI", command(2).participants(), 4000, 5));

        for (int count = 2; count <= 4; count++) {
            assertThat(GameReservationRequest.from(command(count))).isNotNull();
        }
    }

    private CommittedGameStartService service(Optional<HalliGalliEngine> halligalli) {
        return new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), halligalli, Optional.empty(), true, false);
    }

    private static GameStartCommand command(int count) {
        var participants = IntStream.rangeClosed(1, count)
                .mapToObj(i -> new GameStartCommand.Participant(String.valueOf(10 + i), i)).toList();
        return new GameStartCommand(UUID.randomUUID(), "table", 1, "HALLI_GALLI", participants, null, 5);
    }
}
