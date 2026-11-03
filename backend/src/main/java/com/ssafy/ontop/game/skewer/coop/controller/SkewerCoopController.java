package com.ssafy.ontop.game.skewer.coop.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopRankingResponse;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import com.ssafy.ontop.table.service.TableHub;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.skewer-coop.enabled", havingValue = "true")
@RequestMapping("/api/v1/minigames/skewer/coop")
public class SkewerCoopController {
    private final SkewerCoopEngine engine;
    private final TableHub hub;
    private final SkewerCoopSettlementService settlements;

    public SkewerCoopController(SkewerCoopEngine engine, TableHub hub, SkewerCoopSettlementService settlements) {
        this.engine = engine;
        this.hub = hub;
        this.settlements = settlements;
    }

    @GetMapping("/result")
    public ResponseEntity<SkewerCoopResultResponse> result(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String gameId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(settlements.result(account(user), gameId));
    }

    @GetMapping("/rankings")
    public ResponseEntity<SkewerCoopRankingResponse> rankings(@AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(settlements.ranking(account(user)));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<Map<String, String>> unavailable(RuntimeException exception) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of(
                "code", "SKEWER_COOP_STORAGE_UNAVAILABLE", "message", "정산 저장소 연결을 확인하고 다시 조회해주세요."));
    }

    @GetMapping("/rooms")
    public ResponseEntity<JsonNode> rooms(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String channelId) {
        long account = account(user);
        hub.requireSkewerEntry(account, channelId, engine.owns(account, channelId));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(engine.rooms(account, channelId));
    }

    @PostMapping("/rooms")
    public ResponseEntity<JsonNode> enter(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        long account = account(user);
        if (body == null || !body.isObject() || !body.path("channelId").isTextual() || body.size() != 2) {
            throw new IllegalArgumentException("같은 공원의 방을 선택해주세요.");
        }
        String channel = body.path("channelId").asText();
        hub.requireSkewerEntry(account, channel, engine.owns(account, channel));
        if (body.has("gameId")) {
            engine.waitingPlayers(channel, body.path("gameId").asText())
                    .forEach(player -> hub.requireSkewerWaitingPlayer(player, channel));
        }
        JsonNode result = body.has("gameId") ? engine.join(account, channel, body.path("gameId").asText())
                : engine.create(account, channel, body.path("requestKey").asText());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @PostMapping("/leave")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        if (body == null || !body.isObject() || body.size() != 1 || !body.path("gameId").isTextual()) {
            throw new IllegalArgumentException("방을 확인해주세요.");
        }
        engine.leaveWaiting(account(user), body.path("gameId").asText());
        return ResponseEntity.noContent().build();
    }

    private long account(AuthenticatedUser user) {
        if (user == null) {
            throw new GameActionGateway.Rejected(GameActionGateway.Rejection.ACCESS_DENIED);
        }
        return user.userId();
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class, GameActionGateway.Rejected.class})
    ResponseEntity<Map<String, String>> failed(RuntimeException exception) {
        boolean denied = exception instanceof GameActionGateway.Rejected;
        return ResponseEntity.status(denied ? 403 : 409).cacheControl(CacheControl.noStore()).body(Map.of(
                "code", "SKEWER_COOP_REJECTED", "message", denied ? "참가 권한을 확인해주세요." : exception.getMessage()));
    }
}
