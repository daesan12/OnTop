package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameStartPersistenceService {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;
    private final UserRepository users;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final Clock clock;
    private final String instanceId;
    private final UUID bootId;

    public GameStartPersistenceService(GameSessionRepository sessions, GameParticipantRepository participants,
            UserRepository users, WalletRepository wallets, WalletTransactionRepository ledger,
            Clock clock, String instanceId) {
        this(sessions, participants, users, wallets, ledger, clock, new GameRuntimeIdentity(instanceId));
    }

    @Autowired
    public GameStartPersistenceService(GameSessionRepository sessions, GameParticipantRepository participants,
            UserRepository users, WalletRepository wallets, WalletTransactionRepository ledger,
            @Qualifier("oauthClock") Clock clock, GameRuntimeIdentity identity) {
        this.sessions = sessions;
        this.participants = participants;
        this.users = users;
        this.wallets = wallets;
        this.ledger = ledger;
        this.clock = clock;
        this.instanceId = identity.instanceId();
        this.bootId = identity.bootId();
    }

    // 호출자가 이미 트랜잭션 안에 있어도, 이 프록시가 커밋을 완료한 다음에만 Gateway로 결과가 돌아간다.
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public GameStartResult reserve(GameReservationRequest request) {
        var previous = sessions.findByStartAttemptId(request.command().startAttemptId());
        if (previous.isPresent()) {
            return matchingResult(previous.get(), request);
        }
        GameSession session = prepare(request);

        for (long userId : request.lockOrder()) {
            var member = users.findForGameReservationById(userId);
            if (member.isEmpty() || member.get().getDeletedAt() != null) {
                return reject(session, "MEMBER_NOT_ACTIVE");
            }
        }
        Map<Long, Wallet> locked = new LinkedHashMap<>();
        for (long userId : request.lockOrder()) {
            var wallet = wallets.findForUpdateByUserId(userId);
            if (wallet.isEmpty()) {
                return reject(session, "WALLET_NOT_READY");
            }
            locked.put(userId, wallet.get());
        }
        if (sessions.existsByActiveTableId(request.command().tableId())) {
            return reject(session, "TABLE_ALREADY_IN_GAME");
        }
        for (var entry : locked.entrySet()) {
            if (participants.existsByActiveUserId(entry.getKey())) {
                return reject(session, "MEMBER_ALREADY_IN_GAME");
            }
            Wallet wallet = entry.getValue();
            if (wallet.balance() < wallet.reserved()
                    || wallet.balance() - wallet.reserved() < request.command().betAmountPerPlayer()) {
                return reject(session, "INSUFFICIENT_BALANCE");
            }
        }

        Instant now = now();
        session.reserve(now);
        sessions.flush(); // 같은 테이블의 서로 다른 회원 집합도 DB UNIQUE로 직렬화한다.
        for (int index = 0; index < request.userIds().size(); index++) {
            long userId = request.userIds().get(index);
            int seat = request.command().participants().get(index).seatNumber();
            participants.saveAndFlush(new GameParticipant(session.id(), userId, seat, index,
                    request.command().betAmountPerPlayer()));
            Wallet wallet = locked.get(userId);
            wallet.reserveGameEntry(request.command().betAmountPerPlayer(), now);
            ledger.saveAndFlush(WalletTransaction.gameReserve(wallet.id(), session.id(), userId,
                    request.command().betAmountPerPlayer(), now));
        }
        return GameStartResult.reserved(request.command(), GameIdCodec.format(session.id()));
    }

    // UNIQUE 경합으로 앞의 예약 트랜잭션이 완전히 롤백된 경우만 사용한다. 다시 예약하지 않는다.
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public GameStartResult recordConflictRejection(GameReservationRequest request, String code) {
        var previous = sessions.findByStartAttemptId(request.command().startAttemptId());
        return previous.isPresent() ? matchingResult(previous.get(), request) : reject(prepare(request), code);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true, isolation = Isolation.READ_COMMITTED)
    public Optional<GameStartResult> find(UUID attemptId, byte[] fingerprint) {
        return sessions.findByStartAttemptId(attemptId).map(session ->
                fingerprint != null && !session.matches(fingerprint)
                        ? GameStartResult.conflict(attemptId) : result(session));
    }

    private GameSession prepare(GameReservationRequest request) {
        return sessions.saveAndFlush(GameSession.prepare(request.command(), request.fingerprint(),
                instanceId, bootId, now()));
    }

    private GameStartResult reject(GameSession session, String code) {
        session.reject(code);
        sessions.flush();
        return GameStartResult.rejected(session.startAttemptId(), code);
    }

    private GameStartResult matchingResult(GameSession session, GameReservationRequest request) {
        return session.matches(request.fingerprint()) ? result(session)
                : GameStartResult.conflict(request.command().startAttemptId());
    }

    private GameStartResult result(GameSession session) {
        if (session.status() == GameSession.Status.FINISHED || session.status() == GameSession.Status.INVALID
                || session.settlementStatus() == GameSession.SettlementStatus.SETTLED) {
            return GameStartResult.rejected(session.startAttemptId(), "GAME_ALREADY_TERMINATED");
        }
        if (session.status() == GameSession.Status.REJECTED) {
            return GameStartResult.rejected(session.startAttemptId(), session.rejectionCode());
        }
        if (session.status() == GameSession.Status.PREPARING) {
            return GameStartResult.pending(session.startAttemptId());
        }
        List<GameStartCommand.Participant> players = participants.findByGameSessionIdOrderByParticipantOrder(session.id())
                .stream().map(player -> new GameStartCommand.Participant(
                        Long.toString(player.userId()), player.seatNumber())).toList();
        GameStartCommand original = new GameStartCommand(session.startAttemptId(), session.tableId(),
                session.tableVersion(), session.gameCode(), players, session.targetScore(), session.betAmountPerPlayer());
        return GameStartResult.reserved(original, GameIdCodec.format(session.id()));
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }
}
