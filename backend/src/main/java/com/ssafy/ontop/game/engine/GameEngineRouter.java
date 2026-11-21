package com.ssafy.ontop.game.engine;

import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateView;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** 서버가 생성한 경기 ID로 분기한다. 라우터 잠금을 잡고 엔진을 호출하지 않는다. */
public final class GameEngineRouter implements GameEngine {
    private final Map<String, Registration> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final Map<Long, String> activeUsers = new HashMap<>();
    private final Map<String, String> activeTables = new HashMap<>();

    // 참가 확정 후 엔진이 자신의 경기 잠금 안에서 호출하고, 성공 뒤 경기 상태를 설치한다.
    public synchronized void register(GameEngine engine, String gameId, String tableId, List<Long> players) {
        register(engine, gameId, tableId, players, 4);
    }

    /** 독립 경기장의 명시적 정원. 기존 탁자 엔진의 기본 4인 계약은 유지한다. */
    public synchronized void register(GameEngine engine, String gameId, String tableId, List<Long> players,
            int maximumPlayers) {
        Objects.requireNonNull(engine);
        if (engine == this || gameId == null || gameId.isBlank() || gameId.length() > 120
                || tableId == null || tableId.isBlank() || players == null || players.size() < 2
                || maximumPlayers < 2 || maximumPlayers > 8 || players.size() > maximumPlayers
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size()) {
            throw new IllegalArgumentException("경기 엔진·식별자·참가자를 확인해주세요.");
        }
        Registration existing = games.get(gameId);
        if (existing != null) {
            if (existing.engine() != engine || !existing.tableId().equals(tableId)
                    || !existing.players().equals(players)) {
                throw new IllegalStateException("다른 경기에 사용 중인 경기 ID입니다.");
            }
            return;
        }
        if (activeTables.containsKey(tableId) || players.stream().anyMatch(activeUsers::containsKey)) {
            throw new IllegalStateException("테이블 또는 참가자에게 진행 중인 경기가 있습니다.");
        }
        games.put(gameId, new Registration(engine, tableId, List.copyOf(players)));
        activeTables.put(tableId, gameId);
        for (long player : players) {
            activeUsers.put(player, gameId);
            latest.put(player, gameId);
        }
    }

    // 종료 기록 조회는 유지하고 진행 중 점유만 해제한다. 중복 종료는 새 경기 점유를 지우지 않는다.
    public synchronized void finished(GameEngine engine, String gameId) {
        Registration registration = games.get(gameId);
        if (registration == null) {
            return;
        }
        if (registration.engine() != engine) {
            throw new IllegalStateException("다른 엔진의 경기를 종료할 수 없습니다.");
        }
        activeTables.remove(registration.tableId(), gameId);
        for (long player : registration.players()) {
            activeUsers.remove(player, gameId);
        }
    }

    /** 탈락이 확정된 참가자의 점유만 해제한다. 종료 기록·다른 참가자·새 경기의 점유는 보존한다. */
    public synchronized void releasePlayer(GameEngine engine, String gameId, long userId) {
        Registration registration = games.get(gameId);
        if (registration == null || registration.engine() != engine || !registration.players().contains(userId)) {
            throw new IllegalStateException("소유 엔진과 경기 참가자를 확인해주세요.");
        }
        activeUsers.remove(userId, gameId);
    }

    /** 소유 엔진의 보존 기간이 끝난 종료 기록만 제거한다. 진행 중인 다른 경기 점유는 보존한다. */
    public synchronized boolean forgetFinished(GameEngine engine, String gameId) {
        Registration registration = games.get(gameId);
        if (registration == null) {
            return true;
        }
        if (registration.engine() != engine) {
            throw new IllegalStateException("다른 엔진의 경기 기록을 제거할 수 없습니다.");
        }
        if (gameId.equals(activeTables.get(registration.tableId()))
                || registration.players().stream().anyMatch(user -> gameId.equals(activeUsers.get(user)))) {
            return false;
        }
        games.remove(gameId);
        for (long user : registration.players()) {
            latest.remove(user, gameId);
        }
        return true;
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        Registration registration = registration(command.gameId());
        if (registration == null || !registration.players().contains(command.userId())) {
            throw new GameActionGateway.Rejected(GameActionGateway.Rejection.ACCESS_DENIED);
        }
        return registration.engine().apply(command);
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        Registration registration = registration(command.gameId());
        if (registration == null || !registration.players().contains(command.userId())) {
            throw new GameActionGateway.Rejected(GameActionGateway.Rejection.ACCESS_DENIED);
        }
        return registration.engine().forfeit(command);
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        Registration registration = registration(gameId);
        return registration == null ? Optional.empty() : registration.engine().load(userId, gameId);
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        for (int attempt = 0; attempt < 3; attempt++) {
            Registration registration;
            String gameId;
            synchronized (this) {
                gameId = latest.get(userId);
                registration = games.get(gameId);
            }
            if (registration == null) {
                return Optional.empty();
            }
            Optional<GameRecoverySnapshot> result = registration.engine().load(userId);
            synchronized (this) {
                if (!gameId.equals(latest.get(userId))) {
                    // 같은 엔진뿐 아니라 다른 게임으로 전환된 경우에도 새 등록으로 다시 읽는다.
                    continue;
                }
            }
            if (result.isEmpty() || !result.get().gameId().equals(gameId) || result.get().userId() != userId) {
                throw new IllegalStateException("경기 엔진의 복구 상태가 등록 정보와 다릅니다.");
            }
            return result;
        }
        throw new IllegalStateException("조회 중 경기 등록이 반복 변경되었습니다. 다시 조회해주세요.");
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        Registration registration = registration(command.gameId());
        if (registration != null && registration.players().contains(command.userId())) {
            registration.engine().graceExpired(command);
        }
    }

    @Override
    public boolean isUnreservedSession(GameRecoverySnapshot snapshot) {
        Registration registration = registration(snapshot.gameId());
        return registration != null && registration.players().contains(snapshot.userId())
                && registration.engine().isUnreservedSession(snapshot);
    }

    private synchronized Registration registration(String gameId) {
        return games.get(gameId);
    }

    private record Registration(GameEngine engine, String tableId, List<Long> players) {
    }
}
