package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.PositionSampler;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartCommand.Participant;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.CommittedGameStartService;
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
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.domain.ChatText;
import com.ssafy.ontop.world.domain.EmoteCode;
import com.ssafy.ontop.world.service.WorldAppearanceGateway;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import com.ssafy.ontop.world.service.WorldFacilityService;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import com.ssafy.ontop.world.service.WorldProximity;
import jakarta.annotation.PreDestroy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
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
import java.util.function.UnaryOperator;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class TableHub {

    private static final Logger log = LoggerFactory.getLogger(TableHub.class);

    private final TableProtocol protocol;
    private final Map<String, TableRoom> rooms = new HashMap<>();
    private final Map<String, String> tableChannels = new HashMap<>();
    private final Set<String> channelIds;
    private final Map<String, Member> members = new HashMap<>();
    private final Map<String, AppearancePush> appearancePushes = new HashMap<>();
    private Optional<WorldAppearanceGateway> appearances = Optional.empty();
    private Optional<WorldProfileGateway> profiles = Optional.empty();
    private final Map<Member, ProfileTarget> profileMemberships = new HashMap<>();
    private boolean profilesLoading;
    private boolean profilesRequested;
    private final Map<String, String> seating = new HashMap<>();
    private final Map<String, String> watching = new HashMap<>();
    private final Map<String, TableStartAttempt> starts = new HashMap<>();
    private final Map<String, Long> startRevisions = new HashMap<>();
    private final Optional<GameStartGateway> gateway;
    private final boolean startRehearsal;
    private Optional<CommittedGameStartService> committedStarts = Optional.empty();
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
    private final WorldProximity proximity;
    private final WorldFacilityService facilities = new WorldFacilityService();
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
    private BehaviorLog behaviorLog = BehaviorLog.disabled();
    private final PositionSampler positionSampler = new PositionSampler(Duration.ofSeconds(1));

    @org.springframework.beans.factory.annotation.Autowired
    public void configureCommittedStarts(Optional<CommittedGameStartService> service) {
        committedStarts = service;
        if (service.isPresent()) { protocol.enableStartQueries(); }
    }

    /** 행동 로그(docs/behavior-log.md). 직접 생성한 Hub는 기록하지 않는다. */
    @Autowired
    public void configureBehaviorLog(BehaviorLog behaviorLog) {
        this.behaviorLog = behaviorLog;
    }

    // 성공 처리 뒤에만 호출한다. 큐에 넣기만 하고 실패해도 예외를 던지지 않아 Hub 처리에 영향이 없다.
    private void recordBehavior(BehaviorEventType type, Long accountId, UnaryOperator<BehaviorEvent.Builder> details) {
        behaviorLog.record(() -> details.apply(BehaviorEvent.builder(type, Instant.now()).userId(accountId)).build());
    }

    // 물리 계산이 끝난 위치를 큐에 넣기만 한다. DB 접근·대기가 없어 tick을 막지 않는다. 착석 중에는 남기지 않는다.
    private void recordPositions(WorldChannelRegistry.WorldState state, Set<String> onlyUsers) {
        long now = System.nanoTime();
        for (WorldChannelRegistry.Avatar avatar : state.avatars()) {
            String userId = avatar.userId();
            WorldChannelRegistry.Position position = avatar.position();
            if ((onlyUsers != null && !onlyUsers.contains(userId)) || seating.containsKey(userId)
                    || !positionSampler.shouldSample(userId, position.moving(), now)) {
                continue;
            }
            behaviorLog.recordPosition(() -> new PositionSample(accountIdOf(userId), state.channelId(), Instant.now(),
                    position.x(), position.y(), position.z(), position.moving(), position.running(),
                    position.swimming(), state.mapVersion()));
        }
    }

    // 인증 연결의 userId는 회원 번호다. local 개발 사용자(dev-…)는 회원이 아니므로 null로 남긴다.
    private static Long accountIdOf(String userId) {
        return !userId.isEmpty() && userId.chars().allMatch(Character::isDigit) ? Long.valueOf(userId) : null;
    }

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

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                emotes, gameStates, gameActions, gameResults,
                new WorldProximity(channels, new WorldProximityProperties(null, null, null)));
    }

    @Autowired
    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity) {
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
        this.proximity = proximity;
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
        heartbeatTimer.scheduleWithFixedDelay(this::advanceWorld, 33, 33, TimeUnit.MILLISECONDS);
        heartbeatTimer.scheduleWithFixedDelay(this::pollProfiles, 5, 5, TimeUnit.SECONDS);
    }

    public synchronized void connect(WebSocketSession session) {
        String userId = "dev-" + UUID.randomUUID();
        register(session, userId, null);
    }

    public synchronized boolean connectAuthenticated(WebSocketSession session, VerifiedWebSocketUser user) {
        String userId = Long.toString(user.userId());
        // 사용자 확정: 기존 연결이 살아 있으면 새 연결만 거절한다.
        boolean reservedStart = committedStarts.isPresent() && seating.containsKey(userId)
                && starts.containsKey(seating.get(userId)) && starts.get(seating.get(userId)).frozen();
        if (seating.containsKey(userId) && !reservedStart
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
        reconnect.ifPresent(service -> service.connected(user.userId(), session.getId(), user.sessionId(),
                (requestId, view) -> member.peer().offer(protocol.encode(requestId, "GAME_CONNECTION_STATE", view))));
        if (reservedStart) { replyStartState(member, seating.get(userId), null); }
        return true;
    }

    private Member register(WebSocketSession session, String userId, Long accountId) {
        TablePeer peer = new TablePeer(session, () -> disconnect(session.getId()),
                new WebSocketHeartbeat(heartbeatInterval, heartbeatTimeout, System::nanoTime), this::textSent);
        Member member = new Member(userId, peer, accountId);
        members.put(session.getId(), member);
        acceptedConnections++;
        peer.offer(protocol.encode(null, "CONNECTED", Map.of("userId", userId)));
        if (startRehearsal || committedStarts.isPresent()) {
            peer.offer(protocol.encode(null, "GAME_START_STATE", TableStartAttempt.View.waiting(null, 0, null,
                    committedStarts.isEmpty())));
        }
        peer.start();
        recordBehavior(BehaviorEventType.WS_CONNECTED, accountId, builder -> builder);
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
                    : attempt.starting() ? "STARTING" : committedStarts.isPresent() ? attempt.phase() : "REHEARSAL_CONFIRMED";
            int available = snapshot.capacity() - occupied;
            return new TableSummaryResponse(tableId, snapshot.capacity(), snapshot.minimumPlayers(), occupied,
                    available, ready, snapshot.allReady(), status, available > 0 && status.equals("WAITING"),
                    snapshot.gameCode(), snapshot.targetScore(), publicGameId(tableId));
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
            if (request.type().equals("GAME_START_CHECK")) {
                checkStart(member, request);
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
                case "WORLD_FACILITY_CATALOG", "WORLD_FACILITY_CHECK", "WORLD_FACILITY_USE",
                        "WORLD_FACILITY_RELEASE", "WORLD_FACILITY_AIM" -> facility(member, request);
                case "TABLE_JOIN" -> join(member, request);
                case "TABLE_WATCH" -> watch(member, request);
                case "TABLE_UNWATCH" -> unwatch(member, request);
                case "READY_SET" -> ready(member, request);
                case "GAME_SELECT" -> selectGame(member, request);
                case "TABLE_LEAVE" -> leave(member, request);
                case "GAME_START_CHECK" -> checkStart(member, request);
                default -> throw new IllegalStateException("검증되지 않은 메시지");
            }
        } catch (WorldFacilityService.FacilityException exception) {
            member.peer().offer(protocol.error(requestId, exception.code(), exception.getMessage()));
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
        recordBehavior(BehaviorEventType.WS_DISCONNECTED, member.accountId(),
                builder -> builder.prop("reason", member.peer().closeReason().name()));
        gameResults.ifPresent(service -> service.disconnected(sessionId));
        stateQueries.remove(sessionId);
        statePushes.remove(sessionId);
        actionRequests.remove(sessionId);
        watching.remove(member.userId());
        chat.disconnected(member.userId());
        emotes.disconnected(member.userId());
        appearancePushes.remove(member.userId());
        profileMemberships.remove(member);
        positionSampler.forget(member.userId());
        String facilityChannel = channels.channelOf(member.userId());
        boolean wasUsingFacility = facilities.current(member.userId()) != null;
        facilities.disconnected(member.userId());
        WorldChannelRegistry.State channelState = channels.disconnect(member.userId());
        if (wasUsingFacility) {
            publishFacilities(facilityChannel, null, null);
        }
        if (channelState != null) {
            publishChannel(channelState, null, null);
            publishWorld(channels.worldState(channelState.channelId()), null, null);
            recordBehavior(BehaviorEventType.CHANNEL_LEFT, member.accountId(),
                    builder -> builder.channelId(channelState.channelId()).prop("byDisconnect", true));
        }
        if (member.accountId() != null) {
            var departureReason = switch (reason) {
                case LOGOUT -> com.ssafy.ontop.game.result.GameDepartureReason.LOGOUT;
                case MEMBER_DEACTIVATED -> com.ssafy.ontop.game.result.GameDepartureReason.MEMBER_DEACTIVATED;
                default -> com.ssafy.ontop.game.result.GameDepartureReason.DISCONNECT_TIMEOUT;
            };
            boolean authenticationClosed = reason == ConnectionCloseReason.LOGOUT
                    || reason == ConnectionCloseReason.MEMBER_DEACTIVATED
                    || reason == ConnectionCloseReason.AUTH_SESSION_REVOKED;
            reconnect.ifPresent(service -> service.disconnected(member.accountId(), sessionId,
                    departureReason, authenticationClosed));
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
            recordBehavior(BehaviorEventType.TABLE_LEFT, member.accountId(), builder -> builder.tableId(tableId)
                    .channelId(tableChannels.get(tableId)).prop("byDisconnect", true));
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        appearancePushes.clear();
        profileMemberships.clear();
        stopped = true;
        heartbeatTimer.shutdownNow();
        members.forEach((sessionId, member) -> {
            closeMember(member, ConnectionCloseReason.SERVER_SHUTDOWN);
            gameResults.ifPresent(service -> service.disconnected(sessionId));
        });
        members.clear();
        channels.clear();
        facilities.clear();
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
        if (facilities.current(member.userId()) != null) {
            fail(request, "FACILITY_BUSY", "먼저 시설 이용을 종료해주세요.");
        }
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
        channels.stopMovement(member.userId());
        clearWatch(member, null);
        clearGameWatch(member);
        publish(room, member, request.requestId());
        replyStartState(member, tableId, null);
        recordBehavior(BehaviorEventType.TABLE_JOINED, member.accountId(),
                builder -> builder.tableId(tableId).channelId(tableChannels.get(tableId)));
    }

    private void joinChannel(Member member, Request request) {
        String channelId = request.payload().get("channelId").textValue();
        if (seating.containsKey(member.userId()) && !channels.isInChannel(member.userId(), channelId)) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        WorldChannelRegistry.Change change = channels.join(member.userId(), channelId);
        if (change.changed()) {
            publishChannel(change.state(), member, request.requestId());
            WorldChannelRegistry.WorldState world = channels.worldState(channelId);
            publishWorld(world, null, null);
            recordBehavior(BehaviorEventType.CHANNEL_JOINED, member.accountId(),
                    builder -> builder.channelId(channelId).prop("currentUsers", change.state().currentUsers()));
            positionSampler.forget(member.userId());
            recordPositions(world, Set.of(member.userId()));
        } else {
            member.peer().offer(protocol.encode(request.requestId(), "CHANNEL_STATE", change.state()));
            member.peer().offer(protocol.encode(null, "WORLD_STATE", channels.worldState(channelId)));
        }
        refreshAppearance(member);
        if (change.changed() || !profileMemberships.containsKey(member)) {
            profileMemberships.put(member, new ProfileTarget(member, channelId));
        }
        refreshProfiles();
    }

    @Autowired
    public void profileGateway(Optional<WorldProfileGateway> gateway) {
        profiles = gateway;
    }

    private synchronized void pollProfiles() {
        // 느린 조회 중 정기 확인만 반복됐을 때 결과를 계속 무효화하지 않는다.
        if (!profilesLoading) {
            refreshProfiles();
        }
    }

    /** 인증/회원 코드를 수정하지 않고 입장 및 주기 조회로 공개 정보 변경을 반영한다. */
    public synchronized void refreshProfiles() {
        if (stopped || profiles.isEmpty()) {
            return;
        }
        profilesRequested = true;
        if (!profilesLoading) {
            profilesLoading = true;
            startWorkers.execute(this::loadProfiles);
        }
    }

    private void loadProfiles() {
        while (true) {
            java.util.List<ProfileTarget> targets;
            synchronized (this) {
                if (stopped) {
                    profilesLoading = false;
                    return;
                }
                profilesRequested = false;
                targets = profileMemberships.values().stream()
                        .filter(target -> target.member().accountId() != null).toList();
            }
            Map<Long, WorldProfileGateway.Profile> loaded = Map.of();
            try {
                if (!targets.isEmpty()) {
                    loaded = Map.copyOf(profiles.orElseThrow().profiles(targets.stream()
                            .map(target -> target.member().accountId()).collect(Collectors.toSet())));
                }
            } catch (RuntimeException exception) {
                log.warn("공개 프로필 조회 실패. 기존 표시를 유지하고 다음 주기에 다시 확인합니다.");
            }
            synchronized (this) {
                if (stopped) {
                    profilesLoading = false;
                    return;
                }
                Set<String> changedChannels = new HashSet<>();
                for (ProfileTarget target : targets) {
                    Member member = target.member();
                    var profile = loaded.get(member.accountId());
                    if (profile != null && profileMemberships.get(member) == target
                            && target.channel().equals(channels.channelOf(member.userId()))) {
                        if (channels.profile(member.userId(), profile) != null) {
                            changedChannels.add(target.channel());
                        }
                    }
                }
                for (String channel : changedChannels) {
                    publishWorld(channels.worldState(channel), null, null);
                }
                if (profilesRequested) {
                    continue;
                }
                profilesLoading = false;
                return;
            }
        }
    }

    @Autowired
    public void appearanceGateway(Optional<WorldAppearanceGateway> gateway) {
        appearances = gateway;
    }

    /** 커밋 알림은 갱신 요청만 등록한다. DB 조회는 Hub 잠금 밖의 작업 스레드에서 수행한다. */
    public synchronized void refreshAppearance(long userId) {
        members.values().stream().filter(member -> member.accountId() != null && member.accountId() == userId)
                .findFirst().ifPresent(this::refreshAppearance);
    }

    private void refreshAppearance(Member member) {
        String channel = channels.channelOf(member.userId());
        if (stopped || appearances.isEmpty() || member.accountId() == null || channel == null) { return; }
        AppearancePush push = appearancePushes.get(member.userId());
        if (push == null || push.member != member || !push.channel.equals(channel)) {
            push = new AppearancePush(member, channel);
            appearancePushes.put(member.userId(), push);
        }
        push.requested++;
        if (!push.running) {
            push.running = true;
            AppearancePush pending = push;
            startWorkers.execute(() -> loadAppearance(pending));
        }
    }

    private void loadAppearance(AppearancePush push) {
        while (true) {
            long requested;
            synchronized (this) {
                if (!appearanceCurrent(push)) { return; }
                requested = push.requested;
            }
            java.util.List<WorldAppearanceGateway.Equipment> equipment = null;
            try {
                equipment = appearances.orElseThrow().equipment(push.member.accountId());
            } catch (RuntimeException exception) {
                log.warn("장착 외형 조회 실패. 다음 채널 입장 또는 장착 변경 때 다시 확인합니다.");
            }
            synchronized (this) {
                if (!appearanceCurrent(push)) { return; }
                // 더 최근 커밋 알림을 받았다면 오래된 조회 결과를 보내지 않고 다시 읽는다.
                if (requested != push.requested) { continue; }
                push.running = false;
                if (equipment != null) {
                    try {
                        var state = channels.equipment(push.member.userId(), equipment);
                        if (state != null) { publishWorld(state, null, null); }
                    } catch (RuntimeException exception) {
                        log.warn("장착 외형 상태를 반영하지 못했습니다.");
                    }
                }
                return;
            }
        }
    }

    private boolean appearanceCurrent(AppearancePush push) {
        return !stopped && appearancePushes.get(push.member.userId()) == push
                && members.values().stream().anyMatch(member -> member == push.member)
                && push.channel.equals(channels.channelOf(push.member.userId()));
    }

    private void leaveChannel(Member member, Request request) {
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        boolean wasUsingFacility = facilities.current(member.userId()) != null;
        facilities.release(member.userId());
        WorldChannelRegistry.State state = channels.leave(member.userId());
        if (wasUsingFacility) {
            publishFacilities(state.channelId(), null, null);
        }
        profileMemberships.remove(member);
        appearancePushes.remove(member.userId());
        clearWatch(member, null);
        clearGameWatch(member);
        member.peer().offer(protocol.encode(request.requestId(), "CHANNEL_LEFT",
                Map.of("channelId", state.channelId())));
        publishChannel(state, null, null);
        publishWorld(channels.worldState(state.channelId()), null, null);
        recordBehavior(BehaviorEventType.CHANNEL_LEFT, member.accountId(),
                builder -> builder.channelId(state.channelId()).prop("byDisconnect", false));
        positionSampler.forget(member.userId());
    }

    private synchronized void advanceWorld() {
        if (stopped) {
            return;
        }
        try {
            for (var state : channels.advance(Set.copyOf(seating.keySet()))) {
                publishWorld(state, null, null);
                recordPositions(state, null);
                for (Member member : java.util.List.copyOf(members.values())) {
                    if (channels.isInChannel(member.userId(), state.channelId())) {
                        refreshWatchRange(member);
                    }
                }
            }
        } catch (RuntimeException exception) {
            // Do not silently lose the scheduled simulation after one failed tick.
            org.slf4j.LoggerFactory.getLogger(TableHub.class).error("광장 이동 tick 실패", exception);
        }
    }

    private void moveWorld(Member member, Request request) {
        if (facilities.current(member.userId()) != null) {
            fail(request, "FACILITY_BUSY", "먼저 시설 이용을 종료해주세요.");
        }
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        var payload = request.payload();
        WorldChannelRegistry.WorldChange change = channels.input(member.userId(),
                com.ssafy.ontop.world.movement.MoveInput.parse(payload));
        if (change.changed()) {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
            refreshWatchRange(member);
        } else {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
        }
    }

    private void sendChat(Member member, Request request) {
        String channelId = channels.channelOf(member.userId());
        if (channelId == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        if (!proximity.hasPosition(member.userId())) {
            fail(request, "WORLD_POSITION_REQUIRED", "먼저 광장 위치를 전송해주세요.");
        }
        WorldChatService.Message message = chat.create(channelId, member.userId(),
                new ChatText(request.payload().get("text").textValue()));
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_CHAT_MESSAGE", message));
        String notice = protocol.encode(null, "WORLD_CHAT_MESSAGE", message);
        int recipients = 0;
        for (Member target : members.values()) {
            if (target != member && proximity.canHear(member.userId(), target.userId())) {
                target.peer().offer(notice);
                recipients++;
            }
        }
        // 채팅 본문은 남기지 않고 길이와 받은 사람 수만 남긴다.
        int heard = recipients;
        recordBehavior(BehaviorEventType.CHAT_SENT, member.accountId(), builder -> builder.channelId(channelId)
                .prop("length", message.text().codePointCount(0, message.text().length()))
                .prop("recipients", heard));
    }

    /** REST 소리함 요청에도 클라이언트 좌표 대신 같은 시점의 서버 위치·활동을 사용한다. DB I/O는 하지 않는다. */
    public synchronized void requireFeedbackAccess(long userId, String channelId, double x, double y, double z) {
        String identity = Long.toString(userId);
        var position = channels.positionOf(identity);
        if (!channels.isInChannel(identity, channelId) || position == null) {
            throw new com.ssafy.ontop.feedback.service.FeedbackException(409, "NOT_IN_CHANNEL",
                    "연결된 공원 채널을 확인해주세요.");
        }
        if (seating.containsKey(identity) || facilities.current(identity) != null || position.swimming()) {
            throw new com.ssafy.ontop.feedback.service.FeedbackException(409, "FEEDBACK_ACTIVITY_CONFLICT",
                    "테이블·시설 이용과 수영을 종료해주세요.");
        }
        if (Math.hypot(position.x() - x, position.z() - z) > 2.6 || Math.abs(position.y() - y) > 0.7) {
            throw new com.ssafy.ontop.feedback.service.FeedbackException(403, "FEEDBACK_OUT_OF_RANGE",
                    "소리함 가까이 같은 높이에서 작성해주세요.");
        }
    }

    /** REST 익명 메모함 요청에도 클라이언트 좌표 대신 같은 시점의 서버 위치·활동을 사용한다. DB I/O는 하지 않는다. */
    public synchronized void requireNotesAccess(long userId, String channelId, double x, double y, double z) {
        String identity = Long.toString(userId);
        var position = channels.positionOf(identity);
        if (!channels.isInChannel(identity, channelId) || position == null) {
            throw new com.ssafy.ontop.notes.service.NoteException(409, "NOT_IN_CHANNEL",
                    "연결된 공원 채널을 확인해주세요.");
        }
        if (seating.containsKey(identity) || facilities.current(identity) != null || position.swimming()) {
            throw new com.ssafy.ontop.notes.service.NoteException(409, "NOTES_ACTIVITY_CONFLICT",
                    "테이블·시설 이용과 수영을 종료해주세요.");
        }
        if (Math.hypot(position.x() - x, position.z() - z) > 2.6 || Math.abs(position.y() - y) >= 0.7) {
            throw new com.ssafy.ontop.notes.service.NoteException(403, "NOTES_OUT_OF_RANGE",
                    "익명 메모함 가까이 같은 높이에서 작성해주세요.");
        }
    }

    private void facility(Member member, Request request) {
        String channel = channels.channelOf(member.userId());
        if (channel == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        var payload = request.payload();
        switch (request.type()) {
            case "WORLD_FACILITY_CATALOG" -> {
                var catalog = facilities.catalog();
                int offset = Math.min(payload.path("offset").asInt(0), catalog.facilities().size());
                int end = Math.min(offset + 10, catalog.facilities().size());
                member.peer().offer(protocol.encode(request.requestId(), "WORLD_FACILITY_CATALOG", Map.of(
                        "mapVersion", catalog.mapVersion(), "total", catalog.facilities().size(),
                        "offset", offset, "nextOffset", end < catalog.facilities().size() ? end : -1,
                        "facilities", catalog.facilities().subList(offset, end),
                        "aimIntervalMs", catalog.aimIntervalMs(), "minPitch", catalog.minPitch(),
                        "maxPitch", catalog.maxPitch(), "initialPitch", catalog.initialPitch())));
            }
            case "WORLD_FACILITY_CHECK" -> member.peer().offer(
                    protocol.encode(request.requestId(), "WORLD_FACILITY_STATE", facilities.state(channel)));
            case "WORLD_FACILITY_USE" -> {
                if (seating.containsKey(member.userId())) {
                    fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
                }
                long before = facilities.state(channel).version();
                var lease = facilities.use(member.userId(), channel, request.requestId(),
                        payload.path("facilityId").asText(), payload.path("seatIndex").asInt(),
                        channels.positionOf(member.userId()));
                if (before == facilities.state(channel).version()) {
                    member.peer().offer(protocol.encode(request.requestId(), "WORLD_FACILITY_STATE",
                            facilities.state(channel)));
                    return;
                }
                channels.holdFacility(member.userId(), lease.pose());
                clearWatch(member, null);
                clearGameWatch(member);
                publishFacilities(channel, member, request.requestId());
                publishWorld(channels.worldState(channel), null, null);
            }
            case "WORLD_FACILITY_RELEASE" -> {
                var lease = facilities.requireOwner(member.userId(), payload.path("leaseId").asText());
                var exit = channels.facilityExit(member.userId(), lease);
                if (exit == null) {
                    fail(request, "FACILITY_EXIT_BLOCKED", "하차 위치가 막혀 있습니다. 잠시 후 다시 시도해주세요.");
                }
                channels.releaseFacility(member.userId(), exit);
                facilities.release(member.userId());
                publishFacilities(channel, member, request.requestId());
                publishWorld(channels.worldState(channel), null, null);
            }
            case "WORLD_FACILITY_AIM" -> {
                long before = facilities.state(channel).version();
                facilities.aim(member.userId(), payload.path("leaseId").asText(), payload.path("seq").asLong(),
                        payload.path("yaw").asDouble(), payload.path("pitch").asDouble());
                if (before == facilities.state(channel).version()) {
                    member.peer().offer(protocol.encode(request.requestId(), "WORLD_FACILITY_STATE",
                            facilities.state(channel)));
                } else {
                    publishFacilities(channel, member, request.requestId());
                }
            }
            default -> throw new IllegalStateException("검증되지 않은 시설 명령");
        }
    }

    private void publishFacilities(String channel, Member actor, String requestId) {
        var state = facilities.state(channel);
        for (Member target : java.util.List.copyOf(members.values())) {
            if (channels.isInChannel(target.userId(), channel)) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "WORLD_FACILITY_STATE", state));
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
        recordBehavior(BehaviorEventType.EMOTE_SENT, member.accountId(),
                builder -> builder.channelId(channelId).prop("emoteCode", event.emoteCode()));
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
        boolean ready = request.payload().get("ready").booleanValue();
        if (room.setReady(member.userId(), ready)) {
            publish(room, member, request.requestId());
            recordBehavior(BehaviorEventType.TABLE_READY_SET, member.accountId(),
                    builder -> builder.tableId(room.snapshot().tableId()).prop("ready", ready));
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
        Integer targetScore = request.payload().has("targetScore") ? request.payload().get("targetScore").intValue() : null;
        if (game == TableGame.DICE && targetScore == null) {
            fail(request, "GAME_OPTIONS_REQUIRED", "주사위 목표 2000/4000/6000점 중 하나를 선택해주세요.");
        }
        if (room.selectGame(game, targetScore)) {
            starts.remove(tableId);
            publish(room, member, request.requestId());
            publishStart(tableId);
            recordBehavior(BehaviorEventType.GAME_SELECTED, member.accountId(), builder -> builder.tableId(tableId)
                    .prop("gameCode", game.name()).prop("targetScore", targetScore));
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
        recordBehavior(BehaviorEventType.TABLE_LEFT, member.accountId(), builder -> builder.tableId(tableId)
                .channelId(tableChannels.get(tableId)).prop("byDisconnect", false));
    }

    private TableRoom seatedRoom(Member member, Request request) {
        String tableId = seating.get(member.userId());
        if (tableId == null) {
            fail(request, "NOT_SEATED", "먼저 테이블에 착석해주세요.");
        }
        return rooms.get(tableId);
    }

    private void replyState(Member member, Request request, TableRoom room) {
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_STATE", publicSnapshot(room)));
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
        if (!canWatchTable(member, tableId)) {
            fail(request, "TABLE_OUT_OF_RANGE", "테이블 관전 범위를 확인해주세요.");
        }
        String current = watching.get(member.userId());
        if (current != null && !current.equals(tableId)) {
            fail(request, "ALREADY_WATCHING", "기존 테이블 보기부터 종료해주세요.");
        }
        watching.put(member.userId(), tableId);
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_WATCH_STATE", publicSnapshot(room)));
        if (current == null) {
            recordBehavior(BehaviorEventType.TABLE_WATCHED, member.accountId(), builder -> builder.tableId(tableId));
        }
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
        TableRoom.Snapshot snapshot = publicSnapshot(room);
        for (Member target : members.values()) {
            if (snapshot.tableId().equals(seating.get(target.userId()))) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "TABLE_STATE", snapshot));
            } else if (snapshot.tableId().equals(watching.get(target.userId()))) {
                if (canWatchTable(target, snapshot.tableId())) {
                    target.peer().offer(protocol.encode(null, "TABLE_WATCH_STATE", snapshot));
                } else {
                    clearWatch(target, null);
                }
            }
        }
    }

    private TableRoom.Snapshot publicSnapshot(TableRoom room) {
        return room.snapshot(publicGameId(room.snapshot().tableId()));
    }

    private String publicGameId(String tableId) {
        TableStartAttempt attempt = starts.get(tableId);
        return committedStarts.isPresent() && attempt != null && attempt.phase().equals("PLAYING")
                && !attempt.endedEarly() ? attempt.view(0, false).gameSessionId() : null;
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
        if ((!startRehearsal && committedStarts.isEmpty()) || !snapshot.allReady()) {
            return;
        }
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), snapshot.tableId(), snapshot.version(),
                snapshot.gameCode(), snapshot.seats().stream()
                        .filter(seat -> seat.userId() != null)
                        .map(seat -> new Participant(seat.userId(), seat.seatNumber())).toList(), snapshot.targetScore());
        TableStartAttempt attempt = new TableStartAttempt(command);
        starts.put(snapshot.tableId(), attempt);
        if (committedStarts.isPresent()) {
            command.participants().forEach(player -> reconnect.ifPresent(service ->
                    service.startPending(Long.parseLong(player.userId()))));
        }
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
            GameStartResult result;
            if (committedStarts.isPresent()) {
                result = lookup ? committedStarts.get().find(attempt.command())
                        : committedStarts.get().start(attempt.command());
            } else {
                GameStartGateway target = gateway.orElseThrow();
                result = lookup ? target.findStartResult(attempt.command().startAttemptId())
                        : target.startGame(attempt.command());
            }
            synchronized (this) {
                if (!stopped && starts.get(tableId) == attempt && attempt.starting()) {
                    applyStartResult(tableId, attempt, result);
                }
            }
        } catch (RuntimeException exception) {
            log.warn("시작 연동 결과 미확정 table={} attempt={}", tableId, attempt.command().startAttemptId());
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
        if (committedStarts.isPresent()) { attempt.playing(); }
        if (committedStarts.isPresent() && attempt.frozen() && !attempt.starting()) {
            recordGameStarted(tableId, attempt, result);
            if (publicGameId(tableId) != null) {
                TableRoom room = rooms.get(tableId);
                room.publicStateChanged();
                publish(room, null, null);
            }
        }
        if (!attempt.frozen()) {
            Set<String> connected = connectedUsers();
            rooms.get(tableId).returnToWaiting(connected);
            seating.entrySet().removeIf(entry -> entry.getValue().equals(tableId)
                    && !connected.contains(entry.getKey()));
            publish(rooms.get(tableId), null, null);
        }
        publishStart(tableId);
        if (committedStarts.isPresent() && !attempt.starting()) {
            attempt.command().participants().forEach(player -> reconnect.ifPresent(service ->
                    service.startResolved(Long.parseLong(player.userId()))));
        }
        if (attempt.endedEarly()) { roundEnded(tableId, attempt.view(0, false).gameSessionId()); }
    }

    // 확정 경기만 기록한다. 리허설 확인은 실제 경기가 아니다. 참가자 ID는 인증 회원 번호다.
    private void recordGameStarted(String tableId, TableStartAttempt attempt, GameStartResult result) {
        GameStartCommand command = attempt.command();
        String gameId = attempt.view(0, false).gameSessionId();
        for (Participant player : command.participants()) {
            recordBehavior(BehaviorEventType.GAME_STARTED, null, builder -> builder
                    .userId(Long.valueOf(player.userId()))
                    .tableId(tableId)
                    .channelId(tableChannels.get(tableId))
                    .gameId(gameId)
                    .prop("gameCode", command.gameCode())
                    .prop("players", command.participants().size())
                    .prop("targetScore", command.targetScore())
                    .prop("betAmountPerPlayer", result.reservedAmountPerPlayer()));
        }
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

    /** 실제 엔진 종료만 테이블을 정산 대기로 전환한다. 과거 경기 알림은 무시한다. */
    public synchronized void roundEnded(String tableId, String gameId) {
        if (stopped || committedStarts.isEmpty()) { return; }
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt != null && attempt.starting()) {
            // 엔진 생성과 Hub 성공 반영 사이의 종료를 보존한다. 나중에 확정 경기 ID와 대조한다.
            attempt.rememberEnd(gameId);
            return;
        }
        if (attempt == null || !gameId.equals(attempt.view(0, false).gameSessionId()) || !attempt.endRound()) { return; }
        TableRoom room = rooms.get(tableId);
        room.resetReady();
        publish(room, null, null);
        publishStart(tableId);
        attempt.command().participants().forEach(player -> reconnect.ifPresent(service ->
                service.startResolved(Long.parseLong(player.userId()))));
        releaseSettledRound(tableId, attempt);
    }

    @EventListener
    public synchronized void roundSettled(GameResultCommitted event) {
        if (stopped || committedStarts.isEmpty()) { return; }
        GameResultView result = event.result();
        if (result.settlementStatus() != GameResultView.SettlementStatus.SETTLED) { return; }
        for (var entry : starts.entrySet()) {
            TableStartAttempt attempt = entry.getValue();
            if ((!attempt.starting() && !attempt.phase().equals("PLAYING") && !attempt.phase().equals("SETTLING"))
                    || !attempt.starting() && !result.gameSessionId().equals(attempt.view(0, false).gameSessionId())
                    || !result.gameCode().equals(attempt.command().gameCode())
                    || result.betAmountPerPlayer() != 1) { continue; }
            Set<String> expected = attempt.command().participants().stream().map(Participant::userId)
                    .collect(Collectors.toSet());
            Set<String> actual = result.participants().stream().map(GameResultView.Participant::userId)
                    .collect(Collectors.toSet());
            if (!expected.equals(actual) || !expected.contains(Long.toString(result.userId()))) { continue; }
            // 경기 전체 SETTLED를 확인한다. 알림이 먼저 와도 엔진 종료 전에는 다음 판을 열지 않는다.
            attempt.markSettled(result.gameSessionId());
            releaseSettledRound(entry.getKey(), attempt);
        }
    }

    @EventListener
    public void roundResultLoaded(com.ssafy.ontop.game.result.GameResultLoaded event) {
        roundSettled(new GameResultCommitted(event.result()));
    }

    private void releaseSettledRound(String tableId, TableStartAttempt attempt) {
        if (!attempt.returnAfterSettlement()) { return; }
        Set<String> connected = connectedUsers();
        TableRoom room = rooms.get(tableId);
        room.returnToWaiting(connected);
        seating.entrySet().removeIf(entry -> entry.getValue().equals(tableId) && !connected.contains(entry.getKey()));
        publish(room, null, null);
        publishStart(tableId);
    }

    private void replyStartState(Member target, String tableId, String requestId) {
        if (!startRehearsal && committedStarts.isEmpty()) {
            return;
        }
        long revision = startRevisions.getOrDefault(tableId, 0L);
        TableStartAttempt attempt = starts.get(tableId);
        String gameCode = tableId == null ? null : rooms.get(tableId).snapshot().gameCode();
        TableStartAttempt.View view = attempt == null || gameCode == null
                ? TableStartAttempt.View.waiting(tableId, revision, gameCode, committedStarts.isEmpty())
                : attempt.view(revision, committedStarts.isEmpty());
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
        if (error == null && view.role() == GameStateView.Role.SPECTATOR
                && !canSpectate(sessionId, member, view.tableId())) {
            error = "GAME_STATE_ACCESS_DENIED";
        }
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
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
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
        if (error == null && push.role == GameStateView.Role.SPECTATOR
                && !canSpectate(sessionId, push.member, view.tableId())) {
            error = "GAME_STATE_ACCESS_DENIED";
        }
        if (error != null) {
            push.member.peer().offer(protocol.error(push.initialRequestId, error, "경기 상태를 가져올 수 없습니다."));
            if (push.role == GameStateView.Role.SPECTATOR) {
                statePushes.remove(sessionId);
            }
        } else if (view.version() > push.deliveredVersion || push.initialRequestId != null) {
            push.tableId = view.tableId();
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
        return !seating.containsKey(push.member.userId())
                && (reconnect.isEmpty() || reconnect.get().canUseLobby(push.member.accountId(), sessionId))
                && (push.tableId == null || canWatchTable(push.member, push.tableId));
    }

    private boolean canWatchTable(Member member, String tableId) {
        return proximity.canWatch(member.userId(), tableId, tableChannels.get(tableId));
    }

    private boolean canSpectate(String sessionId, Member member, String tableId) {
        return !seating.containsKey(member.userId()) && canWatchTable(member, tableId)
                && (reconnect.isEmpty() || reconnect.get().canUseLobby(member.accountId(), sessionId));
    }

    private void clearGameWatch(Member member) {
        for (var entry : new ArrayList<>(statePushes.entrySet())) {
            StatePush push = entry.getValue();
            if (push.member == member && push.role == GameStateView.Role.SPECTATOR) {
                statePushes.remove(entry.getKey());
                closePendingWatch(push, "GAME_STATE_ACCESS_DENIED");
            }
        }
    }

    private void refreshWatchRange(Member member) {
        String tableId = watching.get(member.userId());
        if (tableId != null && !canWatchTable(member, tableId)) {
            clearWatch(member, null);
        }
        for (StatePush push : new ArrayList<>(statePushes.values())) {
            if (push.member == member && push.role == GameStateView.Role.SPECTATOR
                    && push.tableId != null && !canWatchTable(member, push.tableId)) {
                clearGameWatch(member);
            }
        }
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

    private record ProfileTarget(Member member, String channel) {
    }

    private record Member(String userId, TablePeer peer, Long accountId) {
    }

    private static final class AppearancePush {
        private final Member member;
        private final String channel;
        private long requested;
        private boolean running;

        private AppearancePush(Member member, String channel) {
            this.member = member;
            this.channel = channel;
        }
    }

    private static final class StatePush {
        private String tableId;
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
