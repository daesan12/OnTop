package com.ssafy.ontop.world.balloon;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class BalloonFareService {
    static final long FARE = 100;

    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;
    private final WorldChannelRegistry channels;
    private final BalloonStation station;

    public BalloonFareService(WalletRepository wallets, WalletTransactionRepository transactions,
            WorldChannelRegistry channels, WorldMapRuntime map) {
        this.wallets = wallets;
        this.transactions = transactions;
        this.channels = channels;
        this.station = map.prepared().map(BalloonStation::findIn).orElse(null);
    }

    @Transactional(timeout = 4)
    public Receipt buy(long userId, UUID requestId) {
        if (station == null || !station.canBoard(channels.positionOf(Long.toString(userId)))) {
            throw new Rejected("BALLOON_STATION_REQUIRED", "하늘언덕 승강장으로 이동해 주세요.");
        }
        var wallet = wallets.findForUpdateByUserId(userId)
                .orElseThrow(() -> new Rejected("WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시도해 주세요."));
        String key = "balloon:" + wallet.id() + ":" + requestId;
        var prior = transactions.findByWalletIdAndIdempotencyKey(wallet.id(), key);
        if (prior.isPresent()) {
            return new Receipt(requestId, -prior.get().balanceDelta(), prior.get().createdAt());
        }
        if (wallet.balance() - wallet.reserved() < FARE) {
            throw new Rejected("INSUFFICIENT_COINS", "열기구에 타려면 100냥이 필요해요.");
        }
        Instant now = Instant.now();
        wallet.debit(FARE, now);
        transactions.save(WalletTransaction.balloonFare(wallet.id(), FARE, key, now));
        return new Receipt(requestId, FARE, now);
    }

    public record Receipt(UUID requestId, long fee, @com.fasterxml.jackson.annotation.JsonIgnore Instant paidAt) { }

    static final class Rejected extends RuntimeException {
        private final String code;

        Rejected(String code, String message) {
            super(message);
            this.code = code;
        }

        String code() { return code; }
    }
}
