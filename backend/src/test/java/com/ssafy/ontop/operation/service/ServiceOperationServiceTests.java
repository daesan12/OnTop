package com.ssafy.ontop.operation.service;

import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.repository.InMemoryServiceOperationStateStore;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ServiceOperationServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-04T03:00:00Z");

    private final ServiceOperationService service = new ServiceOperationService(
            new InMemoryServiceOperationStateStore(), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void 기본_상태에서는_새_접속과_경기를_허용한다() {
        assertThat(service.current().mode()).isEqualTo(ServiceOperationMode.NORMAL);
        assertThat(service.allowsNewActivity()).isTrue();
    }

    @Test
    void 배출_상태는_예정_시각과_안내를_저장하고_새_활동을_막는다() {
        var changed = service.update(42, ServiceOperationMode.DRAINING, "진행 중인 경기를 마무리하고 있어요.",
                NOW.plusSeconds(600), 0);

        assertThat(changed.mode()).isEqualTo(ServiceOperationMode.DRAINING);
        assertThat(changed.maintenanceStartedAt()).isEqualTo(NOW);
        assertThat(changed.expectedOpenAt()).isEqualTo(NOW.plusSeconds(600));
        assertThat(changed.version()).isEqualTo(1);
        assertThat(changed.updatedBy()).isEqualTo(42);
        assertThat(service.allowsNewActivity()).isFalse();
    }

    @Test
    void 지난_예정_시각과_오래된_버전은_거절한다() {
        assertThatThrownBy(() -> service.update(42, ServiceOperationMode.DRAINING, "점검", NOW, 0))
                .isInstanceOf(IllegalArgumentException.class);
        service.update(42, ServiceOperationMode.DRAINING, "점검", NOW.plusSeconds(600), 0);
        assertThatThrownBy(() -> service.update(42, ServiceOperationMode.NORMAL, "", null, 0))
                .isInstanceOf(ServiceOperationConflictException.class);
    }

    @Test
    void 정상_전환은_점검_안내와_시각을_지운다() {
        service.update(42, ServiceOperationMode.MAINTENANCE, "점검", NOW.plusSeconds(600), 0);

        var changed = service.update(42, ServiceOperationMode.NORMAL, "무시할 안내", NOW.plusSeconds(900), 1);

        assertThat(changed.mode()).isEqualTo(ServiceOperationMode.NORMAL);
        assertThat(changed.notice()).isEmpty();
        assertThat(changed.maintenanceStartedAt()).isNull();
        assertThat(changed.expectedOpenAt()).isNull();
        assertThat(service.allowsNewActivity()).isTrue();
    }
}
