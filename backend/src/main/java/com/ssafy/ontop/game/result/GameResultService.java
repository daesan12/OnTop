package com.ssafy.ontop.game.result;

import jakarta.annotation.PreDestroy;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;

@Service
@Profile("(local | dev) & !prod & !production")
public class GameResultService {

    private final Optional<GameResultGateway> gateway;
    private final ApplicationEventPublisher events;
    private final Map<String, Slot> connections = new HashMap<>();
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
    private boolean stopped;

    public GameResultService(Optional<GameResultGateway> gateway) {
        this(gateway, event -> { });
    }

    @Autowired
    public GameResultService(Optional<GameResultGateway> gateway, ApplicationEventPublisher events) {
        this.gateway = gateway;
        this.events = events;
    }

    public synchronized void connected(String sessionId, long userId, Consumer<Delivery> output) {
        if (!stopped) {
            connections.put(sessionId, new Slot(userId, output));
        }
    }

    public synchronized void disconnected(String sessionId) {
        connections.remove(sessionId);
    }

    public synchronized void check(String sessionId, String requestId, String gameId) {
        Slot slot = connections.get(sessionId);
        if (slot == null || stopped) {
            return;
        }
        if (gateway.isEmpty() || slot.loading) {
            slot.output.accept(new Delivery(requestId, null,
                    gateway.isEmpty() ? "GAME_RESULT_NOT_CONFIGURED" : "GAME_RESULT_PENDING"));
            return;
        }
        slot.loading = true;
        workers.execute(() -> load(sessionId, slot, requestId, gameId));
    }

    /** 규칙 엔진의 종료는 지급 완료가 아니다. 이미 저장된 본인 결과만 한 번 확인한다. */
    public synchronized void finished(String gameId, List<Long> participants) {
        if (stopped || gateway.isEmpty()) {
            return;
        }
        for (var entry : connections.entrySet()) {
            Slot slot = entry.getValue();
            if (participants.contains(slot.userId) && slot.refreshing.add(gameId)) {
                String sessionId = entry.getKey();
                workers.execute(() -> refresh(sessionId, slot, gameId));
            }
        }
    }

    private void refresh(String sessionId, Slot slot, String gameId) {
        GameResultView result = null;
        try {
            result = gateway.orElseThrow().load(slot.userId, gameId).orElse(null);
        } catch (RuntimeException exception) {
            // 저장 전·일시 실패를 결과로 꾸미지 않는다. 커밋 알림 또는 명시 조회로 복구한다.
        }
        synchronized (this) {
            slot.refreshing.remove(gameId);
            if (stopped || connections.get(sessionId) != slot || result == null
                    || result.userId() != slot.userId || !result.gameSessionId().equals(gameId)
                    || result.version() <= slot.versions.getOrDefault(gameId, -1L)) {
                return;
            }
            slot.output.accept(new Delivery(null, result, null));
            // 조회 성공만으로 전송 완료로 기록하면 같은 버전의 outbox 재전달이 사라진다.
            remember(slot, result);
        }
        notifyRead(result);
    }

    private void load(String sessionId, Slot slot, String requestId, String gameId) {
        GameResultView result = null;
        String error = null;
        try {
            result = gateway.orElseThrow().load(slot.userId, gameId).orElse(null);
            if (result == null) {
                error = "GAME_RESULT_ACCESS_DENIED";
            } else if (result.userId() != slot.userId || !result.gameSessionId().equals(gameId)) {
                error = "GAME_RESULT_INVALID";
            }
        } catch (RuntimeException exception) {
            error = "GAME_RESULT_UNAVAILABLE";
        }
        synchronized (this) {
            if (stopped || connections.get(sessionId) != slot) {
                return;
            }
            slot.loading = false;
            if (error == null && result.version() < slot.versions.getOrDefault(gameId, -1L)) {
                error = "GAME_RESULT_STALE";
            }
            slot.output.accept(new Delivery(requestId, error == null ? result : null, error));
            if (error == null) {
                remember(slot, result);
            }
        }
        if (error == null) { notifyRead(result); }
    }

    private void notifyRead(GameResultView result) {
        try { events.publishEvent(new GameResultLoaded(result)); }
        catch (RuntimeException exception) {
            org.slf4j.LoggerFactory.getLogger(GameResultService.class).warn("저장 결과 후속 상태 반영 실패");
        }
    }

    @EventListener
    public synchronized void committed(GameResultCommitted event) {
        if (stopped) {
            return;
        }
        GameResultView result = event.result();
        RuntimeException failure = null;
        for (Slot slot : connections.values()) {
            if (slot.userId != result.userId()
                    || result.version() <= slot.versions.getOrDefault(result.gameSessionId(), -1L)) {
                continue;
            }
            try {
                slot.output.accept(new Delivery(null, result, null));
                // 전송 인계에 실패한 연결의 version을 앞당기면 outbox 재전달이 차단된다.
                remember(slot, result);
            } catch (RuntimeException exception) {
                failure = exception;
            }
        }
        if (failure != null) {
            throw failure;
        }
    }

    private void remember(Slot slot, GameResultView result) {
        slot.versions.remove(result.gameSessionId());
        slot.versions.put(result.gameSessionId(), result.version());
        // 현재 연결의 최근64경기만 중복 억제한다. 영속 이력·재접속 복구의 대체물이 아니다.
        if (slot.versions.size() > 64) {
            slot.versions.remove(slot.versions.keySet().iterator().next());
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        stopped = true;
        connections.clear();
        workers.shutdownNow();
    }

    public record Delivery(String requestId, GameResultView result, String errorCode) { }

    private static final class Slot {
        private final long userId;
        private final Consumer<Delivery> output;
        private final Map<String, Long> versions = new LinkedHashMap<>();
        private final Set<String> refreshing = new HashSet<>();
        private boolean loading;

        private Slot(long userId, Consumer<Delivery> output) {
            this.userId = userId;
            this.output = output;
        }
    }
}
