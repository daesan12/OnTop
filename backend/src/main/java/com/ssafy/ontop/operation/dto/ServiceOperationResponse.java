package com.ssafy.ontop.operation.dto;

import com.ssafy.ontop.operation.domain.ServiceOperationState;
import java.time.Instant;

public record ServiceOperationResponse(String mode, String notice, Instant maintenanceStartedAt,
        Instant expectedOpenAt, long version, Instant updatedAt, Instant serverTime) {

    public static ServiceOperationResponse from(ServiceOperationState state, Instant serverTime) {
        return new ServiceOperationResponse(state.mode().name(), state.notice(), state.maintenanceStartedAt(),
                state.expectedOpenAt(), state.version(), state.updatedAt(), serverTime);
    }
}
