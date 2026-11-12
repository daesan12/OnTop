package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StoneRumbleSettlementTests {
    private final Instant began = Instant.parse("2026-11-07T00:00:00Z"), ended = began.plusSeconds(20);

    @ParameterizedTest
    @ValueSource(ints = {2, 8})
    void 영냥_참가비에서도_순위보상을_저장하고_중복정산은_한번만_지급한다(int count) {
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var wallets = mock(WalletRepository.class);
        var ledger = mock(WalletTransactionRepository.class);
        var events = mock(ApplicationEventPublisher.class);
        var users = IntStream.rangeClosed(1, count).mapToObj(i -> new GameStartCommand.Participant(Integer.toString(i * 101), i)).toList();
        var command = new GameStartCommand(UUID.randomUUID(), "arena", 1, "STONE_RUMBLE", users, null, 0);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        var players = IntStream.rangeClosed(1, count).mapToObj(i -> new GameParticipant(7, i * 101, i, i - 1, 0)).toList();
        var balances = IntStream.rangeClosed(1, count).mapToObj(i -> {
            var wallet = Wallet.forSignup(i * 101, began);
            ReflectionTestUtils.setField(wallet, "id", i * 101L);
            when(wallets.findForUpdateByUserId(i * 101)).thenReturn(Optional.of(wallet));
            return wallet;
        }).toList();
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        var outcomes = IntStream.rangeClosed(1, count).mapToObj(i -> new GameFinished.Participant(i * 101,
                i == 1 ? GameFinished.Result.WIN : GameFinished.Result.FORFEIT,
                i == 1 ? null : GameDepartureReason.DISCONNECT_TIMEOUT, i == 1 ? null : ended.minusSeconds(i),
                i, (count - i + 1) * 10L)).toList();
        var finish = new GameFinished("7:finished", "7", "arena", "STONE_RUMBLE", 50, outcomes, "LAST_PLAYER_STANDING", ended);
        var receive = new GameFinishPersistenceService(sessions, participants, events);
        receive.accept(finish);
        receive.accept(finish);
        var settle = new GameSettlementPersistenceService(sessions, participants, wallets, ledger, Clock.fixed(ended, ZoneOffset.UTC), events);
        settle.settle(7);
        settle.settle(7);

        for (int i = 0; i < count; i++) {
            assertThat(players.get(i).finishRank()).isEqualTo(i + 1);
            assertThat(players.get(i).rankReward()).isEqualTo((count - i) * 10L);
            assertThat(players.get(i).coinDelta()).isEqualTo((count - i) * 10L);
            assertThat(balances.get(i).balance()).isEqualTo(Wallet.SIGNUP_BALANCE + (count - i) * 10L);
        }
        verify(ledger, times(count * 2)).save(any(WalletTransaction.class));
        assertThat(StoredGameResult.forMember(game, players, players.getFirst()).participants().getFirst().rank()).isEqualTo(1);
        if (count == 8) {
            var replaced = new java.util.ArrayList<>(outcomes);
            for (int index : new int[]{1, 2}) {
                var original = outcomes.get(index);
                int rank = index == 1 ? 3 : 2;
                replaced.set(index, new GameFinished.Participant(original.userId(), original.result(), original.leaveReason(),
                        original.leftAt(), rank, (count - rank + 1) * 10L));
            }
            assertThatThrownBy(() -> receive.accept(new GameFinished("7:finished", "7", "arena", "STONE_RUMBLE", 50,
                    replaced, "LAST_PLAYER_STANDING", ended))).isInstanceOf(IllegalStateException.class);
        }
        var changed = new GameFinished("7:finished", "7", "arena", "STONE_RUMBLE", 50,
                List.of(new GameFinished.Participant(101, GameFinished.Result.WIN, null, null, 1, 999L), outcomes.getLast()), "LAST_PLAYER_STANDING", ended);
        assertThatThrownBy(() -> receive.accept(changed)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 공동낙하와_기권이_섞여도_예약은_반환하고_순위보상은_지급한다() {
        var calculation = GameSettlementCalculation.stoneRumble(5,
                List.of(GameFinished.Result.DRAW, GameFinished.Result.DRAW, GameFinished.Result.FORFEIT), List.of(1, 1, 3));
        assertThat(calculation.release()).isTrue();
        assertThat(calculation.awards()).containsExactly(new GameSettlementCalculation.Award(0, 25),
                new GameSettlementCalculation.Award(0, 25), new GameSettlementCalculation.Award(0, 10));
        assertThat(calculation.bonus()).isEqualTo(60);
    }

    @Test
    void 로딩시간_만료는_예약만_반환하고_보상이나_추가원장을_발행하지_않는다() {
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var wallets = mock(WalletRepository.class);
        var ledger = mock(WalletTransactionRepository.class);
        var events = mock(ApplicationEventPublisher.class);
        var command = new GameStartCommand(UUID.randomUUID(), "arena", 1, "STONE_RUMBLE", List.of(
                new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)), null, 5);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        var players = List.of(new GameParticipant(7, 101, 1, 0, 5), new GameParticipant(7, 202, 2, 1, 5));
        var balances = List.of(Wallet.forSignup(101, began), Wallet.forSignup(202, began));
        for (int index = 0; index < balances.size(); index++) {
            var wallet = balances.get(index);
            ReflectionTestUtils.setField(wallet, "id", wallet.userId());
            wallet.reserveGameEntry(5, began);
            when(wallets.findForUpdateByUserId(wallet.userId())).thenReturn(Optional.of(wallet));
        }
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        var finish = new GameFinished("7:finished", "7", "arena", "STONE_RUMBLE", 50, List.of(
                new GameFinished.Participant(101, GameFinished.Result.DRAW, null, null),
                new GameFinished.Participant(202, GameFinished.Result.DRAW, null, null)), "LOADING_TIMEOUT", ended);
        new GameFinishPersistenceService(sessions, participants, events).accept(finish);
        var service = new GameSettlementPersistenceService(sessions, participants, wallets, ledger, Clock.fixed(ended, ZoneOffset.UTC), events);
        service.settle(7); service.settle(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.INVALID);
        assertThat(balances).allSatisfy(wallet -> { assertThat(wallet.balance()).isEqualTo(100); assertThat(wallet.reserved()).isZero(); });
        assertThat(players).allSatisfy(player -> { assertThat(player.rankReward()).isNull(); assertThat(player.coinDelta()).isZero(); });
        verify(ledger, times(2)).save(any(WalletTransaction.class));
    }
}
