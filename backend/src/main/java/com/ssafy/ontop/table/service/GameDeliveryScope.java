package com.ssafy.ontop.table.service;

import com.ssafy.ontop.game.reconnect.GameReconnectService.View;
import com.ssafy.ontop.game.result.GameResultService.Delivery;
import com.ssafy.ontop.table.dto.TableProtocol;
import java.util.Map;
import java.util.function.Consumer;

/** Hub와 비동기 서비스의 락을 역전하지 않고 현재 라운드의 종료 전달만 제한한다. */
final class GameDeliveryScope {
    private final TableProtocol protocol;
    private final Consumer<String> output;
    private String gameId;
    private boolean closed;
    private boolean left;
    private boolean starting;
    private final Map<String, Delivery> pendingResults = new java.util.LinkedHashMap<>();

    GameDeliveryScope(TableProtocol protocol, Consumer<String> output) {
        this.protocol = protocol;
        this.output = output;
    }

    synchronized void current(String gameId) {
        this.gameId = gameId;
        if (gameId != null) {
            left = false;
            starting = false;
            Delivery result = pendingResults.remove(gameId);
            pendingResults.clear();
            if (!closed && result != null) { output.accept(protocol.encode(null, "GAME_RESULT", result.result())); }
        }
    }

    synchronized void starting() { gameId = null; starting = true; pendingResults.clear(); }
    synchronized void startFailed() { starting = false; pendingResults.clear(); }

    synchronized boolean allowsFinished(String candidate) {
        return !closed && candidate != null && candidate.equals(gameId);
    }

    synchronized void recovery(String requestId, View view) {
        if (closed) { return; }
        if (view.status().equals("FINISHED") && !allowsFinished(view.gameId())
                || left && view.status().equals("RESTORED")) {
            view = new View("LOBBY", null, null, null, null, null);
        }
        output.accept(protocol.encode(requestId, "GAME_CONNECTION_STATE", view));
    }

    synchronized void result(Delivery delivery) {
        if (closed) { return; }
        if (delivery.requestId() == null && delivery.result() != null
                && !allowsFinished(delivery.result().gameSessionId())) {
            if (starting) {
                String id = delivery.result().gameSessionId();
                Delivery prior = pendingResults.get(id);
                if (prior == null || prior.result().version() < delivery.result().version()) { pendingResults.put(id, delivery); }
                if (pendingResults.size() > 64) { pendingResults.remove(pendingResults.keySet().iterator().next()); }
            }
            return;
        }
        output.accept(delivery.errorCode() != null
                ? protocol.error(delivery.requestId(), delivery.errorCode(), "경기 결과를 확인할 수 없습니다.")
                : protocol.encode(delivery.requestId(), "GAME_RESULT", delivery.result()));
    }

    synchronized void left(String requestId, String tableId) {
        gameId = null;
        left = true;
        starting = false;
        pendingResults.clear();
        output.accept(protocol.encode(requestId, "TABLE_LEFT", Map.of("tableId", tableId)));
    }

    synchronized void close() { closed = true; gameId = null; pendingResults.clear(); }
}
