package com.ssafy.ontop.gacha;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import java.security.Principal;
import java.util.HashSet;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/gacha")
@Tag(name="Gacha")
@SecurityRequirement(name="AccessJwt")
public class GachaController {
    private final ObjectProvider<GachaService> services;
    public GachaController(ObjectProvider<GachaService> services) { this.services=services; }
    @GetMapping @Operation(summary="공유 뽑기 기계·본인 보관함·보상 목록")
    public ResponseEntity<GachaDtos.State> state(Principal principal) { return ok(service().state(user(principal))); }
    @GetMapping("/operations/{operationId}") @Operation(summary="본인 뽑기 작업 결과 복구")
    public ResponseEntity<GachaDtos.Result> recover(Principal principal,@PathVariable String operationId) { return ok(service().recover(user(principal),operationId)); }
    @PostMapping("/tickets") @Operation(summary="뽑기권 구매(한 장 100냥, quantity로 1~100장)", description="quantity를 빼면 한 장. 여러 장은 한 거래로 차감·지급한다. 보유 수량이 JavaScript 안전정수 한도를 초과하면 409 GACHA_CAPACITY_EXCEEDED로 거래 전체를 취소한다.")
    public ResponseEntity<GachaDtos.Result> purchase(Principal principal,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required=true,content=@Content(schema=@Schema(implementation=GachaDtos.BuyRequest.class)))
            @RequestBody JsonNode body) {
        if(body!=null&&body.has("quantity")) {
            fields(body,Set.of("operationId","quantity"));
            JsonNode quantity=body.get("quantity");
            // "quantity": null is the spec's nullable field left out: one ticket, the same request as no quantity.
            if(quantity.isNull()) return ok(service().purchase(user(principal),key(body)));
            if(!quantity.isIntegralNumber()||!quantity.canConvertToInt()) throw invalid();
            return ok(service().purchase(user(principal),key(body),quantity.intValue()));
        }
        fields(body,Set.of("operationId")); return ok(service().purchase(user(principal),key(body)));
    }
    @PostMapping("/draws") @Operation(summary="현재 회차에서 뽑기권 한 장 사용", description="이전 회차는 GACHA_ROUND_CHANGED, 서버 기준 보충 중에는 GACHA_REFILLING, 지급 후 보유 수량·잔액 한도 초과는 GACHA_CAPACITY_EXCEEDED(모두409). 거절 시 티켓을 소비하지 않으며 같은 확정 영수증은 먼저 복구한다.")
    public ResponseEntity<GachaDtos.Result> draw(Principal principal,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required=true,content=@Content(schema=@Schema(implementation=GachaDtos.DrawRequest.class)))
            @RequestBody JsonNode body) {
        fields(body,Set.of("operationId","roundId"));
        if(!body.path("roundId").isTextual()) throw invalid();
        return ok(service().draw(user(principal),key(body),body.get("roundId").textValue()));
    }
    @PostMapping("/boxes/open") @Operation(summary="등급 상자 하나를 의상 또는 중복 엽전으로 교환", description="중복 환급 후 잔액이 JavaScript 안전정수 한도를 초과하면 409 GACHA_CAPACITY_EXCEEDED로 상자 소비와 지급을 함께 취소한다.")
    public ResponseEntity<GachaDtos.Result> open(Principal principal,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required=true,content=@Content(schema=@Schema(implementation=GachaDtos.OpenRequest.class)))
            @RequestBody JsonNode body) {
        fields(body,Set.of("operationId","grade"));
        if(!body.path("grade").isIntegralNumber()||!body.get("grade").canConvertToInt()) throw invalid();
        return ok(service().open(user(principal),key(body),body.get("grade").intValue()));
    }
    private GachaService service() {
        var service=services.getIfAvailable();
        if(service==null) throw new GachaException(503,"GACHA_NOT_CONFIGURED","의상 뽑기는 아직 준비 중입니다.");
        return service;
    }
    private long user(Principal principal) {
        if(principal==null) throw new GachaException(401,"UNAUTHENTICATED","로그인이 필요합니다.");
        try { long id=Long.parseLong(principal.getName()); if(id<=0) throw invalid(); return id; }
        catch(NumberFormatException e) { throw new GachaException(401,"UNAUTHENTICATED","회원 인증이 필요합니다."); }
    }
    private void fields(JsonNode body,Set<String> allowed) {
        if(body==null||!body.isObject()) throw invalid();
        Set<String> actual=new HashSet<>(); body.fieldNames().forEachRemaining(actual::add);
        if(!actual.equals(allowed)) throw invalid();
    }
    private String key(JsonNode body) { if(!body.path("operationId").isTextual()) throw invalid(); return body.get("operationId").textValue(); }
    private GachaException invalid() { return new GachaException(400,"INVALID_REQUEST","요청 항목을 확인해주세요."); }
    private <T> ResponseEntity<T> ok(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
    public record ErrorResponse(String code,String message) { }
    @ExceptionHandler(GachaException.class) ResponseEntity<?> error(GachaException e) {
        return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore()).body(new ErrorResponse(e.code(),e.getMessage()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<?> invalidBody() { return error(invalid()); }
    @ExceptionHandler({DataAccessException.class,TransactionException.class}) ResponseEntity<?> storage() {
        return error(new GachaException(503,"GACHA_UNAVAILABLE","뽑기 정보를 확인할 수 없습니다. 같은 요청으로 다시 시도해주세요."));
    }
}
