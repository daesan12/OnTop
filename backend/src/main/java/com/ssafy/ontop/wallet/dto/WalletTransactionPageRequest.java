package com.ssafy.ontop.wallet.dto;

import com.ssafy.ontop.wallet.exception.WalletQueryException;

public record WalletTransactionPageRequest(Long cursor, int size) {

    public WalletTransactionPageRequest {
        if ((cursor != null && cursor <= 0) || size < 1 || size > 100) {
            throw new WalletQueryException(WalletQueryException.Error.INVALID_PAGE);
        }
    }

    public static WalletTransactionPageRequest parse(String cursor, String size) {
        Long transactionId = cursor == null ? null : positiveNumber(cursor);
        long pageSize = size == null ? 20 : positiveNumber(size);
        if (pageSize > 100) {
            throw new WalletQueryException(WalletQueryException.Error.INVALID_PAGE);
        }
        return new WalletTransactionPageRequest(transactionId, (int) pageSize);
    }

    private static long positiveNumber(String value) {
        if (!value.matches("[0-9]{1,19}")) {
            throw new WalletQueryException(WalletQueryException.Error.INVALID_PAGE);
        }
        try {
            long number = Long.parseLong(value);
            if (number > 0) {
                return number;
            }
        } catch (NumberFormatException exception) {
            // 범위를 벗어난 입력을 내부 파싱 예외나 원문 없이 처리한다.
        }
        throw new WalletQueryException(WalletQueryException.Error.INVALID_PAGE);
    }
}
