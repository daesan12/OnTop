package com.ssafy.ontop.shop;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.shop.service.ShopService;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class ShopController {
    private final ObjectProvider<ShopService> services;

    public ShopController(ObjectProvider<ShopService> services) {
        this.services = services;
    }

    @GetMapping("/api/v1/shop/items")
    public ResponseEntity<?> catalog(Principal principal) {
        account(principal);
        return ok(service().catalog());
    }

    @GetMapping("/api/v1/users/me/items")
    public ResponseEntity<?> inventory(Principal principal) {
        return ok(service().inventory(account(principal)));
    }

    @PostMapping("/api/v1/shop/purchases")
    public ResponseEntity<?> purchase(Principal principal, @RequestBody JsonNode body, HttpServletRequest request) {
        long userId = account(principal);
        if (!body.isObject() || body.size() != 2 || !isPositive(body.get("itemId"))
                || !isPositive(body.get("quantity")) || !body.get("quantity").canConvertToInt()) {
            throw invalid();
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        return ok(service().purchase(userId, body.get("itemId").longValue(),
                body.get("quantity").intValue(), keys.getFirst()));
    }

    @PatchMapping("/api/v1/users/me/equipment")
    public ResponseEntity<?> equip(Principal principal, @RequestBody JsonNode body) {
        long userId = account(principal);
        if (!body.isObject() || body.size() != 1 || !isPositive(body.get("userItemId"))) {
            throw invalid();
        }
        return ok(service().equip(userId, body.get("userItemId").longValue()));
    }

    private ShopService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new ShopException(503, "SHOP_NOT_CONFIGURED", "상점 DB 연결 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal == null) {
            throw new ShopException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        try {
            long id = Long.parseLong(principal.getName());
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return id;
        } catch (NumberFormatException exception) {
            throw new ShopException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private static boolean isPositive(JsonNode value) {
        return value != null && value.isIntegralNumber() && value.canConvertToLong() && value.longValue() > 0;
    }

    private ShopException invalid() {
        return new ShopException(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(ShopException.class)
    ResponseEntity<?> shopError(ShopException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), null));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> malformed() {
        return shopError(invalid());
    }

    @ExceptionHandler({DataAccessException.class, IllegalArgumentException.class})
    ResponseEntity<?> unavailable() {
        return shopError(new ShopException(503, "SHOP_UNAVAILABLE", "상점을 확인할 수 없습니다."));
    }

    public record ErrorResponse(String code, String message, Object details) { }
}

