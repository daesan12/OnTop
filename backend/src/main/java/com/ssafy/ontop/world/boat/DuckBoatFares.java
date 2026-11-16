package com.ssafy.ontop.world.boat;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 허브 잠금 밖에서 요금을 처리한다. 탈것 대여 결제와 같은 취소·마감 규칙을 쓴다. */
public final class DuckBoatFares {
    public static final int FARE = 30;
    private static final Logger log = LoggerFactory.getLogger(DuckBoatFares.class);

    private final DuckBoatWallet wallet;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), Thread.ofPlatform().daemon(true).name("duck-boat-payment-", 0).factory());

    public DuckBoatFares(DuckBoatWallet wallet) {
        this.wallet = wallet;
    }

    public Charge submit(long account, String leaseId, long deadline, Consumer<DuckBoatWallet.Payment> complete) {
        var charge = new Charge(account, leaseId, deadline, complete);
        try {
            workers.execute(charge);
            return charge;
        } catch (RejectedExecutionException rejected) {
            return null;
        }
    }

    public void shutdown() {
        workers.shutdown();
    }

    private enum Decision { OPEN, CANCELLED, COMMITTING }

    public final class Charge implements Runnable {
        private final AtomicReference<Decision> decision = new AtomicReference<>(Decision.OPEN);
        private final long account;
        private final String leaseId;
        private final long deadline;
        private final Consumer<DuckBoatWallet.Payment> complete;

        private Charge(long account, String leaseId, long deadline, Consumer<DuckBoatWallet.Payment> complete) {
            this.account = account;
            this.leaseId = leaseId;
            this.deadline = deadline;
            this.complete = complete;
        }

        public boolean cancel() {
            if (decision.compareAndSet(Decision.OPEN, Decision.CANCELLED)) {
                workers.remove(this);
            }
            return decision.get() == Decision.CANCELLED;
        }

        private boolean authorizeCommit() {
            return System.nanoTime() - deadline < 0 && decision.compareAndSet(Decision.OPEN, Decision.COMMITTING);
        }

        @Override
        public void run() {
            if (decision.get() == Decision.CANCELLED) {
                return;
            }
            DuckBoatWallet.Payment result;
            try {
                result = System.nanoTime() - deadline >= 0 ? DuckBoatWallet.Payment.CANCELLED
                        : wallet.charge(account, leaseId, FARE, this::authorizeCommit);
            } catch (DuckBoatWallet.PaymentCancelled cancelled) {
                result = DuckBoatWallet.Payment.CANCELLED;
            } catch (RuntimeException failure) {
                log.warn("오리배 요금 결제 실패", failure);
                result = DuckBoatWallet.Payment.FAILED;
            }
            complete.accept(result);
        }
    }
}
