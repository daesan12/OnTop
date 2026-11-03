package com.ssafy.ontop.operation.service;

import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.domain.ServiceOperationState;
import com.ssafy.ontop.operation.repository.InMemoryServiceOperationStateStore;
import com.ssafy.ontop.operation.repository.ServiceOperationStateStore;
import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class ServiceOperationService {
    private static final int MAX_NOTICE_LENGTH = 200;

    private final ServiceOperationStateStore store;
    private final Clock clock;

    public ServiceOperationService(ServiceOperationStateStore store, @Qualifier("oauthClock") Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    public ServiceOperationState current() {
        return store.load();
    }

    public boolean allowsNewActivity() {
        return current().allowsNewActivity();
    }

    public ServiceOperationState update(long administratorId, ServiceOperationMode mode, String notice,
            Instant expectedOpenAt, long expectedVersion) {
        if (administratorId <= 0 || mode == null || expectedVersion < 0) {
            throw new IllegalArgumentException("운영 상태 변경 요청을 확인해주세요.");
        }
        Instant now = clock.instant();
        ServiceOperationState current = current();
        if (current.version() != expectedVersion) {
            throw new ServiceOperationConflictException();
        }
        String normalizedNotice = normalizeNotice(notice);
        ServiceOperationState next;
        if (mode == ServiceOperationMode.NORMAL) {
            next = new ServiceOperationState(mode, "", null, null, expectedVersion + 1,
                    administratorId, now);
        } else {
            if (normalizedNotice.isBlank() || expectedOpenAt == null || !expectedOpenAt.isAfter(now)) {
                throw new IllegalArgumentException("점검 안내와 현재보다 뒤인 재개 예정 시각이 필요합니다.");
            }
            Instant startedAt = current.mode() == ServiceOperationMode.NORMAL
                    ? now : current.maintenanceStartedAt();
            next = new ServiceOperationState(mode, normalizedNotice, startedAt, expectedOpenAt,
                    expectedVersion + 1, administratorId, now);
        }
        if (!store.update(next, expectedVersion)) {
            throw new ServiceOperationConflictException();
        }
        return next;
    }

    public Instant serverTime() {
        return clock.instant();
    }

    public static ServiceOperationService alwaysOpen() {
        return new ServiceOperationService(new InMemoryServiceOperationStateStore(), Clock.systemUTC());
    }

    private static String normalizeNotice(String notice) {
        String normalized = notice == null ? "" : notice.strip();
        if (normalized.length() > MAX_NOTICE_LENGTH) {
            throw new IllegalArgumentException("점검 안내는 200자 이하여야 합니다.");
        }
        return normalized;
    }
}
