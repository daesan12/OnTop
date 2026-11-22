package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
import java.util.Map;
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
@RequestMapping("/api/v1/world/winter")
public final class WinterCommunityController {
    private final WinterCommunityService service;

    public WinterCommunityController(WinterCommunityService service) { this.service = service; }

    public record TreeMessageRequest(String channelId, String operationId, String text, Boolean anonymous,
            String ornament) { }
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
