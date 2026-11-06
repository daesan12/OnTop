package com.ssafy.ontop.event.asset;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Reverses ledger deltas after the event start from one consistent wallet snapshot. */
final class AssetBalanceReconstruction {
    private AssetBalanceReconstruction() {}

    static List<Snapshot> reconstruct(List<Wallet> wallets, List<Change> changes,
            Instant startsAt, Instant endsAt) {
        Map<Long, List<Change>> byWallet = new HashMap<>();
        for (Change change : changes) {
            if (change.createdAt().isBefore(startsAt)) {
                throw new IllegalStateException("행사 시작 전 거래가 포함되었습니다.");
            }
            byWallet.computeIfAbsent(change.walletId(), ignored -> new ArrayList<>()).add(change);
        }
        Comparator<Change> sequence = Comparator.comparing(Change::createdAt).thenComparingLong(Change::id);
        List<Snapshot> result = new ArrayList<>();
        for (Wallet wallet : wallets) {
            if (!wallet.userCreatedAt().isBefore(endsAt)) {
                continue;
            }
            List<Change> ledger = byWallet.getOrDefault(wallet.walletId(), List.of()).stream()
                    .sorted(sequence).toList();
            long opening = wallet.currentBalance();
            for (Change change : ledger) {
                opening = Math.subtractExact(opening, change.balanceDelta());
            }
            if (opening < 0) {
                throw new IllegalStateException("원장과 지갑 잔액이 일치하지 않습니다.");
            }
            long cutoff = opening;
            for (Change change : ledger) {
                if (change.createdAt().isBefore(endsAt)) {
                    cutoff = Math.addExact(cutoff, change.balanceDelta());
                    if (cutoff < 0) {
                        throw new IllegalStateException("마감 전 잔액이 음수입니다.");
                    }
                }
            }
            Instant firstReached = opening == cutoff
                    ? max(startsAt, wallet.userCreatedAt()) : null;
            Long reachedTransactionId = null;
            if (firstReached == null) {
                long running = opening;
                for (Change change : ledger) {
                    if (!change.createdAt().isBefore(endsAt)) {
                        break;
                    }
                    running = Math.addExact(running, change.balanceDelta());
                    if (running == cutoff) {
                        firstReached = change.createdAt();
                        reachedTransactionId = change.id();
                        break;
                    }
                }
            }
            if (firstReached == null) {
                throw new IllegalStateException("마감 잔액에 도달한 원장 기록을 찾지 못했습니다.");
            }
            result.add(new Snapshot(wallet.userId(), wallet.walletId(), cutoff,
                    firstReached, reachedTransactionId));
        }
        return result;
    }

    private static Instant max(Instant first, Instant second) {
        return first.isAfter(second) ? first : second;
    }

    record Wallet(long walletId, long userId, long currentBalance, Instant userCreatedAt) {}
    record Change(long id, long walletId, long balanceDelta, Instant createdAt) {}
    record Snapshot(long userId, long walletId, long coinBalance, Instant firstReachedAt,
            Long firstReachedTransactionId) {}
}
