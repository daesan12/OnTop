package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.quoridor.service.QuoridorEngine;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
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
import java.util.Random;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 실제 종료 저장·정산 서비스와 지갑 도메인 검증. Repository/트랜잭션은 대역이므로 DB 검증과 구분한다. */
class QuoridorSettlementTests {
    @ParameterizedTest
    @CsvSource({"2,0,false", "2,7,false", "4,7,false", "2,7,true", "4,7,true"})
    void 엔진의_기권과_도착_결과는_예약을_한번_해제하고_승패_금액과_원장을_보존한다(
            int count, long bet, boolean goal) {
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var wallets = mock(WalletRepository.class);
        var ledger = mock(WalletTransactionRepository.class);
        var events = mock(ApplicationEventPublisher.class);
        Instant began = Instant.parse("2026-11-23T00:00:00Z");
        Instant[] now = {began};
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0]; }
        };
        var users = IntStream.rangeClosed(1, count).mapToObj(i -> i * 101L).toList();
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "QUORIDOR",
                IntStream.range(0, count).mapToObj(i -> new GameStartCommand.Participant(
                        users.get(i).toString(), i + 1)).toList(), null, bet);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        var players = IntStream.range(0, count).mapToObj(i -> new GameParticipant(7, users.get(i), i + 1, i, bet))
                .toList();
        List<Wallet> balances = new ArrayList<>();
        for (long user : users) {
            var wallet = Wallet.forSignup(user, began);
            ReflectionTestUtils.setField(wallet, "id", user + 1000);
            wallet.reserveGameEntry(bet, began);
            balances.add(wallet);
            when(wallets.findForUpdateByUserId(user)).thenReturn(Optional.of(wallet));
        }
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        var finishes = new GameFinishPersistenceService(sessions, participants, events);
        var settlements = new GameSettlementPersistenceService(sessions, participants, wallets, ledger,
                clock, events, mock(EntityManager.class));
        List<GameFinished> ended = new ArrayList<>();
        var engine = new QuoridorEngine(new ObjectMapper(), clock, event -> {
            if (event instanceof GameFinished finish) { ended.add(finish); }
        }, new GameEngineRouter(), new Random(1));
        engine.create("7", "table", users);

        if (goal) {
            for (int turn = 0; turn < 100 && ended.isEmpty(); turn++) {
                now[0] = now[0].plusSeconds(30);
                engine.tick();
            }
        } else {
            now[0] = began.plusSeconds(10);
            for (int i = 0; i < count - 1; i++) {
                engine.forfeit(new GameForfeitCommand(users.get(i), "7", "leave-" + i));
                if (i < count - 2) {
                    assertThat(ended).isEmpty();
                    assertThat(balances).allSatisfy(wallet -> {
                        assertThat(wallet.balance()).isEqualTo(100);
                        assertThat(wallet.reserved()).isEqualTo(bet);
                    });
                }
            }
        }
        assertThat(ended).hasSize(1);
        GameFinished finish = ended.getFirst();
        finishes.accept(finish);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.PENDING);
        settlements.settle(7);
        finishes.accept(finish);
        settlements.settle(7);

        long winner = finish.participants().stream().filter(p -> p.result() == GameFinished.Result.WIN)
                .findFirst().orElseThrow().userId();
        for (int i = 0; i < count; i++) {
            long delta = users.get(i) == winner ? bet * (count - 1) : -bet;
            assertThat(balances.get(i).balance()).isEqualTo(100 + delta);
            assertThat(balances.get(i).reserved()).isZero();
            assertThat(players.get(i).coinDelta()).isEqualTo(delta);
            assertThat(players.get(i).reservationReleasedAt()).isEqualTo(now[0]);
            assertThat(players.get(i).result()).isEqualTo(finish.participants().get(i).result());
        }
        assertThat(balances.stream().mapToLong(Wallet::balance).sum()).isEqualTo(100L * count);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.SETTLED);
        assertThat(game.resultVersion()).isEqualTo(2);
        var entries = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(ledger, times(count)).save(entries.capture());
        assertThat(entries.getAllValues()).allSatisfy(entry -> assertThat(
                ReflectionTestUtils.getField(entry, "transactionType")).isEqualTo("GAME_SETTLEMENT"));
        assertThat(entries.getAllValues().stream().mapToLong(entry -> (long) ReflectionTestUtils.getField(
                entry, "balanceDelta")).sum()).isZero();
        verify(events, times(2)).publishEvent(org.mockito.ArgumentMatchers.any(GameResultsReady.class));
    }
}
