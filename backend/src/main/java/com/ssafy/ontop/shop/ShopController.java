package com.ssafy.ontop.shop;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.shop.service.ShopService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import com.ssafy.ontop.config.RuntimeProfiles;
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
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Shop")
public class ShopController {
    private final ObjectProvider<ShopService> services;

    public ShopController(ObjectProvider<ShopService> services) {
        this.services = services;
    }

    @Operation(summary = "판매 아이템 목록", description = "판매 중인 실제 Item 목록을 조회합니다.", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.shop.dto.ItemListResponse.class))),
        @ApiResponse(responseCode = "401", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SHOP_NOT_CONFIGURED / SHOP_UNAVAILABLE 또는 인증 DB 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class)))
    })
    @GetMapping("/api/v1/shop/items")
    public ResponseEntity<?> catalog(Principal principal) {
        account(principal);
        return ok(service().catalog());
    }

    @Operation(summary = "내 보유 아이템", description = "인증된 본인 계정의 수량이 양수인 보유 아이템을 조회합니다.", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.shop.dto.InventoryResponse.class))),
        @ApiResponse(responseCode = "401", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SHOP_NOT_CONFIGURED / SHOP_UNAVAILABLE 또는 인증 DB 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class)))
    })
    @GetMapping("/api/v1/users/me/items")
    public ResponseEntity<?> inventory(Principal principal) {
        return ok(service().inventory(account(principal)));
    }

    @Operation(summary = "아이템 구매", description = "지갑을 잠그고 잔액 차감·보유량·거래 원장·멱등 영수증을 한 트랜잭션으로 저장합니다. 의상 중복 구매는 REJECT 정책입니다. Idempotency-Key가 필요합니다.", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.shop.dto.PurchaseResponse.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST 또는 QUANTITY_TOO_LARGE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "404", description = "ITEM_NOT_FOUND 또는 OWNED_ITEM_NOT_FOUND",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY / ITEM_ALREADY_OWNED / IDEMPOTENCY_CONFLICT / INSUFFICIENT_BALANCE / ITEM_NOT_EQUIPPABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SHOP_NOT_CONFIGURED / SHOP_UNAVAILABLE 또는 인증 DB 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class)))
    })
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

    @Operation(summary = "내 의상 장착", description = "보유한 의상을 같은 슬롯의 기존 장착과 교체합니다. 커밋 후 의상 변경 이벤트를 발행합니다.", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.shop.dto.EquipmentResponse.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST 또는 QUANTITY_TOO_LARGE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "404", description = "ITEM_NOT_FOUND 또는 OWNED_ITEM_NOT_FOUND",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY / ITEM_ALREADY_OWNED / IDEMPOTENCY_CONFLICT / INSUFFICIENT_BALANCE / ITEM_NOT_EQUIPPABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "기존 REST 인증/인가/설정 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SHOP_NOT_CONFIGURED / SHOP_UNAVAILABLE 또는 인증 DB 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ShopController.ErrorResponse.class)))
    })
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

    @Schema(name = "ShopErrorResponse")
    public record ErrorResponse(String code, String message, Object details) { }
}

