package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameSettlementPersistenceService {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final EntityManager entities;

    public GameSettlementPersistenceService(GameSessionRepository sessions, GameParticipantRepository participants,
            WalletRepository wallets, WalletTransactionRepository ledger, @Qualifier("oauthClock") Clock clock,
            ApplicationEventPublisher events, EntityManager entities) {
        this.sessions = sessions; this.participants = participants; this.wallets = wallets;
        this.ledger = ledger; this.clock = clock; this.events = events;
        this.entities = entities;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public void settle(long gameId) {
        GameSession game = sessions.findForUpdateById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("확정된 경기가 없습니다."));
        if (game.settlementStatus() == GameSession.SettlementStatus.SETTLED) { return; }
        boolean invalid = game.status() == GameSession.Status.INVALID;
        if (game.settlementStatus() != GameSession.SettlementStatus.PENDING || game.endedAt() == null
                || game.endReason() == null
                || !invalid && (game.status() != GameSession.Status.FINISHED || !game.hasFinish())) {
            throw new IllegalStateException("저장된 종료 결과가 필요합니다.");
        }
        var players = participants.findByGameSessionIdOrderByParticipantOrder(gameId);
        if (players.size() != game.participantCount() || game.totalPot() != Math.multiplyExact(game.betAmountPerPlayer(), players.size())
                || players.stream().anyMatch(p -> p.reservedAmount() != game.betAmountPerPlayer()
                    || p.reservationReleasedAt() != null || p.coinDelta() != null)) {
            throw new IllegalStateException("경기 예약 상태가 일치하지 않습니다.");
        }
        boolean stone = "STONE_RUMBLE".equals(game.gameCode());
        boolean freeStone = stone && game.betAmountPerPlayer() == 0;
        var calculation = invalid ? GameSettlementCalculation.refund(players.size())
                : stone ? GameSettlementCalculation.stoneRumble(game.betAmountPerPlayer(),
                    players.stream().map(GameParticipant::result).toList(), players.stream().map(GameParticipant::finishRank).toList())
                : GameSettlementCalculation.calculate(game.betAmountPerPlayer(),
                    players.stream().map(GameParticipant::result).toList());
        Map<Long, Wallet> locked = new HashMap<>();
        for (var player : players.stream().sorted(Comparator.comparingLong(GameParticipant::userId)).toList()) {
            // 탈퇴한 참가자의 원래 지갑도 정산한다. 새 지갑/가입 보너스를 생성하지 않는다.
            locked.put(player.userId(), wallets.findForUpdateByUserId(player.userId())
                    .orElseThrow(() -> new IllegalStateException("경기 지갑을 확인할 수 없습니다.")));
        }
        var now = VerifiedGameFinish.millis(clock.instant());
        long sum = 0;
        long withheld = 0;
        for (int index = 0; index < players.size(); index++) {
            var player = players.get(index);
            var award = calculation.awards().get(index);
            Wallet wallet = locked.get(player.userId());
            long nominalReward = !invalid && stone ? player.rankReward() : 0;
            long rankReward = freeStone && nominalReward > 0
                    ? MinigameRewardBudget.grantToday(entities, player.userId(), nominalReward, now)
                    : nominalReward;
            long otherDelta = Math.subtractExact(award.netDelta(), nominalReward);
            long actualDelta = Math.addExact(otherDelta, rankReward);
            withheld = Math.addExact(withheld, nominalReward - rankReward);
            if (!freeStone) {
                wallet.settleGame(game.betAmountPerPlayer(), otherDelta, now);
                ledger.save(WalletTransaction.gameClose(wallet.id(), gameId, player.userId(),
                        game.betAmountPerPlayer(), award.potDelta(), calculation.release(), now));
            }
            if (rankReward > 0) { wallet.creditReward(rankReward, now); }
            if (rankReward > 0) {
                ledger.save(WalletTransaction.gameRankReward(wallet.id(), gameId, player.userId(), rankReward, now));
            }
            if (award.bonus() > nominalReward) {
                ledger.save(WalletTransaction.gameTieBonus(wallet.id(), gameId, player.userId(), award.bonus() - nominalReward, now));
            }
            if (invalid) {
                player.releaseInvalidReservation(now);
            } else {
                player.closeReservation(actualDelta, now);
            }
            sum = Math.addExact(sum, actualDelta);
        }
        long paidBonus = Math.subtractExact(calculation.bonus(), withheld);
        if (sum != paidBonus) { throw new IllegalStateException("정산 합계가 일치하지 않습니다."); }
        if (invalid) {
            game.completeInvalidation(now);
        } else {
            game.settle(paidBonus, calculation.payoutPerWinner(), now);
        }
        ledger.flush();
        sessions.flush();
        events.publishEvent(new GameResultsReady(game.tableId(), players.stream()
                .map(p -> StoredGameResult.forMember(game, players, p)).toList()));
    }
}
