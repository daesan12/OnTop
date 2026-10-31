package com.ssafy.ontop.game.start;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.ledger.service.DiceLedgerEngine;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/** 판돈 예약 저장은 Gateway가 담당한다. 전원 예약 커밋을 확인한 뒤에만 메모리 엔진을 생성한다. 즉시 차감하지 않는다. */
@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class CommittedGameStartService {

    private final GameStartGateway gateway;
    private final Optional<OmokEngine> omok;
    private final Optional<OneCardEngine> onecard;
    private final Optional<BridgeEngine> bridge;
    private final Optional<FarkleEngine> dice;
    private final Optional<DiceLedgerEngine> ledger;
    private final Optional<GameActivationPersistenceService> activations;

    public CommittedGameStartService(GameStartGateway gateway, Optional<OmokEngine> omok,
            Optional<OneCardEngine> onecard, Optional<BridgeEngine> bridge, boolean authenticated, boolean rehearsal) {
        this(gateway, omok, onecard, bridge, Optional.empty(), authenticated, rehearsal);
    }

    public CommittedGameStartService(GameStartGateway gateway, Optional<OmokEngine> omok,
            Optional<OneCardEngine> onecard, Optional<BridgeEngine> bridge,
            Optional<FarkleEngine> dice, boolean authenticated, boolean rehearsal) {
        this(gateway, omok, onecard, bridge, dice, Optional.empty(), authenticated, rehearsal);
    }

    public CommittedGameStartService(GameStartGateway gateway, Optional<OmokEngine> omok,
            Optional<OneCardEngine> onecard, Optional<BridgeEngine> bridge,
            Optional<FarkleEngine> dice, Optional<GameActivationPersistenceService> activations,
            boolean authenticated, boolean rehearsal) {
        this(gateway, omok, onecard, bridge, dice, Optional.empty(), activations, authenticated, rehearsal);
    }

    @Autowired
    public CommittedGameStartService(GameStartGateway gateway, Optional<OmokEngine> omok,
            Optional<OneCardEngine> onecard, Optional<BridgeEngine> bridge,
            Optional<FarkleEngine> dice, Optional<DiceLedgerEngine> ledger,
            Optional<GameActivationPersistenceService> activations,
            @Value("${ontop.websocket.authenticated:false}") boolean authenticated,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean rehearsal) {
        if (!authenticated || rehearsal || gateway instanceof LocalGameStartGateway) {
            throw new IllegalArgumentException("인증 사용자와 실제 시작 Gateway를 연결해주세요.");
        }
        if (gateway instanceof JpaGameStartGateway && activations.isEmpty()) {
            throw new IllegalArgumentException("DB 경기에는 실행 주체 검증이 필요합니다.");
        }
        this.gateway = gateway;
        this.omok = omok;
        this.onecard = onecard;
        this.bridge = bridge;
        this.dice = dice;
        this.ledger = ledger;
        this.activations = activations;
    }

    public GameStartResult start(GameStartCommand command) {
        // 아직 엔진이 없거나 주사위 목표 점수가 정해지지 않았으면 예약 요청 전에 거절한다.
        if (!supported(command)) {
            return GameStartResult.rejected(command.startAttemptId(), "GAME_RUNTIME_UNAVAILABLE");
        }
        return activate(command, gateway.startGame(command));
    }

    public GameStartResult find(GameStartCommand command) {
        // 결과 불명에서는 새 예약 요청을 보내지 않는다. 같은 경기 ID의 create는 멱등적이다.
        return activate(command, gateway.findStartResult(command.startAttemptId()));
    }

    private boolean supported(GameStartCommand command) {
        try {
            List<Long> players = players(command);
            return switch (command.gameCode()) {
                case "OMOK" -> omok.isPresent() && players.size() == 2;
                case "ONE_CARD" -> onecard.isPresent();
                case "LIAR_BRIDGE" -> bridge.isPresent();
                case "DICE" -> dice.isPresent() && players.size() == 2 && command.targetScore() != null;
                case "DICE_LEDGER" -> ledger.isPresent();
                default -> false;
            };
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private GameStartResult activate(GameStartCommand command, GameStartResult result) {
        if (result != null && result.isReservationCommitted(command)) {
            if (activations.isPresent() && !activations.get().authorize(command, result.gameSessionId())) {
                return GameStartResult.rejected(command.startAttemptId(), "GAME_ALREADY_TERMINATED");
            }
            List<Long> players = players(command);
            // 엔진 create의 tick/종료 콜백은 별도 DB 트랜잭션을 사용할 수 있어 경기 행 잠금을 보유하지 않는다.
            switch (command.gameCode()) {
                case "OMOK" -> omok.orElseThrow().createWithCoinToss(result.gameSessionId(), command.tableId(),
                        players.get(0), players.get(1));
                case "ONE_CARD" -> onecard.orElseThrow().create(result.gameSessionId(), command.tableId(), players);
                case "LIAR_BRIDGE" -> bridge.orElseThrow().create(result.gameSessionId(), command.tableId(), players);
                case "DICE" -> dice.orElseThrow().create(result.gameSessionId(), command.tableId(), players,
                        command.targetScore());
                case "DICE_LEDGER" -> ledger.orElseThrow().create(result.gameSessionId(), command.tableId(), players);
                default -> throw new IllegalStateException("경기 실행 설정을 확인해주세요.");
            }
            activations.ifPresent(service -> service.started(command, result.gameSessionId()));
        }
        return result;
    }

    private List<Long> players(GameStartCommand command) {
        if (command.participants().stream().anyMatch(player -> !player.userId().matches("[1-9][0-9]{0,18}"))) {
            throw new IllegalArgumentException("검증된 내부 계정이 필요합니다.");
        }
        return command.participants().stream().map(player -> Long.parseLong(player.userId())).toList();
    }
}
