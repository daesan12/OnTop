package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.dto.WalletTransactionPageRequest;
import com.ssafy.ontop.wallet.dto.WalletTransactionResponse;
import com.ssafy.ontop.wallet.exception.WalletQueryException;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class WalletTransactionQueryServiceTests {
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository transactions = mock(WalletTransactionRepository.class);
    private WalletQueryService service;

    @BeforeEach
    void setup() {
        var beans = new StaticListableBeanFactory();
        beans.addBean("wallets", wallets);
        beans.addBean("transactions", transactions);
        service = new WalletQueryService(beans.getBeanProvider(WalletRepository.class),
                beans.getBeanProvider(WalletTransactionRepository.class));
        var wallet = Wallet.forSignup(42, Instant.now());
        ReflectionTestUtils.setField(wallet, "id", 7L);
        when(wallets.findByUserId(42)).thenReturn(Optional.of(wallet));
    }

    @Test
    void 한건더_조회하고_마지막_반환ID를_커서로_사용한다() {
        var rows = List.of(row(9), row(7), row(4));
        when(transactions.findHistory(7, 10L, PageRequest.of(0, 3))).thenReturn(rows);

        var response = service.findTransactions(42, new WalletTransactionPageRequest(10L, 2));

        assertThat(response.transactions()).containsExactly(rows.get(0), rows.get(1));
        assertThat(response.nextCursor()).isEqualTo(7);
        assertThat(response.hasNext()).isTrue();
        verify(wallets).findByUserId(42);
        verify(transactions).findHistory(7, 10L, PageRequest.of(0, 3));
        verifyNoMoreInteractions(wallets, transactions);
    }

    @Test
    void 정확히_size개인_마지막페이지는_nextCursor가_null이다() {
        when(transactions.findHistory(7, null, PageRequest.of(0, 2))).thenReturn(List.of(row(3)));
        var response = service.findTransactions(42, new WalletTransactionPageRequest(null, 1));
        assertThat(response.hasNext()).isFalse();
        assertThat(response.nextCursor()).isNull();
        assertThat(response.transactions()).hasSize(1);
    }

    @Test
    void 빈원장도_기본20건_조회하며_빈배열과_null을_반환한다() {
        when(transactions.findHistory(7, null, PageRequest.of(0, 21))).thenReturn(List.of());
        var response = service.findTransactions(42, WalletTransactionPageRequest.parse(null, null));
        assertThat(response.transactions()).isEmpty();
        assertThat(response.hasNext()).isFalse();
        assertThat(response.nextCursor()).isNull();
    }

    @Test
    void 최대100건의_다음페이지도_101건만_읽는다() {
        when(transactions.findHistory(7, Long.MAX_VALUE, PageRequest.of(0, 101))).thenReturn(List.of());
        service.findTransactions(42, WalletTransactionPageRequest.parse(Long.toString(Long.MAX_VALUE), "100"));
        verify(transactions).findHistory(7, Long.MAX_VALUE, PageRequest.of(0, 101));
    }

    @Test
    void 지갑미생성은_원장을_조회하지_않고_409이다() {
        when(wallets.findByUserId(42)).thenReturn(Optional.empty());
        fails(WalletQueryException.Error.NOT_READY);
        verifyNoInteractions(transactions);
    }

    @Test
    void 원장조회_DB장애는_원문없는_503이다() {
        when(transactions.findHistory(7, null, PageRequest.of(0, 21)))
                .thenThrow(new DataAccessResourceFailureException("private-database"));
        fails(WalletQueryException.Error.STORAGE);
    }

    @Test
    void 읽기트랜잭션_완료실패도_503으로_매핑한다() {
        when(transactions.findHistory(7, null, PageRequest.of(0, 21)))
                .thenThrow(new TransactionSystemException("private-transaction"));
        fails(WalletQueryException.Error.STORAGE);
    }

    @Test
    void DB없는_기본프로필은_안전한_503이다() {
        var beans = new StaticListableBeanFactory();
        service = new WalletQueryService(beans.getBeanProvider(WalletRepository.class),
                beans.getBeanProvider(WalletTransactionRepository.class));
        fails(WalletQueryException.Error.STORAGE);
    }

    private WalletTransactionResponse row(long id) {
        return new WalletTransactionResponse(id, "SIGNUP_BONUS", 100, 0, null, null, null, Instant.now());
    }

    private void fails(WalletQueryException.Error error) {
        assertThatThrownBy(() -> service.findTransactions(42, WalletTransactionPageRequest.parse(null, null)))
                .isInstanceOfSatisfying(WalletQueryException.class, failure -> {
                    assertThat(failure.error()).isEqualTo(error);
                    assertThat(failure.getMessage()).doesNotContain("private-");
                    assertThat(failure.getCause()).isNull();
                });
    }
}
