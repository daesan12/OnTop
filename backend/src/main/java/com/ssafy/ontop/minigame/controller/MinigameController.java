package com.ssafy.ontop.minigame.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
@RequestMapping("/api/v1/minigames/sessions")
public class MinigameController {
    private final ObjectProvider<MinigameService> services;

    public MinigameController(ObjectProvider<MinigameService> services) {
        this.services = services;
    }

    @PostMapping
    public ResponseEntity<?> start(Principal principal, @RequestBody JsonNode body, HttpServletRequest request) {
        long userId = account(principal);
        if (!body.isObject() || body.size() != 1 || !body.path("minigameType").isTextual()) {
            throw invalid();
        }
        if (!body.path("minigameType").textValue().equals("BUNGEOPPANG")) {
            throw new MinigameException(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service().start(userId, body.path("minigameType").textValue(), keys.getFirst()));
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<?> load(Principal principal, @PathVariable String sessionId) {
        return ok(service().load(account(principal), sessionId(sessionId)));
    }

    @PostMapping("/{sessionId}/complete")
    public ResponseEntity<?> complete(Principal principal, @PathVariable String sessionId, @RequestBody JsonNode body) {
        long userId = account(principal);
        empty(body);
        return ok(service().complete(userId, sessionId(sessionId)));
    }

    @PostMapping("/{sessionId}/abandon")
    public ResponseEntity<?> abandon(Principal principal, @PathVariable String sessionId, @RequestBody JsonNode body) {
        long userId = account(principal);
        empty(body);
        return ok(service().abandon(userId, sessionId(sessionId)));
    }

    private MinigameService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new MinigameException(503, "MINIGAME_NOT_CONFIGURED", "미니게임 DB 연결 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal == null) {
            throw new MinigameException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        try {
            long userId = Long.parseLong(principal.getName());
            if (userId <= 0) {
                throw new NumberFormatException();
            }
            return userId;
        } catch (NumberFormatException exception) {
            throw new MinigameException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private long sessionId(String value) {
        if (!value.matches("[1-9][0-9]{0,18}")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private void empty(JsonNode body) {
        if (!body.isObject() || !body.isEmpty()) {
            throw invalid();
        }
    }

    private MinigameException invalid() {
        return new MinigameException(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(MinigameException.class)
    ResponseEntity<?> failure(MinigameException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), null));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> malformed() {
        return failure(invalid());
    }

    @ExceptionHandler({DataAccessException.class, IllegalArgumentException.class, ArithmeticException.class})
    ResponseEntity<?> unavailable() {
        return failure(new MinigameException(503, "MINIGAME_UNAVAILABLE", "미니게임을 처리할 수 없습니다."));
    }

    public record ErrorResponse(String code, String message, Object details) {
    }
}
