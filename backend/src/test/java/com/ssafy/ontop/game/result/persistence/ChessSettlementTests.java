package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.chess.service.ChessEngine;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 실제 엔진·정산 서비스·지갑 도메인을 연결한다. 저장소 대역이므로 DB 트랜잭션 검증은 아니다. */
class ChessSettlementTests {
    private final Instant began = Instant.parse("2026-11-23T00:00:00Z"), ended = began.plusSeconds(20);

    @ParameterizedTest
    @CsvSource({"101,0", "202,0", "101,1", "202,1", "101,500", "202,500"})
    void 백흑_기권은_종료와_로비를_연결하고_예약과_승패금액을_한번만_정산한다(long forfeiter, long bet) {
        var fixture = new Settlement(bet);
        var notices = new ArrayList<Object>();
        var engine = new ChessEngine(new ObjectMapper(), Clock.fixed(ended, ZoneOffset.UTC),
                notices::add, new GameEngineRouter());
        engine.create("7", "table", List.of(101L, 202L));
        var command = new GameForfeitCommand(forfeiter, "7", "surrender");

        engine.forfeit(command);
        engine.forfeit(command);
        engine.tick();
        var finished = notices.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).toList();
        assertThat(finished).hasSize(1);
        var event = finished.getFirst();
        fixture.finish.accept(event);
        fixture.finish.accept(event);
        var tables = mock(TableHub.class);
        var results = mock(GameResultService.class);
        new GameFinishedResultListener(results, Optional.of(tables)).finished(event);

        assertThat(engine.load(forfeiter, "7").orElseThrow().publicState().path("status").asText())
                .isEqualTo("FINISHED");
        verify(tables).roundEnded("table", "7");
        verify(results).finished("7", List.of(101L, 202L));
        assertThat(StoredGameResult.forMember(fixture.game, fixture.players, fixture.players.getFirst()).myCoinDelta())
                .isNull();
        fixture.settle.settle(7);
        fixture.finish.accept(event);
        fixture.settle.settle(7);

        for (int index = 0; index < fixture.players.size(); index++) {
            var player = fixture.players.get(index);
            var wallet = fixture.balances.get(index);
            boolean lost = player.userId() == forfeiter;
            long delta = lost ? -bet : bet;
            assertThat(player.result()).isEqualTo(lost ? GameFinished.Result.FORFEIT : GameFinished.Result.WIN);
            assertThat(player.coinDelta()).isEqualTo(delta);
            assertThat(player.reservationReleasedAt()).isEqualTo(ended);
            assertThat(wallet.balance()).isEqualTo(1000 + delta);
            assertThat(wallet.reserved()).isZero();
            var result = StoredGameResult.forMember(fixture.game, fixture.players, player);
            assertThat(result.settlementStatus()).isEqualTo(GameResultView.SettlementStatus.SETTLED);
            assertThat(result.myCoinDelta()).isEqualTo(delta);
            assertThat(result.endReason()).isEqualTo("EXPLICIT_LEAVE");
            if (lost) {
                assertThat(player.leaveReason()).isEqualTo(GameDepartureReason.EXPLICIT_LEAVE);
            }
        }
        assertThat(fixture.balances.stream().mapToLong(Wallet::balance).sum()).isEqualTo(2000);
        var ledger = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(fixture.ledger, times(2)).save(ledger.capture());
        assertThat(ledger.getAllValues()).extracting(WalletTransaction::balanceDelta)
                .containsExactlyInAnyOrder(-bet, bet);
        var ready = ArgumentCaptor.forClass(GameResultsReady.class);
        verify(fixture.events, times(2)).publishEvent(ready.capture());
        assertThat(ready.getAllValues().getLast().results()).allSatisfy(result ->
                assertThat(result.settlementStatus()).isEqualTo(GameResultView.SettlementStatus.SETTLED));
        // 종료된 경기의 기록은 보존하되 진행 점유가 다음 경기 생성을 막지 않아야 한다.
        engine.create("8", "table", List.of(101L, 202L));
    }

    @Test
    void 유상_합의무승부는_원금_손익없이_양쪽_예약만_해제한다() {
        var fixture = new Settlement(500);
        var event = new GameFinished("7:finished", "7", "table", "CHESS", 1,
                List.of(new GameFinished.Participant(101, GameFinished.Result.DRAW, null, null),
                        new GameFinished.Participant(202, GameFinished.Result.DRAW, null, null)), "AGREED_DRAW", ended);

        fixture.finish.accept(event);
        fixture.settle.settle(7);
        fixture.settle.settle(7);

        assertThat(fixture.balances).allSatisfy(wallet -> {
            assertThat(wallet.balance()).isEqualTo(1000);
            assertThat(wallet.reserved()).isZero();
        });
        assertThat(fixture.players).allSatisfy(player -> assertThat(player.coinDelta()).isZero());
        verify(fixture.ledger, times(2)).save(org.mockito.ArgumentMatchers.any(WalletTransaction.class));
    }

    @Test
    void 기권_정산후_승자를_바꾼_동일이벤트는_잔액을_다시_변경하지_않는다() {
        var fixture = new Settlement(500);
        var event = new GameFinished("7:finished", "7", "table", "CHESS", 1, List.of(
                new GameFinished.Participant(101, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, ended),
                new GameFinished.Participant(202, GameFinished.Result.WIN, null, null)), "EXPLICIT_LEAVE", ended);
        fixture.finish.accept(event);
        fixture.settle.settle(7);
        var forged = new GameFinished("7:finished", "7", "table", "CHESS", 1, List.of(
                new GameFinished.Participant(101, GameFinished.Result.WIN, null, null),
                new GameFinished.Participant(202, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, ended)),
                "EXPLICIT_LEAVE", ended);

        assertThatThrownBy(() -> fixture.finish.accept(forged)).isInstanceOf(IllegalStateException.class);

        assertThat(fixture.balances).extracting(Wallet::balance).containsExactly(500L, 1500L);
        verify(fixture.ledger, times(2)).save(org.mockito.ArgumentMatchers.any(WalletTransaction.class));
    }

    private final class Settlement {
        final GameSession game;
        final List<GameParticipant> players;
        final List<Wallet> balances;
        final WalletTransactionRepository ledger = mock(WalletTransactionRepository.class);
        final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        final GameFinishPersistenceService finish;
        final GameSettlementPersistenceService settle;

        Settlement(long bet) {
            var sessions = mock(GameSessionRepository.class);
            var participants = mock(GameParticipantRepository.class);
            var wallets = mock(WalletRepository.class);
            var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "CHESS", List.of(
                    new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)), null, bet);
            game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
            ReflectionTestUtils.setField(game, "id", 7L);
            game.reserve(began);
            game.markStarted(began);
            players = List.of(new GameParticipant(7, 101, 1, 0, bet), new GameParticipant(7, 202, 2, 1, bet));
            balances = List.of(Wallet.forSignup(101, began), Wallet.forSignup(202, began));
            for (int index = 0; index < balances.size(); index++) {
                var wallet = balances.get(index);
                ReflectionTestUtils.setField(wallet, "id", wallet.userId());
                wallet.creditReward(900, began);
                wallet.reserveGameEntry(bet, began);
                when(wallets.findForUpdateByUserId(wallet.userId())).thenReturn(Optional.of(wallet));
            }
            when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
            when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
            finish = new GameFinishPersistenceService(sessions, participants, events);
            settle = new GameSettlementPersistenceService(sessions, participants, wallets, ledger,
                    Clock.fixed(ended, ZoneOffset.UTC), events, mock(EntityManager.class));
        }
    }
}
