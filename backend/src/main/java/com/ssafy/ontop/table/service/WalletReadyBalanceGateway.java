package com.ssafy.ontop.table.service;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.service.WalletQueryService;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class WalletReadyBalanceGateway implements ReadyBalanceGateway {
    private final WalletQueryService wallets;

    public WalletReadyBalanceGateway(WalletQueryService wallets) { this.wallets = wallets; }

    @Override
    public long availableBalance(long userId) { return wallets.findBalance(userId).availableBalance(); }
}
