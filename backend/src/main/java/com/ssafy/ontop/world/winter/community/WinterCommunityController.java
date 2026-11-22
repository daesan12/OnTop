package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/world/winter")
public final class WinterCommunityController {
    private final WinterCommunityService service;

    public WinterCommunityController(WinterCommunityService service) { this.service = service; }

    public record TreeMessageRequest(String channelId, String operationId, String text, Boolean anonymous,
            String ornament) { }
    public record SnowRollRequest(String channelId, String operationId, String ballId) { }
    public record SnowmanRequest(String channelId, String operationId, List<String> ballIds,
            String name, String hat, String scarf, String face, Double x, Double z, Double yaw) { }

    @GetMapping("/tree/status")
    public ResponseEntity<WinterCommunity.TreeStatus> treeStatus(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String channelId) {
        return response(service.treeStatus(identity(user), channelId));
    }

    @GetMapping("/tree")
    public ResponseEntity<WinterCommunity.TreePage> tree(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String channelId, @RequestParam(required = false) Long before) {
        return response(service.tree(identity(user), channelId, before));
    }

    @PostMapping("/tree/messages")
    @NewActivity
    public ResponseEntity<WinterCommunity.TreeReceipt> message(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody TreeMessageRequest request) {
        return response(service.postTree(identity(user), request.channelId(), request.operationId(),
                request.text(), request.anonymous(), request.ornament()));
    }

    @GetMapping("/snow")
    public ResponseEntity<WinterCommunity.BuildingState> snow(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String channelId) {
        return response(service.building(identity(user), channelId));
    }

    @PostMapping("/snow/rolls")
    @NewActivity
    public ResponseEntity<WinterCommunity.BuildingState> begin(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody SnowRollRequest request) {
        return response(service.hold(identity(user), request.channelId(), "BEGIN", request.operationId(), request.ballId()));
    }

    @PostMapping("/snow/rolls/{ball}/hold")
    public ResponseEntity<WinterCommunity.BuildingState> keep(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String ball, @RequestBody SnowRollRequest request) {
        return response(service.hold(identity(user), request.channelId(), "KEEP", request.operationId(), ball));
    }

    @PostMapping("/snow/rolls/{ball}/release")
    public ResponseEntity<WinterCommunity.BuildingState> release(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String ball, @RequestBody SnowRollRequest request) {
        return response(service.hold(identity(user), request.channelId(), "RELEASE", request.operationId(), ball));
    }

    @PostMapping("/snow/snowmen")
    @NewActivity
    public ResponseEntity<WinterCommunity.Snowman> finish(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody SnowmanRequest request) {
        if (request.x() == null || request.z() == null || request.yaw() == null) {
            throw new WinterCommunityException(400, "WINTER_POSITION_REQUIRED", "눈사람을 둘 자리를 확인해주세요.");
        }
        return response(service.finish(identity(user), request.channelId(), request.operationId(), request.ballIds(),
                new WinterCommunity.Decoration(request.name(), request.hat(), request.scarf(), request.face()),
                request.x(), request.z(), request.yaw()));
    }

    @ExceptionHandler(WinterCommunityException.class)
    public ResponseEntity<Map<String, String>> rejected(WinterCommunityException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .body(Map.of("code", error.code(), "message", error.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(Map.of("code", "WINTER_REQUEST_INVALID", "message", "입력 내용을 확인해주세요."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<Map<String, String>> unavailable(RuntimeException error) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of(
                "code", "WINTER_STORAGE_UNAVAILABLE", "message", "겨울 기록 연결이 지연되고 있어요. 같은 내용으로 재시도해주세요."));
    }

    private static long identity(AuthenticatedUser user) {
        if (user == null) { throw new WinterCommunityException(401, "AUTH_REQUIRED", "로그인 후 이용해주세요."); }
        return user.userId();
    }

    private static <T> ResponseEntity<T> response(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
