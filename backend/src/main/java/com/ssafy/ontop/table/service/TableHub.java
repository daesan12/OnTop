package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartCommand.Participant;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.domain.TableStartAttempt;
import com.ssafy.ontop.table.dto.TableListResponse;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.Request;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import com.ssafy.ontop.table.dto.TableSummaryResponse;
import com.ssafy.ontop.table.websocket.TablePeer;
import jakarta.annotation.PreDestroy;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

@Service
@Profile("local")
public class TableHub {

    private static final Logger log = LoggerFactory.getLogger(TableHub.class);

    private final TableProtocol protocol;
    private final Map<String, TableRoom> rooms = Map.of(
            "table-1", new TableRoom("table-1"), "table-2", new TableRoom("table-2"));
    private final Map<String, Member> members = new HashMap<>();
    private final Map<String, String> seating = new HashMap<>();
    private final Map<String, TableStartAttempt> starts = new HashMap<>();
    private final Map<String, Long> startRevisions = new HashMap<>();
    private final Optional<GameStartGateway> gateway;
    private final boolean startRehearsal;
    private final ExecutorService startWorkers = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledThreadPoolExecutor countdownTimer = new ScheduledThreadPoolExecutor(1,
            Thread.ofPlatform().daemon(true).name("table-countdown-", 0).factory());
    private final Map<String, ScheduledFuture<?>> countdownTasks = new HashMap<>();
    private final long countdownMillis;
    private boolean stopped;

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            @Value("${ontop.start-rehearsal.countdown-millis:5000}") long countdownMillis) {
        if (startRehearsal && gateway.isEmpty()) {
            throw new IllegalArgumentException("시작 연동 검증 대역이 필요합니다.");
        }
        this.gateway = gateway;
        this.startRehearsal = startRehearsal;
        if (countdownMillis < 0 || countdownMillis > 60000) {
            throw new IllegalArgumentException("검증 카운트다운은 0~60000ms입니다.");
        }
        this.countdownMillis = countdownMillis;
        countdownTimer.setRemoveOnCancelPolicy(true);
        protocol = new TableProtocol(mapper, startRehearsal);
    }

    public synchronized void connect(WebSocketSession session) {
        String userId = "dev-" + UUID.randomUUID();
        TablePeer peer = new TablePeer(session, () -> disconnect(session.getId()));
        members.put(session.getId(), new Member(userId, peer));
        peer.offer(protocol.encode(null, "CONNECTED", Map.of("userId", userId)));
        if (startRehearsal) {
            peer.offer(protocol.encode(null, "GAME_START_STATE", TableStartAttempt.View.waiting(null, 0)));
        }
        peer.start();
    }

    public synchronized TableListResponse listTables() {
        return new TableListResponse(rooms.keySet().stream().sorted().map(tableId -> {
            TableRoom.Snapshot snapshot = rooms.get(tableId).snapshot();
            int occupied = (int) snapshot.seats().stream().filter(seat -> seat.userId() != null).count();
            int ready = (int) snapshot.seats().stream()
                    .filter(seat -> seat.userId() != null && seat.ready()).count();
            TableStartAttempt attempt = starts.get(tableId);
            String status = attempt == null || !attempt.frozen() ? "WAITING"
                    : attempt.starting() ? "STARTING" : "REHEARSAL_CONFIRMED";
            if (attempt != null && attempt.countingDown()) {
                status = "COUNTDOWN";
            }
            int available = snapshot.capacity() - occupied;
            return new TableSummaryResponse(tableId, snapshot.capacity(), snapshot.minimumPlayers(), occupied,
                    available, ready, snapshot.allReady(), status, available > 0 && status.equals("WAITING"));
        }).toList());
    }

    public synchronized void receive(String sessionId, String text) {
        Member member = members.get(sessionId);
        if (member == null) {
            return;
        }
        String requestId = null;
        try {
            Request request = protocol.parse(text);
            requestId = request.requestId();
            switch (request.type()) {
                case "TABLE_JOIN" -> join(member, request);
                case "READY_SET" -> ready(member, request);
                case "TABLE_LEAVE" -> leave(member, request);
                case "GAME_START_CHECK" -> checkStart(member, request);
                default -> throw new IllegalStateException("검증되지 않은 메시지");
            }
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        } catch (RuntimeException exception) {
            log.error("테이블 요청 처리 실패 session={}", sessionId, exception);
            member.peer().offer(protocol.error(requestId, "INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다."));
        }
    }

    public synchronized void disconnect(String sessionId) {
        Member member = members.remove(sessionId);
        if (member == null) {
            return;
        }
        member.peer().stop();
        String tableId = seating.get(member.userId());
        if (tableId != null) {
            cancelCountdown(tableId);
            TableStartAttempt attempt = starts.get(tableId);
            if (attempt != null && attempt.frozen()) {
                if (attempt.starting() && !attempt.dispatched()) {
                    applyStartResult(tableId, attempt,
                            GameStartResult.rejected(attempt.command().startAttemptId(), "PARTICIPANT_LEFT"));
                }
                return;
            }
            seating.remove(member.userId());
            TableRoom room = rooms.get(tableId);
            room.leave(member.userId());
            publish(room, null, null);
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        stopped = true;
        members.values().forEach(member -> member.peer().stop());
        members.clear();
        seating.clear();
        starts.clear();
        countdownTasks.values().forEach(task -> task.cancel(false));
        countdownTasks.clear();
        countdownTimer.shutdownNow();
        startWorkers.shutdownNow();
    }

    private void join(Member member, Request request) {
        String tableId = request.payload().get("tableId").textValue();
        TableRoom room = rooms.get(tableId);
        if (room == null) {
            fail(request, "TABLE_NOT_FOUND", "등록되지 않은 테이블입니다.");
        }
        String current = seating.get(member.userId());
        if (current != null) {
            if (!current.equals(tableId)) {
                fail(request, "ALREADY_SEATED", "다른 테이블에 이미 착석했습니다.");
            }
            replyState(member, request, room);
            replyStartState(member, tableId, null);
            return;
        }
        ensureWaiting(tableId, request);
        if (!room.join(member.userId())) {
            fail(request, "TABLE_FULL", "빈 좌석이 없습니다.");
        }
        seating.put(member.userId(), tableId);
        publish(room, member, request.requestId());
        replyStartState(member, tableId, null);
    }

    private void ready(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request);
        if (room.setReady(member.userId(), request.payload().get("ready").booleanValue())) {
            publish(room, member, request.requestId());
            if (!room.snapshot().allReady()) {
                cancelCountdown(room.snapshot().tableId());
            }
            beginStartIfReady(room);
        } else {
            replyState(member, request, room);
        }
    }

    private void leave(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request);
        String tableId = seating.remove(member.userId());
        room.leave(member.userId());
        cancelCountdown(tableId);
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_LEFT", Map.of("tableId", tableId)));
        publish(room, null, null);
    }

    private TableRoom seatedRoom(Member member, Request request) {
        String tableId = seating.get(member.userId());
        if (tableId == null) {
            fail(request, "NOT_SEATED", "먼저 테이블에 착석해주세요.");
        }
        return rooms.get(tableId);
    }

    private void replyState(Member member, Request request, TableRoom room) {
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_STATE", room.snapshot()));
    }

    private void publish(TableRoom room, Member actor, String requestId) {
        TableRoom.Snapshot snapshot = room.snapshot();
        for (Member target : members.values()) {
            if (snapshot.tableId().equals(seating.get(target.userId()))) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "TABLE_STATE", snapshot));
            }
        }
    }

    private void fail(Request request, String code, String message) {
        throw new RequestException(request.requestId(), code, message);
    }

    private void ensureWaiting(String tableId, Request request) {
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt != null && attempt.frozen()) {
            fail(request, "TABLE_BUSY", "시작 연동 확인 중이거나 검증이 완료된 테이블입니다.");
        }
    }

    private void beginStartIfReady(TableRoom room) {
        TableRoom.Snapshot snapshot = room.snapshot();
        if (!startRehearsal || !snapshot.allReady()) {
            return;
        }
        TableStartAttempt current = starts.get(snapshot.tableId());
        if (current != null && (current.countingDown() || current.frozen())) {
            return;
        }
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), snapshot.tableId(), snapshot.version(),
                "OMOK", snapshot.seats().stream()
                        .map(seat -> new Participant(seat.userId(), seat.seatNumber())).toList());
        TableStartAttempt attempt = new TableStartAttempt(command, countdownMillis);
        starts.put(snapshot.tableId(), attempt);
        publishStart(snapshot.tableId());
        if (countdownMillis == 0) {
            startWorkers.execute(() -> dispatchStart(snapshot.tableId(), attempt));
        } else {
            countdownTasks.put(snapshot.tableId(), countdownTimer.schedule(
                    () -> submitCountdownStart(snapshot.tableId(), attempt),
                    countdownMillis, TimeUnit.MILLISECONDS));
        }
    }

    private synchronized void submitCountdownStart(String tableId, TableStartAttempt attempt) {
        if (!stopped) {
            startWorkers.execute(() -> dispatchStart(tableId, attempt));
        }
    }

    private void cancelCountdown(String tableId) {
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt == null || !attempt.countingDown()) {
            return;
        }
        ScheduledFuture<?> task = countdownTasks.remove(tableId);
        if (task != null) {
            task.cancel(false);
        }
        attempt.cancelCountdown();
        publishStart(tableId);
    }

    private void dispatchStart(String tableId, TableStartAttempt attempt) {
        synchronized (this) {
            if (stopped || starts.get(tableId) != attempt || (!attempt.starting() && !attempt.countingDown())) {
                return;
            }
            countdownTasks.remove(tableId);
            Set<String> connected = connectedUsers();
            TableRoom.Snapshot snapshot = rooms.get(tableId).snapshot();
            if (snapshot.version() != attempt.command().tableVersion() || !snapshot.allReady()
                    || !attempt.command().participants().stream()
                            .allMatch(player -> connected.contains(player.userId()))) {
                applyStartResult(tableId, attempt,
                        GameStartResult.rejected(attempt.command().startAttemptId(), "PARTICIPANT_LEFT"));
                return;
            }
            if (attempt.countingDown()) {
                attempt.finishCountdown();
                publishStart(tableId);
            }
            attempt.dispatch();
        }
        callGateway(tableId, attempt, false);
    }

    private void checkStart(Member member, Request request) {
        String tableId = seatedRoom(member, request).snapshot().tableId();
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt == null) {
            fail(request, "START_NOT_REQUESTED", "아직 시작 연동 요청이 없습니다.");
        }
        replyStartState(member, tableId, request.requestId());
        if (attempt.beginCheck()) {
            startWorkers.execute(() -> callGateway(tableId, attempt, true));
        }
    }

    private void callGateway(String tableId, TableStartAttempt attempt, boolean lookup) {
        try {
            GameStartGateway target = gateway.orElseThrow();
            GameStartResult result = lookup ? target.findStartResult(attempt.command().startAttemptId())
                    : target.startGame(attempt.command());
            synchronized (this) {
                if (!stopped && starts.get(tableId) == attempt && attempt.starting()) {
                    applyStartResult(tableId, attempt, result);
                }
            }
        } catch (RuntimeException exception) {
            log.warn("시작 연동 결과 미확정 table={} attempt={}", tableId, attempt.command().startAttemptId(), exception);
            synchronized (this) {
                if (!stopped && starts.get(tableId) == attempt && attempt.starting()) {
                    attempt.uncertain();
                    publishStart(tableId);
                }
            }
        } finally {
            synchronized (this) {
                if (lookup) {
                    attempt.finishCheck();
                }
            }
        }
    }

    private void applyStartResult(String tableId, TableStartAttempt attempt, GameStartResult result) {
        attempt.apply(result);
        if (!attempt.frozen()) {
            Set<String> connected = connectedUsers();
            rooms.get(tableId).returnToWaiting(connected);
            seating.entrySet().removeIf(entry -> entry.getValue().equals(tableId)
                    && !connected.contains(entry.getKey()));
            publish(rooms.get(tableId), null, null);
        }
        publishStart(tableId);
    }

    private Set<String> connectedUsers() {
        return members.values().stream().map(Member::userId).collect(Collectors.toSet());
    }

    private void publishStart(String tableId) {
        startRevisions.merge(tableId, 1L, Long::sum);
        for (Member target : members.values()) {
            if (tableId.equals(seating.get(target.userId()))) {
                replyStartState(target, tableId, null);
            }
        }
    }

    private void replyStartState(Member target, String tableId, String requestId) {
        if (!startRehearsal) {
            return;
        }
        long revision = startRevisions.getOrDefault(tableId, 0L);
        TableStartAttempt attempt = starts.get(tableId);
        TableStartAttempt.View view = attempt == null ? TableStartAttempt.View.waiting(tableId, revision)
                : attempt.view(revision);
        target.peer().offer(protocol.encode(requestId, "GAME_START_STATE", view));
    }

    private record Member(String userId, TablePeer peer) {
    }
}
