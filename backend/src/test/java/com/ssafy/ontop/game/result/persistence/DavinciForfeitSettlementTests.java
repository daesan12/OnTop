package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 실제 엔진의 이탈 이벤트를 공통 결과 저장·정산으로 전달한다. DB I/O만 대역으로 격리한다. */
class DavinciForfeitSettlementTests {
    @ParameterizedTest
    @CsvSource({"2,1", "3,1", "4,1", "2,1000000", "3,1000000", "4,1000000"})
    void 시계가_계속_진행해도_기권종료를_저장하고_한번만_정산한다(int count, long stepNanos) {
        Instant began = Instant.parse("2026-11-23T00:00:00.123456789Z");
        Clock clock = new AdvancingClock(began.plusSeconds(10), stepNanos);
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var wallets = mock(WalletRepository.class);
        var ledger = mock(WalletTransactionRepository.class);
        var published = mock(ApplicationEventPublisher.class);
        var users = IntStream.range(0, count).mapToObj(i -> 11L + i).toList();
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "DAVINCI_CODE",
                IntStream.range(0, count).mapToObj(i -> new GameStartCommand.Participant(
                        users.get(i).toString(), i + 1)).toList(), null, 5);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        var players = IntStream.range(0, count)
                .mapToObj(i -> new GameParticipant(7, users.get(i), i + 1, i, 5)).toList();
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        var balances = users.stream().map(user -> {
            var wallet = Wallet.forSignup(user, began);
            ReflectionTestUtils.setField(wallet, "id", user + 100);
            wallet.reserveGameEntry(5, began);
            when(wallets.findForUpdateByUserId(user)).thenReturn(Optional.of(wallet));
            return wallet;
        }).toList();
        var events = new ArrayList<Object>();
        var engine = new DavinciEngine(new ObjectMapper(), clock, events::add, new GameEngineRouter(), tiles -> { });
        engine.create("7", "table", users);
        var finishes = new GameFinishPersistenceService(sessions, participants, published);
        var settlements = new GameSettlementPersistenceService(sessions, participants, wallets, ledger,
                clock, published, mock(EntityManager.class));

        for (int i = 0; i < count - 1; i++) {
            var leave = new GameForfeitCommand(users.get(i), "7", "leave-" + i);
            assertThat(engine.forfeit(leave).duplicate()).isFalse();
            assertThat(engine.forfeit(leave).duplicate()).isTrue();
        }
        List<GameFinished> finished = events.stream().filter(GameFinished.class::isInstance)
                .map(GameFinished.class::cast).toList();

        assertThat(finished).hasSize(1);
        GameFinished event = finished.getFirst();
        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(7);
        assertThat(event.participants().get(count - 2).leftAt()).isEqualTo(event.endedAt());
        assertThat(finishes.accept(event)).isEqualTo(7);
        assertThat(finishes.accept(event)).isEqualTo(7);
        settlements.settle(7);
        settlements.settle(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.SETTLED);
        assertThat(players.subList(0, count - 1)).allSatisfy(player -> {
            assertThat(player.result()).isEqualTo(GameFinished.Result.FORFEIT);
            assertThat(player.coinDelta()).isEqualTo(-5);
        });
        assertThat(players.getLast().result()).isEqualTo(GameFinished.Result.WIN);
        assertThat(players.getLast().coinDelta()).isEqualTo(5L * (count - 1));
        assertThat(balances.subList(0, count - 1)).allSatisfy(wallet -> assertThat(wallet.balance()).isEqualTo(95));
        assertThat(balances.getLast().balance()).isEqualTo(100 + 5L * (count - 1));
        assertThat(balances).allSatisfy(wallet -> assertThat(wallet.reserved()).isZero());
        verify(ledger, times(count)).save(any());
        verify(published, times(2)).publishEvent(any(GameResultsReady.class));
    }

    private static final class AdvancingClock extends Clock {
        private Instant now;
        private final long stepNanos;

        private AdvancingClock(Instant now, long stepNanos) {
            this.now = now;
            this.stepNanos = stepNanos;
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() {
            Instant result = now;
            now = now.plusNanos(stepNanos);
            return result;
        }
    }
}
