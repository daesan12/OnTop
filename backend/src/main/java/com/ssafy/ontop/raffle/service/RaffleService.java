package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.domain.RaffleRound;
import com.ssafy.ontop.raffle.domain.RaffleSaleWindow;
import com.ssafy.ontop.raffle.domain.RaffleSaleWindowPolicy;
import com.ssafy.ontop.raffle.domain.RaffleTicket;
import com.ssafy.ontop.raffle.dto.CurrentRaffleResponse;
import com.ssafy.ontop.raffle.dto.RafflePurchaseResponse;
import com.ssafy.ontop.raffle.dto.RaffleTicketResponse;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class RaffleService {
    private static final String OPEN = "OPEN";
    private final RaffleRepository raffles;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final RaffleNumberGenerator numbers;
    private final RaffleSaleWindowPolicy saleWindows;

    public RaffleService(RaffleRepository raffles, WalletRepository wallets,
            WalletTransactionRepository ledger, PlatformTransactionManager manager,
            Clock clock, RaffleNumberGenerator numbers) {
        this(raffles, wallets, ledger, manager, clock, numbers, RaffleSaleWindowPolicy.defaults());
    }

    public RaffleService(RaffleRepository raffles, WalletRepository wallets,
            WalletTransactionRepository ledger, PlatformTransactionManager manager,
            Clock clock, RaffleNumberGenerator numbers, RaffleSaleWindowPolicy saleWindows) {
        this.raffles = raffles;
        this.wallets = wallets;
        this.ledger = ledger;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.numbers = numbers;
        this.saleWindows = saleWindows;
    }

    public CurrentRaffleResponse current(long userId) {
        validateUser(userId);
        return Objects.requireNonNull(transactions.execute(status -> {
            Instant now = clock.instant();
            RaffleRound round = currentRound(now, false);
            Wallet wallet = wallets.findByUserId(userId).orElseThrow(() ->
                    error(409, "WALLET_NOT_READY", "지갑 초기화가 필요합니다."));
            return currentResponse(round, wallet, raffles.tickets(round.id(), userId));
        }));
    }

    public RafflePurchaseResponse purchase(long userId, String idempotencyKey) {
        validateUser(userId);
        if (idempotencyKey == null || !idempotencyKey.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "중복 방지 키를 확인하세요.");
        }
        return Objects.requireNonNull(transactions.execute(status -> purchaseInTransaction(userId, idempotencyKey)));
    }

    private RafflePurchaseResponse purchaseInTransaction(long userId, String idempotencyKey) {
        Instant now = clock.instant();
        RaffleRound round = currentRound(now, true);
        var previous = raffles.ticket(round.id(), userId, idempotencyKey);
        if (previous.isPresent()) {
            return purchaseResponse(previous.get(), raffles.ticketCount(round.id(), userId), round.weeklyTicketLimit());
        }
        RaffleSaleWindow window = saleWindows.select(now).window();
        if (!OPEN.equals(round.salesStatus()) || !window.isOpenAt(now)
                || now.isBefore(round.salesStartsAt()) || !now.isBefore(round.salesEndsAt())) {
            throw error(409, "RAFFLE_SALES_CLOSED", "현재 응모권 판매 시간이 아닙니다.");
        }
        int purchasedCount = raffles.ticketCount(round.id(), userId);
        if (purchasedCount >= round.weeklyTicketLimit()) {
            throw error(409, "RAFFLE_WEEKLY_LIMIT_REACHED", "이번 주 응모권 구매 한도를 모두 사용했습니다.");
        }
        Wallet wallet = wallets.findForUpdateByUserId(userId).orElseThrow(() ->
                error(409, "WALLET_NOT_READY", "지갑 초기화가 필요합니다."));
        long availableBalance = availableBalance(wallet);
        if (availableBalance < round.ticketPrice()) {
            throw error(409, "INSUFFICIENT_BALANCE", "사용 가능한 엽전이 부족합니다.");
        }
        int ticketNumber = numbers.unusedNumber(raffles.usedNumbers(round.id()));
        if (ticketNumber == 0) {
            throw error(409, "RAFFLE_NUMBERS_EXHAUSTED", "이번 주 응모 번호를 모두 사용했습니다.");
        }
        wallet.debit(round.ticketPrice(), now);
        WalletTransaction transaction = ledger.saveAndFlush(WalletTransaction.rafflePurchase(
                wallet.id(), round.ticketPrice(), ledgerKey(round.id(), userId, idempotencyKey), now));
        long ticketId = raffles.insertTicket(round.id(), userId, ticketNumber, round.ticketPrice(),
                wallet.balance(), transaction.id(), idempotencyKey, now);
        var ticket = new RaffleTicket(ticketId, round.id(), userId, ticketNumber, round.ticketPrice(),
                wallet.balance(), transaction.id(), idempotencyKey, now);
        return purchaseResponse(ticket, purchasedCount + 1, round.weeklyTicketLimit());
    }

    private RaffleRound currentRound(Instant now, boolean locked) {
        var selection = saleWindows.select(now);
        RaffleSaleWindow window = selection.window();
        raffles.synchronizeRound(window, now, selection.overridden());
        return (locked ? raffles.lockRound(window.weekStartDate()) : raffles.round(window.weekStartDate()))
                .orElseThrow(() -> error(503, "RAFFLE_UNAVAILABLE", "이번 주 응모 정보를 확인할 수 없습니다."));
    }

    private CurrentRaffleResponse currentResponse(RaffleRound round, Wallet wallet, List<RaffleTicket> tickets) {
        long availableBalance = availableBalance(wallet);
        int purchasedCount = tickets.size();
        return new CurrentRaffleResponse(round.id(), round.weekStartDate(), round.salesStatus(),
                round.salesStartsAt(), round.salesEndsAt(), round.ticketPrice(), round.weeklyTicketLimit(),
                purchasedCount, Math.max(0, round.weeklyTicketLimit() - purchasedCount),
                wallet.balance(), wallet.reserved(), availableBalance,
                tickets.stream().map(ticket -> new RaffleTicketResponse(
                        ticket.id(), ticket.ticketNumber(), ticket.purchasedAt())).toList());
    }

    private RafflePurchaseResponse purchaseResponse(RaffleTicket ticket, int purchasedCount, int weeklyLimit) {
        return new RafflePurchaseResponse(ticket.id(), ticket.roundId(), ticket.ticketNumber(),
                ticket.purchasePrice(), ticket.purchasedAt(), ticket.balanceAfter(), purchasedCount,
                Math.max(0, weeklyLimit - purchasedCount));
    }

    private long availableBalance(Wallet wallet) {
        if (wallet.balance() < 0 || wallet.reserved() < 0 || wallet.balance() < wallet.reserved()) {
            throw error(503, "RAFFLE_UNAVAILABLE", "지갑 정보를 확인할 수 없습니다.");
        }
        return wallet.balance() - wallet.reserved();
    }

    private void validateUser(long userId) {
        if (userId <= 0) {
            throw error(400, "INVALID_REQUEST", "회원 정보를 확인하세요.");
        }
    }

    private String ledgerKey(long roundId, long userId, String idempotencyKey) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(idempotencyKey.getBytes(StandardCharsets.UTF_8));
            return "raffle:" + roundId + ":" + userId + ":" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 지원이 필요합니다.", exception);
        }
    }

    private RaffleException error(int status, String code, String message) {
        return new RaffleException(status, code, message);
    }
}
