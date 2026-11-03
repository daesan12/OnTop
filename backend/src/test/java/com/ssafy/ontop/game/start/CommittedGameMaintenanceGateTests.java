package com.ssafy.ontop.game.start;

import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.repository.InMemoryServiceOperationStateStore;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class CommittedGameMaintenanceGateTests {
    @Test
    void 배출_중에는_판돈_예약_전에_새_보드게임을_거절한다() {
        Instant now = Instant.parse("2026-11-04T03:00:00Z");
        var operations = new ServiceOperationService(new InMemoryServiceOperationStateStore(),
                Clock.fixed(now, ZoneOffset.UTC));
        operations.update(42, ServiceOperationMode.DRAINING, "경기를 마무리하고 있어요.",
                now.plusSeconds(600), 0);
        GameStartGateway gateway = mock(GameStartGateway.class);
        var service = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                true, false);
        service.configureOperationGate(operations);
        var command = new GameStartCommand(UUID.randomUUID(), "table-1", 1, "OMOK", List.of(
                new GameStartCommand.Participant("101", 1),
                new GameStartCommand.Participant("202", 2)));

        GameStartResult result = service.start(command);

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        assertThat(result.code()).isEqualTo("SERVICE_DRAINING");
        verifyNoInteractions(gateway);
    }
}
