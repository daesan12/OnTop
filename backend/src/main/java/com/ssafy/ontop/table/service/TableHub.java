package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartCommand.Participant;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.domain.TableStartAttempt;
import com.ssafy.ontop.table.dto.TableListResponse;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.Request;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import com.ssafy.ontop.table.dto.TableSummaryResponse;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.domain.ChatText;
import com.ssafy.ontop.world.domain.EmoteCode;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import jakarta.annotation.PreDestroy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

@Service
@Profile("local")
public class TableHub {

    private static final Logger log = LoggerFactory.getLogger(TableHub.class);

    private final TableProtocol protocol;
    private final Map<String, TableRoom> rooms = new HashMap<>();
    private final Map<String, String> tableChannels = new HashMap<>();
    private final Set<String> channelIds;
    private final Map<String, Member> members = new HashMap<>();
    private final Map<String, String> seating = new HashMap<>();
    private final Map<String, String> watching = new HashMap<>();
    private final Map<String, TableStartAttempt> starts = new HashMap<>();
    private final Map<String, Long> startRevisions = new HashMap<>();
    private final Optional<GameStartGateway> gateway;
    private final boolean startRehearsal;
    private final Optional<GameStateGateway> gameStates;
    private final Set<String> stateQueries = new HashSet<>();
    private final Map<String, StatePush> statePushes = new HashMap<>();
    private final Set<String> stateLoads = new HashSet<>();
    private final Optional<GameActionGateway> gameActions;
    private final Set<String> actionRequests = new HashSet<>();
    private final Optional<GameReconnectService> reconnect;
    private final Optional<GameResultService> gameResults;
    private final WorldChannelRegistry channels;
    private final WorldChatService chat;
    private final WorldEmoteService emotes;
    private final ExecutorService startWorkers = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService heartbeatTimer = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("table-heartbeat").factory());
    private final Duration heartbeatInterval;
    private final Duration heartbeatTimeout;
    private long acceptedConnections;
    private long closedConnections;
    private long receivedMessages;
    private final LongAdder sentMessages = new LongAdder();
    private final LongAdder sentBytes = new LongAdder();
    private final Map<ConnectionCloseReason, LongAdder> closedByReason = new EnumMap<>(ConnectionCloseReason.class);
    private boolean stopped;

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            boolean startRehearsal) {
        this(mapper, gateway, startRehearsal, Optional.empty());
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            boolean startRehearsal,
            Optional<GameReconnectService> reconnect) {
        this(mapper, gateway, startRehearsal, reconnect, Duration.ofSeconds(10), Duration.ofSeconds(10));
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            boolean startRehearsal, Optional<GameReconnectService> reconnect,
            Duration heartbeatInterval, Duration heartbeatTimeout) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout,
                new WorldChannelRegistry(new WorldChannelProperties(null)));
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            boolean startRehearsal, Optional<GameReconnectService> reconnect,
            Duration heartbeatInterval, Duration heartbeatTimeout, WorldChannelRegistry channels) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels,
                new WorldChatService(Duration.ofSeconds(1)));
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            boolean startRehearsal, Optional<GameReconnectService> reconnect,
            Duration heartbeatInterval, Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)));
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout,
                channels, chat, emotes, Optional.empty());
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout,
                channels, chat, emotes, gameStates, Optional.empty());
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout,
                channels, chat, emotes, gameStates, gameActions, Optional.empty());
    }

    @Autowired
    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults) {
        if (startRehearsal && gateway.isEmpty()) {
            throw new IllegalArgumentException("시작 연동 검증 대역이 필요합니다.");
        }
        this.gateway = gateway;
        this.gameStates = gameStates;
        this.gameActions = gameActions;
        this.startRehearsal = startRehearsal;
        this.reconnect = reconnect;
        this.gameResults = gameResults;
        this.channels = channels;
        this.chat = chat;
        this.emotes = emotes;
        for (ConnectionCloseReason reason : ConnectionCloseReason.values()) {
            closedByReason.put(reason, new LongAdder());
        }
        channelIds = Set.copyOf(channels.snapshot().keySet());
        if (channelIds.isEmpty()) {
            rooms.put("table-1", new TableRoom("table-1"));
            rooms.put("table-2", new TableRoom("table-2"));
        } else {
            // tableId는 채널 사이에서도 유일하다. 시작 연동과 보존 좌석도 같은 키로 격리한다.
            for (String channelId : channelIds) {
                for (int number = 1; number <= 2; number++) {
                    String tableId = "table-" + UUID.nameUUIDFromBytes(
                            (channelId + "\0table-" + number).getBytes(StandardCharsets.UTF_8));
                    rooms.put(tableId, new TableRoom(tableId));
                    tableChannels.put(tableId, channelId);
                }
            }
        }
        // 잘못된 시간 설정은 연결을 받기 전에 실패시킨다.
        new WebSocketHeartbeat(heartbeatInterval, heartbeatTimeout, System::nanoTime);
        this.heartbeatInterval = heartbeatInterval;
        this.heartbeatTimeout = heartbeatTimeout;
        protocol = new TableProtocol(mapper, startRehearsal);
        heartbeatTimer.scheduleWithFixedDelay(this::checkHeartbeats, 100, 100, TimeUnit.MILLISECONDS);
    }

    public synchronized void connect(WebSocketSession session) {
        String userId = "dev-" + UUID.randomUUID();
        register(session, userId, null);
    }

    public synchronized boolean connectAuthenticated(WebSocketSession session, VerifiedWebSocketUser user) {
        String userId = Long.toString(user.userId());
        // 사용자 확정: 기존 연결이 살아 있으면 새 연결만 거절한다.
        if (seating.containsKey(userId)
                || members.values().stream().anyMatch(member -> member.userId().equals(userId))) {
            return false;
        }
        Member member = register(session, userId, user.userId());
        gameResults.ifPresent(service -> service.connected(session.getId(), user.userId(), delivery -> {
            if (delivery.errorCode() != null) {
                member.peer().offer(protocol.error(delivery.requestId(), delivery.errorCode(),
                        "경기 결과를 확인할 수 없습니다."));
            } else {
                member.peer().offer(protocol.encode(delivery.requestId(), "GAME_RESULT", delivery.result()));
            }
        }));
        reconnect.ifPresent(service -> service.connected(user.userId(), session.getId(),
                (requestId, view) -> member.peer().offer(protocol.encode(requestId, "GAME_CONNECTION_STATE", view))));
        return true;
    }

    private Member register(WebSocketSession session, String userId, Long accountId) {
        TablePeer peer = new TablePeer(session, () -> disconnect(session.getId()),
                new WebSocketHeartbeat(heartbeatInterval, heartbeatTimeout, System::nanoTime), this::textSent);
        Member member = new Member(userId, peer, accountId);
        members.put(session.getId(), member);
        acceptedConnections++;
        peer.offer(protocol.encode(null, "CONNECTED", Map.of("userId", userId)));
        if (startRehearsal) {
            peer.offer(protocol.encode(null, "GAME_START_STATE", TableStartAttempt.View.waiting(null, 0, null)));
        }
        peer.start();
        return member;
    }

    public synchronized void pong(String sessionId, ByteBuffer payload) {
        Member member = members.get(sessionId);
        if (member != null) {
            member.peer().pong(payload);
        }
    }

    private synchronized void checkHeartbeats() {
        if (stopped) {
            return;
        }
        for (var entry : new ArrayList<>(members.entrySet())) {
            if (!entry.getValue().peer().checkHeartbeat()) {
                disconnect(entry.getKey());
            }
        }
    }

    public synchronized TableListResponse listTables() {
        return listTables(null);
    }

    public synchronized TableListResponse listTables(String channelId) {
        if (!channelIds.isEmpty() && (channelId == null || channelId.isBlank())) {
            throw new TableScopeException("CHANNEL_REQUIRED", "조회할 채널을 지정해주세요.");
        }
        if (channelId != null && !channelIds.contains(channelId)) {
            throw new TableScopeException("CHANNEL_NOT_FOUND", "등록되지 않은 채널입니다.");
        }
        return new TableListResponse(rooms.keySet().stream()
                .filter(id -> channelId == null || channelId.equals(tableChannels.get(id)))
                .sorted().map(tableId -> {
            TableRoom.Snapshot snapshot = rooms.get(tableId).snapshot();
            int occupied = (int) snapshot.seats().stream().filter(seat -> seat.userId() != null).count();
            int ready = (int) snapshot.seats().stream()
                    .filter(seat -> seat.userId() != null && seat.ready()).count();
            TableStartAttempt attempt = starts.get(tableId);
            String status = attempt == null || !attempt.frozen() ? "WAITING"
                    : attempt.starting() ? "STARTING" : "REHEARSAL_CONFIRMED";
            int available = snapshot.capacity() - occupied;
            return new TableSummaryResponse(tableId, snapshot.capacity(), snapshot.minimumPlayers(), occupied,
                    available, ready, snapshot.allReady(), status, available > 0 && status.equals("WAITING"),
                    snapshot.gameCode());
        }).toList());
    }

    public synchronized void receive(String sessionId, String text) {
        Member member = members.get(sessionId);
        if (member == null) {
            return;
        }
        receivedMessages++;
        String requestId = null;
        try {
            Request request = protocol.parse(text);
            requestId = request.requestId();
            if (request.type().equals("GAME_RESULT_CHECK")) {
                if (member.accountId() == null) {
                    fail(request, "GAME_RESULT_AUTH_REQUIRED", "인증된 사용자만 결과를 확인할 수 있습니다.");
                }
                if (gameResults.isEmpty()) {
                    fail(request, "GAME_RESULT_NOT_CONFIGURED", "경기 결과 연결이 필요합니다.");
                }
                gameResults.get().check(sessionId, requestId, request.payload().get("gameSessionId").textValue());
                return;
            }
            if (request.type().equals("GAME_UNWATCH")) {
                unwatchGame(sessionId, member, request);
                return;
            }
            if (request.type().equals("GAME_ACTION_SEND")) {
                sendGameAction(sessionId, member, request);
                return;
            }
            if (request.type().equals("GAME_STATE_CHECK")) {
                checkGameState(sessionId, member, request);
                return;
            }
            if (request.type().equals("GAME_RECONNECT_CHECK")) {
                if (member.accountId() == null || reconnect.isEmpty()) {
                    fail(request, "RECOVERY_NOT_AVAILABLE", "인증된 경기 복구 연결이 필요합니다.");
                }
                reconnect.get().refresh(member.accountId(), sessionId, request.requestId(),
                        (id, view) -> member.peer().offer(protocol.encode(id, "GAME_CONNECTION_STATE", view)));
                return;
            }
            if (member.accountId() != null && reconnect.isPresent()
                    && !reconnect.get().canUseLobby(member.accountId(), sessionId)) {
                fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
            }
            switch (request.type()) {
                case "GAME_WATCH" -> watchGame(sessionId, member, request);
                case "CHANNEL_JOIN" -> joinChannel(member, request);
                case "CHANNEL_LEAVE" -> leaveChannel(member, request);
                case "WORLD_MOVE" -> moveWorld(member, request);
                case "WORLD_CHAT_SEND" -> sendChat(member, request);
                case "WORLD_EMOTE_SEND" -> sendEmote(member, request);
                case "TABLE_JOIN" -> join(member, request);
                case "TABLE_WATCH" -> watch(member, request);
                case "TABLE_UNWATCH" -> unwatch(member, request);
                case "READY_SET" -> ready(member, request);
                case "GAME_SELECT" -> selectGame(member, request);
                case "TABLE_LEAVE" -> leave(member, request);
                case "GAME_START_CHECK" -> checkStart(member, request);
                default -> throw new IllegalStateException("검증되지 않은 메시지");
            }
        } catch (WorldEmoteService.EmoteException exception) {
            member.peer().offer(protocol.error(requestId, exception.code(), exception.getMessage()));
        } catch (WorldChatService.ChatException exception) {
            member.peer().offer(protocol.error(requestId, "CHAT_TOO_FREQUENT", exception.getMessage()));
        } catch (WorldChannelRegistry.ChannelException exception) {
            member.peer().offer(protocol.error(requestId, exception.code(), exception.getMessage()));
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        } catch (RuntimeException exception) {
            log.error("테이블 요청 처리 실패 session={}", sessionId, exception);
            member.peer().offer(protocol.error(requestId, "INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다."));
        }
    }

    public synchronized void disconnect(String sessionId) {
        Member member = members.get(sessionId);
        if (member != null) {
            disconnect(sessionId, member.peer().closeReason());
        }
    }

    public synchronized void disconnect(String sessionId, ConnectionCloseReason reason) {
        Member member = members.remove(sessionId);
        if (member == null) {
            return;
        }
        closeMember(member, reason);
        gameResults.ifPresent(service -> service.disconnected(sessionId));
        stateQueries.remove(sessionId);
        statePushes.remove(sessionId);
        actionRequests.remove(sessionId);
        watching.remove(member.userId());
        chat.disconnected(member.userId());
        emotes.disconnected(member.userId());
        WorldChannelRegistry.State channelState = channels.disconnect(member.userId());
        if (channelState != null) {
            publishChannel(channelState, null, null);
            publishWorld(channels.worldState(channelState.channelId()), null, null);
        }
        if (member.accountId() != null) {
            reconnect.ifPresent(service -> service.disconnected(member.accountId(), sessionId));
        }
        String tableId = seating.get(member.userId());
        if (tableId != null) {
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
        heartbeatTimer.shutdownNow();
        members.forEach((sessionId, member) -> {
            closeMember(member, ConnectionCloseReason.SERVER_SHUTDOWN);
            gameResults.ifPresent(service -> service.disconnected(sessionId));
        });
        members.clear();
        channels.clear();
        chat.clear();
        emotes.clear();
        seating.clear();
        watching.clear();
        stateQueries.clear();
        statePushes.clear();
        stateLoads.clear();
        actionRequests.clear();
        starts.clear();
        startWorkers.shutdownNow();
    }

    private void closeMember(Member member, ConnectionCloseReason reason) {
        member.peer().stop(reason);
        closedConnections++;
        closedByReason.get(member.peer().closeReason()).increment();
    }

    public long closedConnections(ConnectionCloseReason reason) {
        return closedByReason.get(reason).sum();
    }

    // 식별자·본문 없이 현재 수명 상태만 읽는다. 네트워크 I/O나 외부 조회는 하지 않는다.
    public synchronized MetricsSnapshot metricsSnapshot() {
        return new MetricsSnapshot(members.size(), acceptedConnections, closedConnections, receivedMessages);
    }

    public record MetricsSnapshot(long activeConnections, long acceptedConnections,
            long closedConnections, long receivedMessages) {
    }

    // 송신자에서 호출한다. Hub 상태 잠금을 잡거나 식별자·본문을 보관하지 않는다.
    private void textSent(long bytes) {
        sentMessages.increment();
        sentBytes.add(bytes);
    }

    public TransmissionSnapshot transmissionSnapshot() {
        return new TransmissionSnapshot(sentMessages.sum(), sentBytes.sum());
    }

    public record TransmissionSnapshot(long messages, long bytes) {
    }

    private void join(Member member, Request request) {
        String tableId = request.payload().get("tableId").textValue();
        TableRoom room = rooms.get(tableId);
        if (room == null) {
            fail(request, "TABLE_NOT_FOUND", "등록되지 않은 테이블입니다.");
        }
        if (!channelIds.isEmpty()) {
            String channelId = channels.channelOf(member.userId());
            if (channelId == null) {
                fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
            }
            if (!channelId.equals(tableChannels.get(tableId))) {
                fail(request, "TABLE_CHANNEL_MISMATCH", "현재 채널의 테이블만 이용할 수 있습니다.");
            }
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
        clearWatch(member, null);
        publish(room, member, request.requestId());
        replyStartState(member, tableId, null);
    }

    private void joinChannel(Member member, Request request) {
        String channelId = request.payload().get("channelId").textValue();
        if (seating.containsKey(member.userId()) && !channels.isInChannel(member.userId(), channelId)) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        WorldChannelRegistry.Change change = channels.join(member.userId(), channelId);
        if (change.changed()) {
            publishChannel(change.state(), member, request.requestId());
            publishWorld(channels.worldState(channelId), null, null);
        } else {
            member.peer().offer(protocol.encode(request.requestId(), "CHANNEL_STATE", change.state()));
            member.peer().offer(protocol.encode(null, "WORLD_STATE", channels.worldState(channelId)));
        }
    }

    private void leaveChannel(Member member, Request request) {
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        WorldChannelRegistry.State state = channels.leave(member.userId());
        clearWatch(member, null);
        member.peer().offer(protocol.encode(request.requestId(), "CHANNEL_LEFT",
                Map.of("channelId", state.channelId())));
        publishChannel(state, null, null);
        publishWorld(channels.worldState(state.channelId()), null, null);
    }

    private void moveWorld(Member member, Request request) {
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        var payload = request.payload();
        var position = new WorldChannelRegistry.Position(payload.get("sequence").longValue(),
                payload.get("x").doubleValue(), payload.get("y").doubleValue(),
                payload.get("z").doubleValue(), payload.get("yaw").doubleValue());
        WorldChannelRegistry.WorldChange change = channels.move(member.userId(), position);
        if (change.changed()) {
            publishWorld(change.state(), member, request.requestId());
        } else {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
        }
    }

    private void sendChat(Member member, Request request) {
        String channelId = channels.channelOf(member.userId());
        if (channelId == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        WorldChatService.Message message = chat.create(channelId, member.userId(),
                new ChatText(request.payload().get("text").textValue()));
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_CHAT_MESSAGE", message));
        String notice = protocol.encode(null, "WORLD_CHAT_MESSAGE", message);
        for (Member target : members.values()) {
            if (target != member && channelId.equals(channels.channelOf(target.userId()))) {
                target.peer().offer(notice);
            }
        }
    }

    private void sendEmote(Member member, Request request) {
        String channelId = channels.channelOf(member.userId());
        if (channelId == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        WorldEmoteService.Event event = emotes.create(channelId, member.userId(),
                new EmoteCode(request.payload().get("emoteCode").textValue()));
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_EMOTE_EVENT", event));
        String notification = protocol.encode(null, "WORLD_EMOTE_EVENT", event);
        for (Member target : members.values()) {
            if (target != member && channelId.equals(channels.channelOf(target.userId()))) {
                target.peer().offer(notification);
            }
        }
    }

    private void publishWorld(WorldChannelRegistry.WorldState state, Member actor, String requestId) {
        Set<String> recipients = state.avatars().stream().map(WorldChannelRegistry.Avatar::userId)
                .collect(Collectors.toSet());
        for (Member target : members.values()) {
            if (recipients.contains(target.userId())) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "WORLD_STATE", state));
            }
        }
    }

    private void publishChannel(WorldChannelRegistry.State state, Member actor, String requestId) {
        for (Member target : members.values()) {
            if (state.userIds().contains(target.userId())) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "CHANNEL_STATE", state));
            }
        }
    }

    private void ready(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request);
        if (request.payload().get("ready").booleanValue() && room.snapshot().gameCode() == null) {
            fail(request, "GAME_NOT_SELECTED", "먼저 게임을 선택해주세요.");
        }
        if (room.setReady(member.userId(), request.payload().get("ready").booleanValue())) {
            publish(room, member, request.requestId());
            beginStartIfReady(room);
        } else {
            replyState(member, request, room);
        }
    }

    private void selectGame(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        String tableId = room.snapshot().tableId();
        ensureWaiting(tableId, request);
        if (!room.isSelector(member.userId())) {
            fail(request, "NOT_GAME_SELECTOR", "먼저 착석한 참가자만 게임을 선택할 수 있습니다.");
        }
        TableGame game = TableGame.find(request.payload().get("gameCode").textValue());
        if (game == null) {
            fail(request, "UNSUPPORTED_GAME", "지원하지 않는 게임입니다.");
        }
        long occupied = room.snapshot().seats().stream().filter(seat -> seat.userId() != null).count();
        if (occupied > game.maximumPlayers()) {
            fail(request, "GAME_PLAYER_LIMIT", "참가자가 선택한 게임의 최대 인원보다 많습니다.");
        }
        if (room.selectGame(game)) {
            starts.remove(tableId);
            publish(room, member, request.requestId());
            publishStart(tableId);
        } else {
            replyState(member, request, room);
        }
    }

    private void leave(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request);
        String tableId = seating.remove(member.userId());
        room.leave(member.userId());
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

    private void watch(Member member, Request request) {
        String tableId = request.payload().get("tableId").textValue();
        TableRoom room = rooms.get(tableId);
        if (room == null) {
            fail(request, "TABLE_NOT_FOUND", "등록되지 않은 테이블입니다.");
        }
        if (!channelIds.isEmpty()) {
            String channelId = channels.channelOf(member.userId());
            if (channelId == null) {
                fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
            }
            if (!channelId.equals(tableChannels.get(tableId))) {
                fail(request, "TABLE_CHANNEL_MISMATCH", "현재 채널의 테이블만 볼 수 있습니다.");
            }
        }
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        String current = watching.get(member.userId());
        if (current != null && !current.equals(tableId)) {
            fail(request, "ALREADY_WATCHING", "기존 테이블 보기부터 종료해주세요.");
        }
        watching.put(member.userId(), tableId);
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_WATCH_STATE", room.snapshot()));
    }

    private void unwatch(Member member, Request request) {
        if (!watching.containsKey(member.userId())) {
            fail(request, "NOT_WATCHING", "현재 보고 있는 테이블이 없습니다.");
        }
        clearWatch(member, request.requestId());
    }

    private void clearWatch(Member member, String requestId) {
        String tableId = watching.remove(member.userId());
        if (tableId != null) {
            member.peer().offer(protocol.encode(requestId, "TABLE_WATCH_LEFT", Map.of("tableId", tableId)));
        }
    }

    private void publish(TableRoom room, Member actor, String requestId) {
        TableRoom.Snapshot snapshot = room.snapshot();
        for (Member target : members.values()) {
            if (snapshot.tableId().equals(seating.get(target.userId()))) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "TABLE_STATE", snapshot));
            } else if (snapshot.tableId().equals(watching.get(target.userId()))) {
                target.peer().offer(protocol.encode(null, "TABLE_WATCH_STATE", snapshot));
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
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), snapshot.tableId(), snapshot.version(),
                snapshot.gameCode(), snapshot.seats().stream()
                        .filter(seat -> seat.userId() != null)
                        .map(seat -> new Participant(seat.userId(), seat.seatNumber())).toList());
        TableStartAttempt attempt = new TableStartAttempt(command);
        starts.put(snapshot.tableId(), attempt);
        publishStart(snapshot.tableId());
        startWorkers.execute(() -> dispatchStart(snapshot.tableId(), attempt));
    }

    private void dispatchStart(String tableId, TableStartAttempt attempt) {
        synchronized (this) {
            if (stopped || starts.get(tableId) != attempt || !attempt.starting()) {
                return;
            }
            Set<String> connected = connectedUsers();
            if (!attempt.command().participants().stream().allMatch(player -> connected.contains(player.userId()))) {
                applyStartResult(tableId, attempt,
                        GameStartResult.rejected(attempt.command().startAttemptId(), "PARTICIPANT_LEFT"));
                return;
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
        String gameCode = tableId == null ? null : rooms.get(tableId).snapshot().gameCode();
        TableStartAttempt.View view = attempt == null || gameCode == null
                ? TableStartAttempt.View.waiting(tableId, revision, gameCode)
                : attempt.view(revision);
        target.peer().offer(protocol.encode(requestId, "GAME_START_STATE", view));
    }

    private void checkGameState(String sessionId, Member member, Request request) {
        if (member.accountId() == null) {
            fail(request, "GAME_STATE_AUTH_REQUIRED", "인증된 사용자만 경기 상태를 조회할 수 있습니다.");
        }
        if (gameStates.isEmpty()) {
            fail(request, "GAME_STATE_NOT_CONFIGURED", "경기 상태 연결이 준비되지 않았습니다.");
        }
        if (!stateQueries.add(sessionId)) {
            fail(request, "GAME_STATE_PENDING", "이전 경기 상태 조회가 진행 중입니다.");
        }
        String gameId = request.payload().get("gameId").textValue();
        // 경기 담당의 조회는 Hub 잠금 밖에서 실행한다. 응답은 이 연결에만 전달한다.
        startWorkers.execute(() -> {
            GameStateView view = null;
            String error = null;
            try {
                view = gameStates.orElseThrow().load(member.accountId(), gameId).orElse(null);
                if (view == null) {
                    error = "GAME_STATE_ACCESS_DENIED";
                } else if (view.userId() != member.accountId() || !view.gameId().equals(gameId)) {
                    view = null;
                    error = "GAME_STATE_INVALID";
                }
            } catch (RuntimeException exception) {
                // 외부 구현의 예외에 손패 등이 포함될 수 있으므로 내용은 전송·기록하지 않는다.
                error = "GAME_STATE_UNAVAILABLE";
            }
            finishGameState(sessionId, member, request.requestId(), view, error);
        });
    }

    private synchronized void finishGameState(String sessionId, Member member, String requestId,
            GameStateView view, String error) {
        if (stopped || members.get(sessionId) != member) {
            return;
        }
        stateQueries.remove(sessionId);
        if (error == null && view.role() == GameStateView.Role.PLAYER
                && (reconnect.isEmpty()
                        || !reconnect.get().canControlGame(member.accountId(), sessionId, view.gameId()))) {
            error = "GAME_RECOVERY_REQUIRED";
        }
        if (error != null) {
            member.peer().offer(protocol.error(requestId, error, "경기 상태를 가져올 수 없습니다."));
        } else {
            StatePush push = statePushes.get(sessionId);
            if (push != null && push.gameId.equals(view.gameId()) && push.role == view.role()) {
                if (view.version() < push.deliveredVersion) {
                    member.peer().offer(protocol.error(requestId, "GAME_STATE_STALE", "최신 경기 상태를 확인해주세요."));
                    return;
                }
                push.deliveredVersion = Math.max(push.deliveredVersion, view.version());
            } else if (view.role() == GameStateView.Role.PLAYER) {
                closePendingWatch(push, "GAME_RECOVERY_REQUIRED");
                push = new StatePush(member, view.gameId());
                push.deliveredVersion = view.version();
                statePushes.put(sessionId, push);
            }
            member.peer().offer(protocol.encode(requestId, "GAME_STATE", view));
        }
    }

    private void watchGame(String sessionId, Member member, Request request) {
        if (member.accountId() == null) {
            fail(request, "GAME_STATE_AUTH_REQUIRED", "인증된 사용자만 경기 관전을 요청할 수 있습니다.");
        }
        if (gameStates.isEmpty()) {
            fail(request, "GAME_STATE_NOT_CONFIGURED", "경기 상태 연결이 준비되지 않았습니다.");
        }
        StatePush previous = statePushes.get(sessionId);
        if (previous != null && previous.role == GameStateView.Role.SPECTATOR) {
            fail(request, "GAME_ALREADY_WATCHING", "현재 경기 관전을 먼저 종료해주세요.");
        }
        StatePush push = new StatePush(member, request.payload().get("gameId").textValue(),
                GameStateView.Role.SPECTATOR, request.requestId());
        push.requestedVersion = 0;
        statePushes.put(sessionId, push);
        loadStatePush(sessionId, push);
    }

    private void unwatchGame(String sessionId, Member member, Request request) {
        StatePush push = statePushes.get(sessionId);
        if (push == null || push.role != GameStateView.Role.SPECTATOR) {
            fail(request, "GAME_NOT_WATCHING", "관전 중인 경기가 없습니다.");
        }
        statePushes.remove(sessionId);
        if (push.initialRequestId != null) {
            closePendingWatch(push, "GAME_WATCH_CANCELLED");
        }
        member.peer().offer(protocol.encode(request.requestId(), "GAME_WATCH_LEFT", Map.of("gameId", push.gameId)));
    }

    private void closePendingWatch(StatePush push, String code) {
        if (push != null && push.role == GameStateView.Role.SPECTATOR) {
            if (push.initialRequestId != null) {
                push.member.peer().offer(protocol.error(push.initialRequestId, code, "경기 관전 요청이 종료되었습니다."));
            } else {
                push.member.peer().offer(protocol.encode(null, "GAME_WATCH_LEFT", Map.of("gameId", push.gameId)));
            }
        }
    }

    @EventListener
    public synchronized void gameStateChanged(GameStateChanged change) {
        if (stopped || gameStates.isEmpty()) {
            return;
        }
        for (var entry : members.entrySet()) {
            String sessionId = entry.getKey();
            Member member = entry.getValue();
            if (member.accountId() == null) {
                continue;
            }
            StatePush push = statePushes.get(sessionId);
            if (canSendGameAction(sessionId, member, change.gameId())) {
                if (push == null || !push.gameId.equals(change.gameId()) || push.role != GameStateView.Role.PLAYER) {
                    closePendingWatch(push, "GAME_RECOVERY_REQUIRED");
                    push = new StatePush(member, change.gameId());
                    statePushes.put(sessionId, push);
                }
            } else if (push == null || push.role != GameStateView.Role.SPECTATOR
                    || !push.gameId.equals(change.gameId())) {
                continue;
            } else if (!canReceiveStatePush(sessionId, push)) {
                statePushes.remove(sessionId);
                closePendingWatch(push, "GAME_RECOVERY_REQUIRED");
                continue;
            }
            push.requestedVersion = Math.max(push.requestedVersion, change.version());
            // 같은 버전 알림도 관전 권한 회수일 수 있다. 조회 중 알림은 세대로 구분한다.
            if (push.role == GameStateView.Role.SPECTATOR) {
                push.watchRevision++;
            }
            if (!push.running && (push.role == GameStateView.Role.SPECTATOR
                    || push.requestedVersion > push.deliveredVersion)) {
                loadStatePush(sessionId, push);
            }
        }
    }

    // 같은 연결의 변경 알림은 최신 버전으로 합친다. 느린 사용자 조회는 다른 사용자를 막지 않는다.
    private void loadStatePush(String sessionId, StatePush push) {
        if (!stateLoads.add(sessionId)) {
            return;
        }
        push.running = true;
        long requestedVersion = push.requestedVersion;
        long watchRevision = push.watchRevision;
        startWorkers.execute(() -> {
            GameStateView view = null;
            String error = null;
            try {
                if (!canReceiveStatePush(sessionId, push)) {
                    error = "GAME_RECOVERY_REQUIRED";
                } else {
                    view = gameStates.orElseThrow().load(push.member.accountId(), push.gameId).orElse(null);
                    if (view == null) {
                        error = "GAME_STATE_ACCESS_DENIED";
                    } else if (view.userId() != push.member.accountId() || !view.gameId().equals(push.gameId)
                            || view.role() != push.role) {
                        error = "GAME_STATE_INVALID";
                    }
                }
            } catch (RuntimeException exception) {
                // 사용자별 비공개 상태나 엔진 예외 내용은 방송·기록하지 않는다.
                error = "GAME_STATE_UNAVAILABLE";
            }
            finishStatePush(sessionId, push, requestedVersion, watchRevision, view, error);
        });
    }

    private synchronized void finishStatePush(String sessionId, StatePush push, long requestedVersion,
            long watchRevision, GameStateView view, String error) {
        stateLoads.remove(sessionId);
        if (stopped || members.get(sessionId) != push.member || statePushes.get(sessionId) != push) {
            StatePush next = statePushes.get(sessionId);
            if (!stopped && next != null && !next.running) {
                if (!canReceiveStatePush(sessionId, next)) {
                    statePushes.remove(sessionId);
                    closePendingWatch(next, "GAME_RECOVERY_REQUIRED");
                } else if (next.role == GameStateView.Role.SPECTATOR
                        || next.requestedVersion > next.deliveredVersion) {
                    loadStatePush(sessionId, next);
                }
            }
            return;
        }
        push.running = false;
        if (!canReceiveStatePush(sessionId, push)) {
            statePushes.remove(sessionId);
            closePendingWatch(push, "GAME_RECOVERY_REQUIRED");
            return;
        }
        if (push.role == GameStateView.Role.SPECTATOR && push.watchRevision != watchRevision) {
            loadStatePush(sessionId, push);
            return;
        }
        if (push.requestedVersion > requestedVersion && (error != null || view.version() < push.requestedVersion)) {
            loadStatePush(sessionId, push);
            return;
        }
        if (error == null && (view.version() < push.requestedVersion
                || (push.initialRequestId != null && view.version() < push.deliveredVersion))) {
            error = "GAME_STATE_STALE";
        }
        if (error != null) {
            push.member.peer().offer(protocol.error(push.initialRequestId, error, "경기 상태를 가져올 수 없습니다."));
            if (push.role == GameStateView.Role.SPECTATOR) {
                statePushes.remove(sessionId);
            }
        } else if (view.version() > push.deliveredVersion || push.initialRequestId != null) {
            push.deliveredVersion = view.version();
            push.member.peer().offer(protocol.encode(push.initialRequestId, "GAME_STATE", view));
            push.initialRequestId = null;
        }
    }

    private synchronized boolean canReceiveStatePush(String sessionId, StatePush push) {
        if (stopped || members.get(sessionId) != push.member || statePushes.get(sessionId) != push) {
            return false;
        }
        if (push.role == GameStateView.Role.PLAYER) {
            return canSendGameAction(sessionId, push.member, push.gameId);
        }
        return reconnect.isEmpty() || reconnect.get().canUseLobby(push.member.accountId(), sessionId);
    }

    private void sendGameAction(String sessionId, Member member, Request request) {
        if (member.accountId() == null) {
            fail(request, "GAME_ACTION_AUTH_REQUIRED", "인증된 사용자만 경기 입력을 보낼 수 있습니다.");
        }
        if (gameActions.isEmpty()) {
            fail(request, "GAME_ACTION_NOT_CONFIGURED", "경기 입력 연결이 준비되지 않았습니다.");
        }
        String gameId = request.payload().get("gameId").textValue();
        if (!canSendGameAction(sessionId, member, gameId)) {
            fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
        }
        if (!actionRequests.add(sessionId)) {
            fail(request, "GAME_ACTION_PENDING", "이전 경기 입력이 처리 중입니다.");
        }
        GameActionCommand command = new GameActionCommand(member.accountId(), gameId,
                request.payload().get("actionId").textValue(), request.payload().get("expectedVersion").longValue(),
                request.payload().get("input"));
        startWorkers.execute(() -> {
            GameActionResult result = null;
            String error = null;
            try {
                if (!canSendGameAction(sessionId, member, gameId)) {
                    error = "GAME_RECOVERY_REQUIRED";
                } else {
                    result = gameActions.orElseThrow().apply(command);
                    if (result == null || result.userId() != command.userId()
                            || !result.gameId().equals(gameId) || !result.actionId().equals(command.actionId())
                            || result.version() < command.expectedVersion()) {
                        error = "GAME_ACTION_INVALID";
                    }
                }
            } catch (GameActionGateway.Rejected rejected) {
                error = "GAME_ACTION_" + rejected.reason().name();
            } catch (RuntimeException exception) {
                // 예외에는 게임 입력·비공개 상태가 있을 수 있다. 전송하거나 기록하지 않는다.
                error = "GAME_ACTION_UNAVAILABLE";
            }
            finishGameAction(sessionId, member, request.requestId(), result, error);
            if (error == null) {
                // 입력자 연결이 끊겨도 확정된 변경은 남은 참가자에게 전달한다.
                gameStateChanged(new GameStateChanged(result.gameId(), result.version()));
            }
        });
    }

    private synchronized boolean canSendGameAction(String sessionId, Member member, String gameId) {
        return !stopped && members.get(sessionId) == member && reconnect.isPresent()
                && reconnect.get().canControlGame(member.accountId(), sessionId, gameId);
    }

    private synchronized void finishGameAction(String sessionId, Member member, String requestId,
            GameActionResult result, String error) {
        if (stopped || members.get(sessionId) != member) {
            return;
        }
        actionRequests.remove(sessionId);
        if (error != null) {
            member.peer().offer(protocol.error(requestId, error, "경기 입력을 처리할 수 없습니다."));
        } else {
            member.peer().offer(protocol.encode(requestId, "GAME_ACTION_RESULT", Map.of(
                    "gameId", result.gameId(), "actionId", result.actionId(), "version", result.version())));
        }
    }

    private record Member(String userId, TablePeer peer, Long accountId) {
    }

    private static final class StatePush {
        private final Member member;
        private final String gameId;
        private final GameStateView.Role role;
        private String initialRequestId;
        private long requestedVersion = -1;
        private long deliveredVersion = -1;
        private boolean running;
        private long watchRevision;

        private StatePush(Member member, String gameId) {
            this(member, gameId, GameStateView.Role.PLAYER, null);
        }

        private StatePush(Member member, String gameId, GameStateView.Role role, String initialRequestId) {
            this.member = member;
            this.gameId = gameId;
            this.role = role;
            this.initialRequestId = initialRequestId;
        }
    }

    public static final class TableScopeException extends RuntimeException {

        private final String code;

        private TableScopeException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
