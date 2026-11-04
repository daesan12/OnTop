package com.ssafy.ontop.operation.repository;

import com.ssafy.ontop.operation.domain.ServiceOperationState;

public interface ServiceOperationStateStore {
    ServiceOperationState load();

    boolean update(ServiceOperationState state, long expectedVersion);
}
