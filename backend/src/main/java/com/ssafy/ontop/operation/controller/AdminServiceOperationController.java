package com.ssafy.ontop.operation.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.operation.dto.ServiceOperationResponse;
import com.ssafy.ontop.operation.dto.ServiceOperationUpdateRequest;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/operations")
@Tag(name = "ADMIN")
@SecurityRequirement(name = "AccessJwt")
public class AdminServiceOperationController {
    private final ServiceOperationService operations;

    public AdminServiceOperationController(ServiceOperationService operations) {
        this.operations = operations;
    }

    @GetMapping("/status")
    @Operation(summary = "관리자 서비스 운영 상태 조회")
    public ResponseEntity<ServiceOperationResponse> status() {
        return response();
    }

    @PutMapping("/status")
    @Operation(summary = "서비스 배출·점검·정상 상태 전환")
    public ResponseEntity<ServiceOperationResponse> update(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody ServiceOperationUpdateRequest request) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        if (request == null) {
            throw new IllegalArgumentException("운영 상태 변경 요청을 확인해주세요.");
        }
        operations.update(user.userId(), request.mode(), request.notice(), request.expectedOpenAt(),
                request.expectedVersion());
        return response();
    }

    private ResponseEntity<ServiceOperationResponse> response() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ServiceOperationResponse.from(operations.current(), operations.serverTime()));
    }
}
