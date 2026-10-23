package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.wallet.dto.WalletBalanceResponse;
import com.ssafy.ontop.wallet.dto.WalletTransactionPageRequest;
import com.ssafy.ontop.wallet.dto.WalletTransactionPageResponse;
import com.ssafy.ontop.wallet.exception.WalletQueryException;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class WalletQueryService {

    private final ObjectProvider<WalletRepository> wallets;
    private final ObjectProvider<WalletTransactionRepository> transactions;

    public WalletQueryService(ObjectProvider<WalletRepository> wallets,
            ObjectProvider<WalletTransactionRepository> transactions) {
        // UserProfileService와 같이 DB 없는 기본/local/dev 실행도 유지한다.
        this.wallets = wallets;
        this.transactions = transactions;
    }

    public WalletBalanceResponse findBalance(long userId) {
        WalletRepository repository = wallets.getIfAvailable();
        if (repository == null) {
            throw new WalletQueryException(WalletQueryException.Error.STORAGE);
        }
        try {
            // Repository의 읽기 전용 트랜잭션을 사용한다. 초기화·쓰기 잠금·지급을 호출하지 않는다.
            var wallet = repository.findByUserId(userId)
                    .orElseThrow(() -> new WalletQueryException(WalletQueryException.Error.NOT_READY));
            long balance = wallet.balance();
            long reserved = wallet.reserved();
            if (reserved < 0 || balance < reserved) {
                throw new WalletQueryException(WalletQueryException.Error.STORAGE);
            }
            return new WalletBalanceResponse(balance, reserved, balance - reserved);
        } catch (DataAccessException | TransactionException exception) {
            // SQL·접속 정보·DB 예외 원문은 응답이나 로그로 전달하지 않는다.
            throw new WalletQueryException(WalletQueryException.Error.STORAGE);
        }
    }

    public WalletTransactionPageResponse findTransactions(long userId, WalletTransactionPageRequest request) {
        WalletRepository walletRepository = wallets.getIfAvailable();
        WalletTransactionRepository transactionRepository = transactions.getIfAvailable();
        if (walletRepository == null || transactionRepository == null) {
            throw new WalletQueryException(WalletQueryException.Error.STORAGE);
        }
        try {
            var wallet = walletRepository.findByUserId(userId)
                    .orElseThrow(() -> new WalletQueryException(WalletQueryException.Error.NOT_READY));
            // walletId는 Principal의 userId로 조회한 값만 사용한다. List 조회이므로 COUNT를 실행하지 않는다.
            var rows = transactionRepository.findHistory(wallet.id(), request.cursor(),
                    PageRequest.of(0, request.size() + 1));
            boolean hasNext = rows.size() > request.size();
            var page = rows.subList(0, Math.min(rows.size(), request.size()));
            Long nextCursor = hasNext ? page.getLast().transactionId() : null;
            return new WalletTransactionPageResponse(page, nextCursor, hasNext);
        } catch (DataAccessException | TransactionException exception) {
            throw new WalletQueryException(WalletQueryException.Error.STORAGE);
        }
    }
}
