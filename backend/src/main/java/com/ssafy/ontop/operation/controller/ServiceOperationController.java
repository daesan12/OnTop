package com.ssafy.ontop.operation.controller;

import com.ssafy.ontop.operation.dto.ServiceOperationResponse;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operations")
@Tag(name = "OPERATION")
public class ServiceOperationController {
    private final ServiceOperationService operations;

    public ServiceOperationController(ServiceOperationService operations) {
        this.operations = operations;
    }

    @GetMapping("/status")
    @Operation(summary = "공개 서비스 운영 상태 조회", description = "점검 화면에 사용할 상태와 예상 재개 시각을 반환합니다.")
    public ResponseEntity<ServiceOperationResponse> status() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ServiceOperationResponse.from(operations.current(), operations.serverTime()));
    }
}
