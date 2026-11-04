package com.ssafy.ontop.operation.repository;

import com.ssafy.ontop.operation.domain.ServiceOperationState;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("!db")
public class InMemoryServiceOperationStateStore implements ServiceOperationStateStore {
    private final AtomicReference<ServiceOperationState> state =
            new AtomicReference<>(ServiceOperationState.normal(Instant.EPOCH));

    @Override
    public ServiceOperationState load() {
        return state.get();
    }

    @Override
    public boolean update(ServiceOperationState next, long expectedVersion) {
        while (true) {
            ServiceOperationState current = state.get();
            if (current.version() != expectedVersion) {
                return false;
            }
            if (state.compareAndSet(current, next)) {
                return true;
            }
        }
    }
}
