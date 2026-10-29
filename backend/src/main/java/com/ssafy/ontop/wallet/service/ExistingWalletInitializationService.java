package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.wallet.repository.WalletInitializationGuard;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 명시적인 관리 명령에서만 호출한다. 일반 서버 시작·로그인·조회에서는 실행하지 않는다. */
@Service
@Profile("db")
public class ExistingWalletInitializationService {

    private final WalletRepository wallets;
    private final WalletInitializationService initializer;
    private final WalletInitializationGuard guard;
    private final TransactionTemplate reads;

    public ExistingWalletInitializationService(WalletRepository wallets, WalletInitializationService initializer,
            WalletInitializationGuard guard, PlatformTransactionManager manager) {
        this.wallets = wallets;
        this.initializer = initializer;
        this.guard = guard;
        reads = new TransactionTemplate(manager);
        reads.setReadOnly(true);
    }

    public Summary initializeExistingMembers() {
        reads.executeWithoutResult(status -> guard.verifyNoOrphanTransactions());
        long after = 0;
        long created = 0;
        long preserved = 0;
        long inactive = 0;
        while (true) {
            var ids = wallets.findActiveMemberIdsAfter(after, PageRequest.of(0, 100));
            if (ids.isEmpty()) {
                return new Summary(created, preserved, inactive);
            }
            for (long id : ids) {
                // 프록시가 회원별로 커밋한다. 중단 시 완료된 회원을 보존하며 안전하게 재실행한다.
                switch (initializer.initializeActiveMember(id)) {
                    case CREATED -> created++;
                    case PRESERVED -> preserved++;
                    case INACTIVE -> inactive++;
                }
                after = id;
            }
        }
    }

    public record Summary(long created, long preserved, long inactive) { }
}
