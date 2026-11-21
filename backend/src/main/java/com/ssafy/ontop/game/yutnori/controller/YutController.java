package com.ssafy.ontop.game.yutnori.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import com.ssafy.ontop.game.yutnori.service.YutEngine;
import com.ssafy.ontop.operation.config.NewActivity;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.service.UserProfileService;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/minigames/yutnori")
public class YutController {
    private final YutEngine engine;
    private final TableHub hub;
    private final ObjectProvider<UserProfileService> profiles;

    public YutController(YutEngine engine, TableHub hub, ObjectProvider<UserProfileService> profiles) {
        this.engine = engine;
        this.hub = hub;
        this.profiles = profiles;
    }

    @GetMapping("/rooms")
    public ResponseEntity<JsonNode> rooms(@AuthenticationPrincipal AuthenticatedUser user, @RequestParam String channelId) {
        long account = account(user);
        hub.requireYutEntry(account, channelId, engine.owns(account, channelId));
        return response(engine.rooms(account, channelId));
    }

    @PostMapping("/rooms")
    @NewActivity
    public ResponseEntity<JsonNode> enter(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        long account = account(user);
        require(body != null && body.isObject() && body.path("channelId").isTextual(), "공원을 확인해주세요.");
        String channel = body.path("channelId").asText();
        hub.requireYutEntry(account, channel, engine.owns(account, channel));
        UserProfileService service = profiles.getIfAvailable();
        require(service != null, "회원 프로필 저장소 연결을 확인해주세요.");
        String nickname = service.findProfile(account).nickname();
        hub.requireYutEntry(account, channel, engine.owns(account, channel));
        if (body.has("gameId")) {
            fields(body, Set.of("channelId", "gameId"));
            require(body.path("gameId").isTextual(), "방을 선택해주세요.");
            return response(engine.join(account, channel, body.path("gameId").asText(), nickname));
        }
        fields(body, Set.of("channelId", "requestKey", "roomName", "rules"));
        JsonNode rules = body.path("rules");
        fields(rules, Set.of("emptyBackEnters", "doubleCaptureBonus", "backHomeFinish"));
        require(rules.size() == 3 && rules.path("emptyBackEnters").isBoolean()
                && rules.path("doubleCaptureBonus").isBoolean() && rules.path("backHomeFinish").isBoolean()
                && body.path("requestKey").isTextual() && body.path("roomName").isTextual(), "방 규칙을 확인해주세요.");
        return response(engine.create(account, channel, body.path("requestKey").asText(), body.path("roomName").asText(),
                nickname, new YutMatch.Rules(rules.path("emptyBackEnters").asBoolean(),
                        rules.path("doubleCaptureBonus").asBoolean(), rules.path("backHomeFinish").asBoolean())));
    }

    @PostMapping("/lobby")
    public ResponseEntity<JsonNode> lobby(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        fields(body, Set.of("gameId", "input"));
        long account = account(user);
        JsonNode state = engine.member(account, body.path("gameId").asText());
        hub.requireYutEntry(account, state.path("publicState").path("channelId").asText(), true);
        JsonNode input = body.path("input");
        String type = input.path("type").asText();
        fields(input, type.equals("TEAM") ? Set.of("type", "team") : Set.of("type", "ready"));
        return response(engine.lobby(account, body.path("gameId").asText(), input));
    }

    @PostMapping("/start")
    @NewActivity
    public ResponseEntity<JsonNode> start(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        fields(body, Set.of("gameId"));
        long account = account(user);
        String id = body.path("gameId").asText();
        String channel = engine.member(account, id).path("publicState").path("channelId").asText();
        engine.waitingPlayers(account, id).forEach(player -> hub.requireSkewerWaitingPlayer(player, channel));
        return response(engine.start(account, id));
    }

    @PostMapping("/leave")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        fields(body, Set.of("gameId"));
        engine.leave(account(user), body.path("gameId").asText());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/watch")
    public ResponseEntity<JsonNode> watch(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        fields(body, Set.of("gameId", "channelId"));
        long account = account(user);
        String channel = body.path("channelId").asText();
        hub.requireYutEntry(account, channel, false);
        return response(engine.watch(account, channel, body.path("gameId").asText()));
    }

    @PostMapping("/feedback")
    public ResponseEntity<Void> feedback(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        fields(body, Set.of("gameId", "text"));
        require(body.path("text").isTextual(), "내용을 확인해주세요.");
        engine.feedback(account(user), body.path("gameId").asText(), body.path("text").asText());
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class, GameActionGateway.Rejected.class})
    public ResponseEntity<Map<String, String>> rejected(RuntimeException exception) {
        boolean denied = exception instanceof GameActionGateway.Rejected;
        return ResponseEntity.status(denied ? 403 : 409).cacheControl(CacheControl.noStore())
                .body(Map.of("code", "YUT_REJECTED", "message", denied ? "참가 권한을 확인해주세요." : exception.getMessage()));
    }

    private static long account(AuthenticatedUser user) {
        if (user == null) {
            throw new GameActionGateway.Rejected(GameActionGateway.Rejection.ACCESS_DENIED);
        }
        return user.userId();
    }

    private static void fields(JsonNode body, Set<String> allowed) {
        require(body != null && body.isObject(), "요청 정보를 확인해주세요.");
        body.fieldNames().forEachRemaining(field -> require(allowed.contains(field), "요청 항목을 확인해주세요."));
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }

    private static ResponseEntity<JsonNode> response(JsonNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
