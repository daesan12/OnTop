package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.table.service.TableHub;
import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public final class TableWebSocketMetrics implements MeterBinder {

    private final TableHub hub;

    public TableWebSocketMetrics(TableHub hub) {
        this.hub = hub;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("ontop.websocket.connections.active", hub,
                value -> value.metricsSnapshot().activeConnections())
                .description("Currently registered WebSocket connections")
                .register(registry);
        FunctionCounter.builder("ontop.websocket.connections.accepted", hub,
                value -> value.metricsSnapshot().acceptedConnections())
                .description("WebSocket connections registered since this Hub started")
                .register(registry);
        FunctionCounter.builder("ontop.websocket.connections.closed", hub,
                value -> value.metricsSnapshot().closedConnections())
                .description("Registered WebSocket connections cleaned up since this Hub started")
                .register(registry);
        FunctionCounter.builder("ontop.websocket.messages.received", hub,
                value -> value.metricsSnapshot().receivedMessages())
                .description("Text messages received from registered WebSocket connections, including invalid requests")
                .register(registry);
        FunctionCounter.builder("ontop.websocket.messages.sent", hub,
                value -> value.transmissionSnapshot().messages())
                .description("Completed WebSocket text send calls since this Hub started")
                .register(registry);
        FunctionCounter.builder("ontop.websocket.bytes.sent", hub,
                value -> value.transmissionSnapshot().bytes())
                .description("UTF-8 payload bytes of completed WebSocket text send calls")
                .baseUnit("bytes")
                .register(registry);
        for (ConnectionCloseReason reason : ConnectionCloseReason.values()) {
            FunctionCounter.builder("ontop.websocket.connections.closed.by.reason", hub,
                    value -> value.closedConnections(reason))
                    .tag("reason", reason.name())
                    .description("Registered connections cleaned up, classified by first observed server reason")
                    .register(registry);
        }
    }
}
