package com.ssafy.ontop.admin.walletgrant.service;

import com.ssafy.ontop.admin.walletgrant.AdminWalletGrantException;
import com.ssafy.ontop.admin.walletgrant.domain.AdminWalletGrantBatch;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteResponse;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewResponse;
import com.ssafy.ontop.admin.walletgrant.repository.AdminWalletGrantRepository;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class AdminWalletGrantService {
    static final long MAX_AMOUNT_PER_MEMBER = 1_000_000L;
    static final int MAX_REASON_LENGTH = 200;

    private final UserRepository users;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final AdminWalletGrantRepository grants;
    private final TransactionTemplate reads;
    private final TransactionTemplate writes;
    private final Clock clock;

    public AdminWalletGrantService(UserRepository users, WalletRepository wallets,
            WalletTransactionRepository ledger, AdminWalletGrantRepository grants,
            PlatformTransactionManager transactions, Clock clock) {
        this.users = users;
        this.wallets = wallets;
        this.ledger = ledger;
        this.grants = grants;
        this.reads = transaction(transactions, true);
        this.writes = transaction(transactions, false);
        this.clock = clock;
    }

    public AdminWalletGrantPreviewResponse preview(long administratorUserId, AdminWalletGrantPreviewRequest request) {
        validateAdministrator(administratorUserId);
        ValidatedGrant grant = validate(request == null ? 0 : request.amountPerMember(),
                request == null ? null : request.reason());
        return Objects.requireNonNull(reads.execute(status -> {
            long recipientCount = users.countByDeletedAtIsNull();
            long readyWalletCount = wallets.countForActiveMembers();
            if (readyWalletCount > recipientCount) {
                throw unavailable();
            }
            long missingWalletCount = recipientCount - readyWalletCount;
            long totalAmount = total(grant.amountPerMember(), recipientCount);
            return new AdminWalletGrantPreviewResponse(grant.amountPerMember(), grant.reason(), recipientCount,
                    missingWalletCount, totalAmount, recipientCount > 0 && missingWalletCount == 0);
        }));
    }

    public AdminWalletGrantExecuteResponse execute(long administratorUserId,
            AdminWalletGrantExecuteRequest request) {
        validateAdministrator(administratorUserId);
        if (request == null || request.requestId() == null || request.expectedRecipientCount() <= 0) {
            throw invalid("요청 ID와 미리보기 인원을 확인하세요.");
        }
        ValidatedGrant grant = validate(request.amountPerMember(), request.reason());
        var previous = readBatch(request.requestId());
        if (previous != null) {
            return repeated(previous, administratorUserId, grant);
        }
        try {
            return Objects.requireNonNull(writes.execute(status -> executeInTransaction(
                    administratorUserId, request, grant)));
        } catch (DataIntegrityViolationException exception) {
            AdminWalletGrantBatch raced = readBatch(request.requestId());
            if (raced != null) {
                return repeated(raced, administratorUserId, grant);
            }
            throw exception;
        }
    }

    private AdminWalletGrantExecuteResponse executeInTransaction(long administratorUserId,
            AdminWalletGrantExecuteRequest request, ValidatedGrant grant) {
        var previous = grants.findBatch(request.requestId());
        if (previous.isPresent()) {
            return repeated(previous.get(), administratorUserId, grant);
        }
        // 실행 시작 시점의 활성 회원을 지급 대상으로 고정하고, 회원 행은 잠그지 않는다.
        List<Long> userIds = users.findAllActiveIdsForAdminGrant();
        if (!userIds.contains(administratorUserId)) {
            throw new AdminWalletGrantException(409, "ADMIN_MEMBER_STATE_CHANGED",
                    "관리자 회원 상태가 변경되었습니다. 다시 로그인해주세요.");
        }
        if (userIds.isEmpty()) {
            throw new AdminWalletGrantException(409, "ADMIN_WALLET_GRANT_NO_RECIPIENTS",
                    "지급할 활성 회원이 없습니다.");
        }
        if (request.expectedRecipientCount() != userIds.size()) {
            throw new AdminWalletGrantException(409, "ADMIN_WALLET_GRANT_TARGET_CHANGED",
                    "지급 대상 인원이 변경되었습니다. 미리보기를 다시 확인해주세요.");
        }
        List<Wallet> targetWallets = wallets.findForUpdateByUserIds(userIds);
        if (targetWallets.size() != userIds.size()
                || !targetWallets.stream().map(Wallet::userId).toList().equals(userIds)) {
            throw new AdminWalletGrantException(409, "ADMIN_WALLET_GRANT_WALLETS_NOT_READY",
                    "지갑이 준비되지 않은 회원이 있습니다.");
        }

        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        long totalAmount = total(grant.amountPerMember(), targetWallets.size());
        long batchId = grants.insertBatch(request.requestId(), administratorUserId, grant.amountPerMember(),
                grant.reason(), targetWallets.size(), totalAmount, now);
        for (Wallet wallet : targetWallets) {
            long balanceBefore = wallet.balance();
            try {
                wallet.creditAdminGrant(grant.amountPerMember(), now);
            } catch (ArithmeticException | IllegalArgumentException exception) {
                throw new AdminWalletGrantException(409, "ADMIN_WALLET_GRANT_WALLET_STATE_INVALID",
                        "지급할 수 없는 지갑 상태가 발견되었습니다.");
            }
            WalletTransaction entry = ledger.save(WalletTransaction.adminBulkGrant(
                    wallet.id(), batchId, wallet.userId(), grant.amountPerMember(), now));
            grants.insertEntry(batchId, wallet.userId(), entry.id(), balanceBefore, wallet.balance());
        }
        return new AdminWalletGrantExecuteResponse(batchId, request.requestId(), grant.amountPerMember(),
                grant.reason(), targetWallets.size(), totalAmount, now);
    }

    private AdminWalletGrantBatch readBatch(UUID requestId) {
        return reads.execute(status -> grants.findBatch(requestId).orElse(null));
    }

    private AdminWalletGrantExecuteResponse repeated(AdminWalletGrantBatch batch, long administratorUserId,
            ValidatedGrant grant) {
        if (batch.administratorUserId() != administratorUserId
                || batch.amountPerMember() != grant.amountPerMember()
                || !batch.reason().equals(grant.reason())) {
            throw new AdminWalletGrantException(409, "ADMIN_WALLET_GRANT_REQUEST_CONFLICT",
                    "같은 요청 ID가 다른 지급 내용에 사용되었습니다.");
        }
        return new AdminWalletGrantExecuteResponse(batch.id(), batch.requestId(), batch.amountPerMember(),
                batch.reason(), batch.recipientCount(), batch.totalAmount(), batch.executedAt());
    }

    private ValidatedGrant validate(long amountPerMember, String reason) {
        String normalizedReason = reason == null ? "" : reason.trim();
        if (amountPerMember <= 0 || amountPerMember > MAX_AMOUNT_PER_MEMBER) {
            throw invalid("1인당 지급액은 1냥 이상 1,000,000냥 이하여야 합니다.");
        }
        if (normalizedReason.isEmpty() || normalizedReason.length() > MAX_REASON_LENGTH) {
            throw invalid("지급 사유는 1자 이상 200자 이하여야 합니다.");
        }
        return new ValidatedGrant(amountPerMember, normalizedReason);
    }

    private long total(long amountPerMember, long recipientCount) {
        try {
            return Math.multiplyExact(amountPerMember, recipientCount);
        } catch (ArithmeticException exception) {
            throw invalid("총 지급액이 허용 범위를 초과합니다.");
        }
    }

    private void validateAdministrator(long administratorUserId) {
        if (administratorUserId <= 0) {
            throw invalid("관리자 회원 정보를 확인하세요.");
        }
    }

    private AdminWalletGrantException invalid(String message) {
        return new AdminWalletGrantException(400, "INVALID_REQUEST", message);
    }

    private AdminWalletGrantException unavailable() {
        return new AdminWalletGrantException(503, "ADMIN_WALLET_GRANT_UNAVAILABLE",
                "엽전 지급 정보를 확인할 수 없습니다.");
    }

    private TransactionTemplate transaction(PlatformTransactionManager manager, boolean readOnly) {
        var template = new TransactionTemplate(manager);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        template.setReadOnly(readOnly);
        return template;
    }

    private record ValidatedGrant(long amountPerMember, String reason) {
    }
}
