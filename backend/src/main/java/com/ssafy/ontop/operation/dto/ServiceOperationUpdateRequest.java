package com.ssafy.ontop.operation.dto;

import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import java.time.Instant;

public record ServiceOperationUpdateRequest(ServiceOperationMode mode, String notice, Instant expectedOpenAt,
        long expectedVersion) {
}
