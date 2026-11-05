package com.ssafy.ontop.operation.domain;

import java.time.Instant;

public record ServiceOperationState(ServiceOperationMode mode, String notice, Instant maintenanceStartedAt,
        Instant expectedOpenAt, long version, Long updatedBy, Instant updatedAt) {

    public ServiceOperationState {
        if (mode == null || notice == null || version < 0 || updatedAt == null) {
            throw new IllegalArgumentException("운영 상태 값을 확인해주세요.");
        }
        if (updatedBy != null && updatedBy <= 0) {
            throw new IllegalArgumentException("운영 상태 변경 회원을 확인해주세요.");
        }
    }

    public static ServiceOperationState normal(Instant now) {
        return new ServiceOperationState(ServiceOperationMode.NORMAL, "", null, null, 0, null, now);
    }

    public boolean allowsNewActivity() {
        return mode == ServiceOperationMode.NORMAL;
    }
}
