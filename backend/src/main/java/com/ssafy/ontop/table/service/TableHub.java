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
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.omok.service.OmokForfeitDirection;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.onecard.service.OneCardPranks;
import com.ssafy.ontop.game.reconnect.ActiveGameLookup;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand.Participant;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.table.domain.TableGame;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.domain.TableStartAttempt;
import com.ssafy.ontop.table.dto.DiceLedgerSpectatorPing;
import com.ssafy.ontop.table.dto.GameSpectatorChatMessage;
import com.ssafy.ontop.table.dto.OmokSpectatorPing;
import com.ssafy.ontop.table.dto.TableListResponse;
import com.ssafy.ontop.table.dto.TableProtocol.Request;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableSummaryResponse;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import com.ssafy.ontop.world.config.DynamicChannelsProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.domain.ChatText;
import com.ssafy.ontop.world.domain.EmoteCode;
import com.ssafy.ontop.world.dto.WorldGameReaction;
import com.ssafy.ontop.world.map.LegacyParkTables;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.DynamicChannelDisplayNumbers;
import com.ssafy.ontop.world.service.ParkDebrisStore;
import com.ssafy.ontop.world.service.WorldAppearanceGateway;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import com.ssafy.ontop.world.service.WorldFacilityService;
import com.ssafy.ontop.world.service.WorldFollowService;
import com.ssafy.ontop.world.service.WorldMapCompatibility;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import com.ssafy.ontop.world.service.WorldProximity;
import jakarta.annotation.PreDestroy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
    private final Map<String, String> tableAnchors = new HashMap<>();
    private final Set<String> channelIds;
    private final Map<String, Long> emptyChannelsSince = new HashMap<>();
    private DynamicChannelsProperties dynamicChannels = DynamicChannelsProperties.disabled();
    private WorldMapRuntime dynamicMap;
    private String initialChannelId;
    private final Map<String, Member> members = new HashMap<>();
    private final WorldMapCompatibility maps;
    private final Set<String> mapVerifiedSessions = new HashSet<>();
    private final Map<String, PendingMapConnection> pendingMapConnections = new HashMap<>();
    private final Map<String, AppearancePush> appearancePushes = new HashMap<>();
    private Optional<WorldAppearanceGateway> appearances = Optional.empty();
    private Optional<WorldProfileGateway> profiles = Optional.empty();
    private Optional<ReadyBalanceGateway> readyBalances = Optional.empty();
    private final Map<String, ReadyBalanceCheck> readyBalanceChecks = new HashMap<>();

    @Autowired
    public void configureReadyBalances(Optional<ReadyBalanceGateway> balances) { readyBalances = balances; }

    private static final class ReadyBalanceCheck {
        private final TableRoom room;
        private final String requestId;
        private java.util.concurrent.ScheduledFuture<?> timeout;
        private ReadyBalanceCheck(TableRoom room, String requestId) {
            this.room = room;
            this.requestId = requestId;
        }
    }

    // 시작 단계의 MEMBER_ALREADY_IN_GAME과 같은 active_user_id 기준으로 착석 전에 미정산 참가를 확인한다.
    private Optional<ActiveGameLookup> activeGames = Optional.empty();
    private final Map<String, JoinCheck> joinChecks = new HashMap<>();
    // 할리갈리 자연 탈락자의 퇴장 확인 중인 연결. 기권(GAME_FORFEIT)의 actionRequests와 분리한다.
    private final Set<String> eliminatedLeaves = new HashSet<>();

    @Autowired
    public void configureActiveGames(Optional<ActiveGameLookup> lookup) { activeGames = lookup; }

    private static final class JoinCheck {
        private java.util.concurrent.ScheduledFuture<?> timeout;
    }
    private final Map<Member, ProfileTarget> profileMemberships = new HashMap<>();
    private boolean profilesLoading;
    private boolean profilesRequested;
    private final Map<String, String> seating = new HashMap<>();
    // 좌석을 유지한 실제 라운드만 종료 복구를 허용한다. 재착석은 과거 라운드를 다시 등록하지 않는다.
    private final Map<String, String> seatedGames = new HashMap<>();
    private final Map<String, String> watching = new HashMap<>();
    private final Map<String, TableStartAttempt> starts = new HashMap<>();
    private final Map<String, Set<String>> inactiveGameParticipants = new HashMap<>();
    private final Map<String, Long> startRevisions = new HashMap<>();
    private final Optional<GameStartGateway> gateway;
    private final boolean startRehearsal;
    private boolean startDiagnosticsEnabled;
    @Value("${ontop.games.stone-rumble.enabled:false}")
    private boolean stoneRumbleEnabled;
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
    private final com.ssafy.ontop.world.service.WorldTyping typing =
            new com.ssafy.ontop.world.service.WorldTyping(System::nanoTime);
    private final WorldEmoteService emotes;
    private final WorldProximity proximity;
    private final WorldFacilityService facilities;
    private final PreparedParkMap preparedPark;
    private final WorldFollowService follows = new WorldFollowService();
    private final Map<String, ReactionRound> reactionRounds = new HashMap<>();
    private final ParkDebrisStore parkDebris = new ParkDebrisStore();
    private com.ssafy.ontop.world.service.WorldClock worldClock = new com.ssafy.ontop.world.service.WorldClock();
    private final Map<String, WaitingReconnect> waitingReconnects = new HashMap<>();
    private final Map<String, Long> connectionStarted = new HashMap<>();
    private final Map<String, String> loginSessions = new HashMap<>();
    private record WaitingReconnect(String tableId, java.time.Instant expiresAt, String loginSessionId) {}
    private final Map<String, ManualStartReceipt> manualStartReceipts = new HashMap<>();
    private final Map<String, GameResultView> settledHostResults = new HashMap<>();

    private record ManualStartReceipt(String userId, String actionId, long expectedVersion, TableStartAttempt attempt) {}

    @Autowired(required = false)
    public void configureWorldClock(com.ssafy.ontop.world.service.WorldClock clock) { worldClock = clock; }
    private final AlkkagiSpectatorPolicy alkkagiSpectators = new AlkkagiSpectatorPolicy();
    private com.ssafy.ontop.world.fitness.FitnessRewardService fitnessRewards;

    @Autowired(required = false)
    public void configureFitnessRewards(com.ssafy.ontop.world.fitness.FitnessRewardService service) {
        fitnessRewards = service;
        service.sink((userId, receipt) -> sendJumpmap(userId, "FITNESS_REWARD",
                Map.of("userId", userId, "receipt", receipt)));
    }
    private SpectatorEventPolicy spectatorEvents = new SpectatorEventPolicy();
    private Optional<OneCardEngine> prankEngine = Optional.empty();
    private final OneCardPranks onecardPranks = new OneCardPranks();
    private boolean pranksEnabled;
    private boolean prankDefenseEnabled = true;

    @Autowired
    public void configureOneCardPranks(Optional<OneCardEngine> engine,
            @Value("${ontop.games.onecard.pranks-enabled:false}") boolean enabled,
            @Value("${ontop.games.onecard.defense-enabled:true}") boolean defense) {
        prankEngine = engine;
        pranksEnabled = enabled;
        prankDefenseEnabled = defense;
    }

    @Autowired(required = false)
    public void configureSpectatorEvents(SpectatorEventPolicy policy) { spectatorEvents = policy; }
    // 점프맵 서비스가 없으면(비활성) 판정 신호를 버린다.
    private java.util.function.Consumer<java.util.List<WorldChannelRegistry.JumpmapDelivery>> jumpmapSignals = ignored -> { };

    @Autowired(required = false)
    public void configureJumpmap(com.ssafy.ontop.world.jumpmap.JumpmapService service) {
        jumpmapSignals = deliveries -> deliveries.forEach(delivery -> service.accept(delivery.signal(), delivery.recipients()));
        service.sink(this::sendJumpmap);
    }

    /** 점프맵 저장 스레드에서도 호출된다. 같은 회원의 모든 연결(동시에 하나)에 송신 큐로만 넣는다. */
    private synchronized void sendJumpmap(String userId, String type, java.util.Map<String, Object> payload) {
        String encoded = protocol.encode(null, type, payload);
        for (Member member : members.values()) {
            if (member.userId().equals(userId)) member.peer().offer(encoded);
        }
    }
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

    // 실제 점유가 생기거나 풀린 뒤에만 호출한다. 시작·종료는 leaseId로 짝을 맞춘다.
    private void recordFacility(Long accountId, WorldFacilityService.Lease lease, String endReason) {
        if (fitnessRewards != null) {
            if (endReason == null) {
                fitnessRewards.started(accountId, lease);
            } else {
                fitnessRewards.ended(lease);
            }
        }
        recordBehavior(endReason == null ? BehaviorEventType.FACILITY_USED : BehaviorEventType.FACILITY_RELEASED,
                accountId, builder -> {
                    builder.channelId(lease.channelId()).prop("leaseId", lease.leaseId())
                            .prop("facilityId", lease.facilityId()).prop("kind", lease.kind())
                            .prop("seatIndex", lease.seatIndex());
                    if (endReason != null) {
                        builder.prop("endReason", endReason).prop("durationMs",
                                Math.max(0, Duration.between(lease.startedAt(), Instant.now()).toMillis()));
                    }
                    return builder;
                });
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

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                emotes, gameStates, gameActions, gameResults, proximity, new WorldMapCompatibility(false));
    }

    @Autowired
    public TableHub(WorldMapRuntime runtime, ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity, WorldMapCompatibility maps,
            DynamicChannelsProperties dynamicChannels) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                emotes, gameStates, gameActions, gameResults, proximity, maps, runtime.prepared().orElse(null),
                runtime.legacyTables().orElse(null));
        this.dynamicChannels = dynamicChannels;
        this.dynamicMap = runtime;
        if (dynamicChannels.enabled()) {
            if (channelIds.size() != 1 || channels.definitions().getFirst().capacity() != dynamicChannels.capacity()) {
                throw new IllegalArgumentException("운영 유동 채널은 정원이 일치하는 초기 채널 하나가 필요합니다.");
            }
            initialChannelId = channels.definitions().getFirst().channelId();
        }
        // 실제 서버에서는 연동 비활성 상태도 조회해 FE에 원인을 알릴 수 있다.
        protocol.enableStartQueries();
        startDiagnosticsEnabled = true;
    }

    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway,
            @Value("${ontop.start-rehearsal.enabled:false}") boolean startRehearsal,
            Optional<GameReconnectService> reconnect,
            @Value("${ontop.websocket.heartbeat.interval:10s}") Duration heartbeatInterval,
            @Value("${ontop.websocket.heartbeat.timeout:10s}") Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity, WorldMapCompatibility maps) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                emotes, gameStates, gameActions, gameResults, proximity, maps, null);
    }

    /** 선택한 생성 맵을 한 묶음으로 주입한다. 기본 legacy 구성은 기존 맵을 유지한다. */
    public TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway, boolean startRehearsal,
            Optional<GameReconnectService> reconnect, Duration heartbeatInterval, Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity, WorldMapCompatibility maps,
            PreparedParkMap preparedPark) {
        this(mapper, gateway, startRehearsal, reconnect, heartbeatInterval, heartbeatTimeout, channels, chat,
                emotes, gameStates, gameActions, gameResults, proximity, maps, preparedPark, null);
    }

    private TableHub(ObjectMapper mapper, Optional<GameStartGateway> gateway, boolean startRehearsal,
            Optional<GameReconnectService> reconnect, Duration heartbeatInterval, Duration heartbeatTimeout,
            WorldChannelRegistry channels, WorldChatService chat, WorldEmoteService emotes,
            Optional<GameStateGateway> gameStates, Optional<GameActionGateway> gameActions,
            Optional<GameResultService> gameResults, WorldProximity proximity, WorldMapCompatibility maps,
            PreparedParkMap preparedPark, LegacyParkTables legacyTables) {
        if (startRehearsal && gateway.isEmpty()) {
            throw new IllegalArgumentException("시작 연동 검증 대역이 필요합니다.");
        }
        this.gateway = gateway;
        this.preparedPark = preparedPark;
        this.facilities = preparedPark == null ? new WorldFacilityService()
                : new WorldFacilityService(preparedPark.facilities(), java.time.Clock.systemUTC(), System::nanoTime);
        if (preparedPark != null && (!channels.mapMetadata().equals(preparedPark.metadata())
                || !maps.metadata().equals(preparedPark.metadata()))) {
            throw new IllegalArgumentException("채널·시설·연결 응답은 같은 맵을 사용해야 합니다.");
        }
        this.maps = maps;
        this.gameStates = gameStates;
        this.gameActions = gameActions;
        this.startRehearsal = startRehearsal;
        this.reconnect = reconnect;
        this.gameResults = gameResults;
        this.channels = channels;
        this.chat = chat;
        this.emotes = emotes;
        this.proximity = preparedPark == null ? proximity : new WorldProximity(channels, preparedPark.proximity());
        for (ConnectionCloseReason reason : ConnectionCloseReason.values()) {
            closedByReason.put(reason, new LongAdder());
        }
        channelIds = new HashSet<>(channels.snapshot().keySet());
        if (preparedPark != null) {
            Set<String> preparedChannels = preparedPark.bindings().stream().map(PreparedParkMap.Binding::channelId)
                    .collect(java.util.stream.Collectors.toSet());
            if (!preparedChannels.equals(channelIds)) {
                throw new IllegalArgumentException("테이블 매핑과 서버 채널이 다릅니다.");
            }
            for (var binding : preparedPark.bindings()) {
                rooms.put(binding.tableId(), new TableRoom(binding.tableId()));
                tableChannels.put(binding.tableId(), binding.channelId());
                tableAnchors.put(binding.tableId(), binding.anchorId());
            }
        } else if (legacyTables != null && !channelIds.isEmpty()) {
            Set<String> registeredChannels = legacyTables.entries().stream()
                    .map(LegacyParkTables.Entry::channelId).collect(Collectors.toSet());
            if (!registeredChannels.equals(channelIds)) {
                throw new IllegalArgumentException("현재 맵의 테이블 매핑과 서버 채널이 다릅니다.");
            }
            for (var table : legacyTables.entries()) {
                rooms.put(table.tableId(), new TableRoom(table.tableId()));
                tableChannels.put(table.tableId(), table.channelId());
                tableAnchors.put(table.tableId(), table.anchorId());
            }
        } else if (channelIds.isEmpty()) {
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
                    tableAnchors.put(tableId, "table-" + number);
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
        heartbeatTimer.scheduleWithFixedDelay(this::checkHostWaits, 100, 100, TimeUnit.MILLISECONDS);
        heartbeatTimer.scheduleWithFixedDelay(this::pruneDynamicChannels, 1, 1, TimeUnit.SECONDS);
        heartbeatTimer.scheduleWithFixedDelay(this::tickOneCardPranks, 33, 33, TimeUnit.MILLISECONDS);
        heartbeatTimer.scheduleWithFixedDelay(this::expireParkDebris, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized void connect(WebSocketSession session) {
        String userId = "dev-" + UUID.randomUUID();
        register(session, userId, null);
    }

    public synchronized boolean connectAuthenticated(WebSocketSession session, VerifiedWebSocketUser user) {
        String userId = Long.toString(user.userId());
        expireWaitingReconnects();
        WaitingReconnect lease = waitingReconnects.get(userId);
        boolean reservedLobby = lease != null && java.util.Objects.equals(lease.loginSessionId(), user.sessionId());
        // 사용자 확정: 기존 연결이 살아 있으면 새 연결만 거절한다.
        boolean reservedStart = committedStarts.isPresent() && seating.containsKey(userId)
                && starts.containsKey(seating.get(userId)) && starts.get(seating.get(userId)).frozen();
        checkDuplicateConnection(userId, user.sessionId());
        if (seating.containsKey(userId) && !reservedStart && !reservedLobby
                || members.values().stream().anyMatch(member -> member.userId().equals(userId))) {
            return false;
        }
        Member member = register(session, userId, user.userId());
        loginSessions.put(session.getId(), user.sessionId());
        if (maps.requiresMatch()) {
            pendingMapConnections.put(session.getId(), new PendingMapConnection(user.sessionId(), reservedStart));
        } else {
            activateConnection(member, session.getId(), user.sessionId(), reservedStart);
        }
        return true;
    }

    private Duration duplicateProbe = Duration.ZERO;
    // 사용자 → 기존 연결 생존 확인 시작 시각(nanoTime)
    private final Map<String, Long> duplicateProbes = new HashMap<>();

    /** 0이면 끈다(기존 1008 거절). 후보값 3초는 스테이징 측정 전까지 운영값으로 확정하지 않는다. */
    @Autowired(required = false)
    public void configureDuplicateProbe(@Value("${ontop.websocket.duplicate-probe-timeout:0s}") String value) {
        // 변환 서비스가 없는 최소 구성에서도 시작하도록 문자열을 직접 해석한다("500ms", "3s").
        Duration timeout = org.springframework.boot.convert.DurationStyle.detectAndParse(value);
        if (timeout.isNegative() || timeout.compareTo(heartbeatTimeout) >= 0) {
            throw new IllegalArgumentException("기존 연결 확인 시간은 0 이상, heartbeat 제한 시간 미만이어야 합니다.");
        }
        duplicateProbe = timeout;
    }

    /**
     * 같은 로그인 세션의 연결이 이미 있으면(half-open 의심) 기존 연결에 즉시 ping을 보내고 새 연결은 재시도로 돌려보낸다.
     * 기존 연결이 기한 안에 응답했으면(다른 탭) 그대로 두고 기존 1008 거절로 넘어간다. 다른 로그인 세션은 검사하지 않는다.
     */
    private void checkDuplicateConnection(String userId, String loginSessionId) {
        if (duplicateProbe.isZero()) return;
        Member existing = members.values().stream().filter(member -> member.userId().equals(userId)).findFirst().orElse(null);
        if (existing == null) {
            duplicateProbes.remove(userId);
            return;
        }
        if (!java.util.Objects.equals(loginSessions.get(existing.sessionId()), loginSessionId)) return;
        long now = System.nanoTime();
        Long started = duplicateProbes.get(userId);
        // heartbeat 점검 주기(100ms)와 정리 여유를 더해 기한이 지난 뒤에도 남아 있으면 살아 있는 연결이다.
        long settle = duplicateProbe.toNanos() + Duration.ofMillis(300).toNanos();
        if (started == null || now - started > settle * 4) {
            duplicateProbes.put(userId, now);
            existing.peer().probeNow(duplicateProbe);
            throw new com.ssafy.ontop.table.websocket.RetryableConnectionException("기존 연결을 확인하고 있습니다.");
        }
        if (now - started < settle) {
            throw new com.ssafy.ontop.table.websocket.RetryableConnectionException("기존 연결을 확인하고 있습니다.");
        }
        duplicateProbes.remove(userId);
    }

    private void activateConnection(Member member, String sessionId, String loginSessionId, boolean reservedStart) {
        expireWaitingReconnects();
        WaitingReconnect lease = waitingReconnects.get(member.userId());
        String tableId = seating.get(member.userId());
        if (lease != null && java.util.Objects.equals(lease.loginSessionId(), loginSessionId)) {
            waitingReconnects.remove(member.userId());
            if (tableId != null) {
                member.peer().offer(protocol.encode(null, "TABLE_STATE", publicSnapshot(rooms.get(tableId))));
                replyHostWait(member, rooms.get(tableId), null);
                // 유지된 대기석도 frozen 좌석처럼 현재 시작 상태를 함께 받아야 다음 판 준비 조건을 판단한다.
                replyStartState(member, tableId, null);
            }
        } else if (reservedStart) {
            // frozen 좌석은 TABLE_STATE를 다시 받을 기회가 다음 테이블 방송뿐이다. 복구 판정보다 먼저 보낸다.
            member.peer().offer(protocol.encode(null, "TABLE_STATE", publicSnapshot(rooms.get(tableId))));
            replyStartState(member, tableId, null);
        }
        member.delivery().current(seatedGames.get(member.userId()));
        TableStartAttempt pendingAttempt = starts.get(seating.get(member.userId()));
        if (pendingAttempt != null && pendingAttempt.starting()
                && pendingAttempt.command().participants().stream().anyMatch(p -> p.userId().equals(member.userId()))) {
            member.delivery().starting();
        }
        gameResults.ifPresent(service -> service.connected(sessionId, member.accountId(), member.delivery()::result));
        inactiveGameParticipants.forEach((game, users) -> {
            if (users.contains(member.userId())) { member.delivery().rememberDeparture(game); }
        });
        reconnect.ifPresent(service -> service.connected(member.accountId(), sessionId, loginSessionId,
                member.delivery()::recovery, member.delivery()::allowsFinished, member.delivery()::hasDeparted));
    }

    private Member register(WebSocketSession session, String userId, Long accountId) {
        TablePeer peer = new TablePeer(session, () -> disconnect(session.getId()),
                new WebSocketHeartbeat(heartbeatInterval, heartbeatTimeout, System::nanoTime), this::textSent);
        Member member = new Member(userId, peer, accountId, session.getId(), new GameDeliveryScope(protocol, peer::offer));
        members.put(session.getId(), member);
        connectionStarted.put(session.getId(), System.nanoTime());
        acceptedConnections++;
        peer.offer(protocol.encode(null, "CONNECTED", Map.of("userId", userId, "map", maps.metadata(),
                "mapVerificationRequired", maps.requiresMatch(), "time", worldClock.sample())));
        if (startRehearsal || committedStarts.isPresent()) {
            peer.offer(protocol.encode(null, "GAME_START_STATE", TableStartAttempt.View.waiting(null, 0, null,
                    committedStarts.isEmpty())));
        }
        peer.start();
        recordBehavior(BehaviorEventType.WS_CONNECTED, accountId, builder -> builder);
        return member;
    }

    private void confirmMap(String sessionId, Member member, Request request) {
        if (!maps.matches(request.payload())) {
            replyMapError(member, request, "MAP_VERSION_MISMATCH", "맵을 새로고침한 뒤 다시 연결해주세요.");
            return;
        }
        mapVerifiedSessions.add(sessionId);
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_MAP_STATE",
                Map.of("map", maps.metadata(), "verified", true)));
        PendingMapConnection pending = pendingMapConnections.remove(sessionId);
        if (pending != null) {
            activateConnection(member, sessionId, pending.loginSessionId(), pending.reservedStart());
        }
    }

    private void replyMapError(Member member, Request request, String code, String message) {
        member.peer().offer(protocol.encode(request.requestId(), "ERROR",
                Map.of("code", code, "message", message, "serverMap", maps.metadata())));
    }

    private boolean isMapReady(Member member) {
        return !maps.requiresMatch() || mapVerifiedSessions.contains(member.sessionId());
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
                    snapshot.gameCode(), snapshot.targetScore(), snapshot.betAmountPerPlayer(), publicGameId(tableId), snapshot.selectorUserId(), snapshot.selectedPlayers(), snapshot.startMode(), tableAnchors.get(tableId), chairCount(snapshot));
        }).toList());
    }

    private void ensureSpareChannel() {
        if (!dynamicChannels.enabled() || channelIds.size() >= dynamicChannels.maxChannels()
                || channels.snapshot().values().stream().anyMatch(count -> count < dynamicChannels.spawnAt())) {
            return;
        }
        int displayNumber = DynamicChannelDisplayNumbers.nextAvailable(
                channels.definitions(), dynamicChannels.maxChannels());
        String channelId = "channel-" + UUID.randomUUID();
        var layout = dynamicMap.tableLayout(channelId);
        if (layout.isEmpty() || layout.stream().anyMatch(table -> rooms.containsKey(table.tableId()))) {
            throw new IllegalStateException("새 채널의 테이블 배치를 준비할 수 없습니다.");
        }
        try {
            for (var table : layout) {
                rooms.put(table.tableId(), new TableRoom(table.tableId()));
                tableChannels.put(table.tableId(), channelId);
                tableAnchors.put(table.tableId(), table.anchorId());
                proximity.registerTable(table.tableId(), table.point());
            }
            channels.addChannel(new WorldChannelProperties.Channel(channelId,
                    DynamicChannelDisplayNumbers.name(displayNumber), dynamicChannels.capacity()));
        } catch (RuntimeException exception) {
            for (var table : layout) {
                rooms.remove(table.tableId());
                tableChannels.remove(table.tableId());
                tableAnchors.remove(table.tableId());
                proximity.removeTable(table.tableId());
            }
            throw exception;
        }
        channelIds.add(channelId);
        emptyChannelsSince.put(channelId, System.nanoTime());
        log.info("운영 채널 생성 channel={} total={}", channelId, channelIds.size());
    }

    /** The Hub lock also guards seats, games, reconnect leases, facilities and table registration. */
    private synchronized void pruneDynamicChannels() {
        if (stopped || !dynamicChannels.enabled()) { return; }
        try {
            long now = System.nanoTime();
            Map<String, Integer> counts = channels.snapshot();
            for (String channelId : Set.copyOf(channelIds)) {
                if (channelId.equals(initialChannelId)) { continue; }
                if (counts.getOrDefault(channelId, 0) != 0 || hasChannelActivity(channelId)) {
                    emptyChannelsSince.remove(channelId);
                    continue;
                }
                long emptySince = emptyChannelsSince.computeIfAbsent(channelId, ignored -> now);
                if (now - emptySince < dynamicChannels.idleTimeout().toNanos()) { continue; }
                // Keep an empty spare when every other channel is at the creation threshold.
                if (counts.entrySet().stream().filter(entry -> !entry.getKey().equals(channelId))
                        .allMatch(entry -> entry.getValue() >= dynamicChannels.spawnAt())) { continue; }
                follows.removeEmptyChannel(channelId);
                facilities.removeEmptyChannel(channelId);
                channels.removeEmptyChannel(channelId);
                channelIds.remove(channelId);
                emptyChannelsSince.remove(channelId);
                for (String tableId : tableChannels.entrySet().stream()
                        .filter(entry -> entry.getValue().equals(channelId)).map(Map.Entry::getKey).toList()) {
                    rooms.remove(tableId);
                    tableChannels.remove(tableId);
                    tableAnchors.remove(tableId);
                    proximity.removeTable(tableId);
                    starts.remove(tableId);
                    startRevisions.remove(tableId);
                    manualStartReceipts.remove(tableId);
                    settledHostResults.remove(tableId);
                    reactionRounds.remove(tableId);
                }
                log.info("운영 채널 정리 channel={} total={}", channelId, channelIds.size());
            }
        } catch (RuntimeException exception) {
            log.error("운영 채널 유휴 정리 실패", exception);
        }
    }

    private boolean hasChannelActivity(String channelId) {
        if (follows.hasLinks(channelId)) { return true; }
        if (!facilities.state(channelId).occupancies().isEmpty()) { return true; }
        for (var entry : tableChannels.entrySet()) {
            if (!entry.getValue().equals(channelId)) { continue; }
            String tableId = entry.getKey();
            if (seating.containsValue(tableId) || watching.containsValue(tableId)
                    || waitingReconnects.values().stream().anyMatch(lease -> lease.tableId().equals(tableId))
                    || starts.containsKey(tableId) && !starts.get(tableId).phase().equals("WAITING")
                    || rooms.get(tableId).snapshot().seats().stream().anyMatch(seat -> seat.userId() != null)) {
                return true;
            }
        }
        return false;
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
            if (request.type().equals("WORLD_TIME_CHECK")) {
                member.peer().offer(protocol.encode(requestId, "WORLD_TIME_STATE", worldClock.sample()));
                return;
            }
            if (request.type().equals("WORLD_MAP_CONFIRM")) {
                confirmMap(sessionId, member, request);
                return;
            }
            if (maps.requiresMatch() && !mapVerifiedSessions.contains(sessionId)) {
                replyMapError(member, request, "MAP_VERSION_REQUIRED", "먼저 맵 버전을 확인해주세요.");
                return;
            }
            expireWaitingReconnects();
            rooms.values().forEach(this::checkHostTimeout);
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
            if (request.type().equals("WORLD_CHAT_TYPING_SET")) {
                String channel = channels.channelOf(member.userId());
                if (channel == null) { fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요."); }
                boolean changed = typing.update(channel, member.userId(), request.payload().path("typing").asBoolean());
                publishTyping(channel, member, request.requestId(), changed);
                return;
            }
            if (request.type().equals("ONECARD_PRANK_REACH_SEND") || request.type().equals("ONECARD_PRANK_HIT_SEND")
                    || request.type().equals("ONECARD_HAND_FLIP_SEND") || request.type().equals("ONECARD_HAND_RESTORE_SEND")) {
                sendOneCardPrank(sessionId, member, request);
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
            if (request.type().equals("GAME_FORFEIT")) {
                sendGameForfeit(sessionId, member, request);
                return;
            }
            // 자연 탈락 직후 복구 슬롯은 RESTORED로 남으므로 로비 게이트 앞에서 엔진 상태로 먼저 판정한다.
            if (request.type().equals("TABLE_LEAVE") && leaveAsEliminated(sessionId, member, request)) {
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
                        member.delivery()::recovery);
                return;
            }
            if (request.type().equals("GAME_START_CHECK")) {
                checkStart(member, request);
                return;
            }
            if (request.type().equals("TABLE_HOST_WAIT_CHECK")) {
                TableRoom room = seatedRoom(member, request);
                checkHostTimeout(room);
                replyHostWait(member, room, request.requestId());
                return;
            }
            if (request.type().equals("ALKKAGI_SPECTATOR_SEND")) { sendAlkkagiSpectator(sessionId, member, request); return; }
            // 참가자에게도 로비 복구 오류 대신 관전 권한 오류를 주도록 복구 게이트 앞에서 처리한다.
            // 관전자의 로비 자격은 canSpectate에서 다시 검사한다.
            if (request.type().equals("GAME_SPECTATOR_CHAT_SEND") || request.type().equals("OMOK_SPECTATOR_PING_SEND")
                    || request.type().equals("DICE_LEDGER_SPECTATOR_PING_SEND")) {
                sendSpectatorEvent(sessionId, member, request);
                return;
            }
            // 일반 게임 화면의 조작 점유 표시는 복구 확인 중에도 갱신해야 한다. 이 응답이 막히면
            // 클라이언트가 게임 입력을 열지 못한다. VR 시작 보호는 기존 복구 게이트를 그대로 따른다.
            if (request.type().equals("WORLD_INTERACTION_SET")
                    && !request.payload().path("vrActive").asBoolean(false)) {
                interactionBusy(member, request);
                return;
            }
            if (member.accountId() != null && reconnect.isPresent()
                    && !reconnect.get().canUseLobby(member.accountId(), sessionId)
                    && !restoredChannelAccess(member, request)) {
                fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
            }
            if (channels.carryState(member.userId()) != null && Set.of("TABLE_JOIN", "TABLE_WATCH", "GAME_WATCH",
                    "WORLD_FACILITY_USE", "WORLD_FOLLOW_START", "WORLD_EMOTE_SEND", "WORLD_SECRET_DOORS_SET").contains(request.type())) {
                fail(request, "CARRY_ACTIVITY_CONFLICT", "들기·던지기가 끝난 뒤 다른 행동을 시작해주세요.");
            }
            switch (request.type()) {
                case "GAME_WATCH" -> watchGame(sessionId, member, request);
                case "CHANNEL_JOIN" -> joinChannel(member, request);
                case "CHANNEL_LEAVE" -> leaveChannel(member, request);
                case "WORLD_MOVE" -> moveWorld(member, request);
                case "WORLD_POSITION" -> positionWorld(member, request);
                case "WORLD_SECRET_DOORS_SET" -> publishWorld(channels.setSecretDoors(member.userId(),
                        request.payload().path("open").asBoolean()), member, request.requestId());
                case "WORLD_POSITION_FALLBACK" -> member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE",
                        channels.disablePosition(member.userId(), request.payload().path("epoch").asLong()).state()));
                case "WORLD_CHAT_SEND" -> sendChat(member, request);
                case "WORLD_MYROOM_SET" -> {
                    String channel = channels.channelOf(member.userId());
                    long before = channel == null ? -1 : channels.worldState(channel).version();
                    var state = channels.myRoom(member.userId(), request.payload().path("open").asBoolean());
                    if (state.version() == before) {
                        member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", state));
                    } else {
                        publishWorld(state, member, request.requestId());
                    }
                }
                case "WORLD_EMOTE_SEND" -> sendEmote(member, request);
                case "WORLD_CARRY_PICKUP", "WORLD_CARRY_THROW", "WORLD_CARRY_RELEASE" -> carry(member, request);
                case "WORLD_INTERACTION_SET" -> interactionBusy(member, request);
                case "WORLD_FOLLOW_START", "WORLD_FOLLOW_STOP", "WORLD_FOLLOW_CHECK" -> follow(member, request);
                case "WORLD_FACILITY_CATALOG", "WORLD_FACILITY_CHECK", "WORLD_FACILITY_USE",
                        "WORLD_FACILITY_RELEASE", "WORLD_FACILITY_AIM" -> facility(member, request);
                case "TABLE_JOIN" -> join(member, request);
                case "TABLE_WATCH" -> watch(member, request);
                case "TABLE_UNWATCH" -> unwatch(member, request);
                case "READY_SET" -> ready(member, request);
                case "GAME_SELECT" -> selectGame(member, request);
                case "TABLE_CONFIGURE" -> configureTable(member, request);
                case "TABLE_START" -> startTable(member, request);
                case "TABLE_LEAVE" -> leave(member, request);
                case "GAME_START_CHECK" -> checkStart(member, request);
                default -> throw new IllegalStateException("검증되지 않은 메시지");
            }
        } catch (OneCardPranks.Rejected exception) {
            member.peer().offer(protocol.error(requestId, exception.code(), exception.getMessage()));
        } catch (WorldFollowService.FollowException exception) {
            member.peer().offer(protocol.error(requestId, exception.code(), exception.getMessage()));
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
        String loginSessionId = loginSessions.remove(sessionId);
        connectionStarted.remove(sessionId);
        mapVerifiedSessions.remove(sessionId);
        pendingMapConnections.remove(sessionId);
        recordBehavior(BehaviorEventType.WS_DISCONNECTED, member.accountId(),
                builder -> builder.prop("reason", member.peer().closeReason().name()));
        gameResults.ifPresent(service -> service.disconnected(sessionId));
        member.delivery().close();
        stateQueries.remove(sessionId);
        statePushes.remove(sessionId);
        actionRequests.remove(sessionId);
        ReadyBalanceCheck balanceCheck = readyBalanceChecks.remove(sessionId);
        if (balanceCheck != null) balanceCheck.timeout.cancel(false);
        JoinCheck joinCheck = joinChecks.remove(sessionId);
        if (joinCheck != null && joinCheck.timeout != null) joinCheck.timeout.cancel(false);
        eliminatedLeaves.remove(sessionId);
        tickOneCardPranks();
        watching.remove(member.userId());
        endFollows(member.userId());
        chat.disconnected(member.userId());
        cancelEmote(member.userId(), "DISCONNECTED");
        emotes.disconnected(member.userId());
        appearancePushes.remove(member.userId());
        profileMemberships.remove(member);
        positionSampler.forget(member.userId());
        String facilityChannel = channels.channelOf(member.userId());
        String typingChannel = typing.disconnected(member.userId());
        if (typingChannel != null) { publishTyping(typingChannel, null, null, true); }
        // disconnected()가 내부에서 release()를 부르므로 해제 전 점유를 한 번만 읽어 종료를 한 번만 기록한다.
        var facilityLease = facilities.current(member.userId());
        facilities.disconnected(member.userId());
        // 점프맵 진행 중 네트워크 끊김은 15초 유예: 캐릭터와 채널 자리를 남기고 같은 채널 재입장 때 다시 묶는다.
        boolean jumpmapGrace = member.accountId() != null && switch (reason) {
            case SOCKET_CLOSED, TRANSPORT_ERROR, HEARTBEAT_TIMEOUT, SEND_ERROR, SEND_QUEUE_FULL -> true;
            default -> false;
        } && channels.suspendJumpmap(member.userId());
        WorldChannelRegistry.State channelState = jumpmapGrace ? null : channels.disconnect(member.userId());
        if (facilityLease != null) {
            publishFacilities(facilityChannel, null, null);
            recordFacility(member.accountId(), facilityLease, "DISCONNECTED");
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
            TableRoom waitingRoom = rooms.get(tableId);
            boolean networkClose = switch (reason) {
                case SOCKET_CLOSED, TRANSPORT_ERROR, HEARTBEAT_TIMEOUT, SEND_ERROR, SEND_QUEUE_FULL -> true;
                default -> false;
            };
            if (member.accountId() != null && networkClose && waitingRoom.manualStart()) {
                waitingReconnects.putIfAbsent(member.userId(), new WaitingReconnect(tableId, tableNow().plusSeconds(30), loginSessionId));
                return;
            }
            waitingReconnects.remove(member.userId());
            seating.remove(member.userId());
            TableRoom room = rooms.get(tableId);
            room.leave(member.userId());
            publish(room, null, null);
            recordTableLeft(member.accountId(), tableId, "DISCONNECT");
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        waitingReconnects.clear();
        loginSessions.clear();
        connectionStarted.clear();
        appearancePushes.clear();
        profileMemberships.clear();
        stopped = true;
        heartbeatTimer.shutdownNow();
        members.forEach((sessionId, member) -> {
            closeMember(member, ConnectionCloseReason.SERVER_SHUTDOWN);
            gameResults.ifPresent(service -> service.disconnected(sessionId));
        });
        members.clear();
        mapVerifiedSessions.clear();
        pendingMapConnections.clear();
        channels.clear();
        facilities.clear();
        follows.clear();
        chat.clear();
        typing.clear();
        spectatorEvents.clear();
        onecardPranks.clear();
        emotes.clear();
        seating.clear();
        seatedGames.clear();
        watching.clear();
        stateQueries.clear();
        statePushes.clear();
        stateLoads.clear();
        actionRequests.clear();
        starts.clear();
        reactionRounds.clear();
        parkDebris.clear();
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
        TableRoom room = joinableRoom(member, request);
        if (room == null) {
            return;
        }
        // 확정 시작을 쓰는 보드게임은 모두 DB 예약(0냥 포함)을 거친다. 이전 경기 예약이 남은 회원은 시작 단계에서
        // MEMBER_ALREADY_IN_GAME으로 거절되므로 착석 전에 같은 기준으로 본인에게만 알린다. 관전 요청은 이 경로를 쓰지 않는다.
        if (activeGames.isPresent() && committedStarts.isPresent() && member.accountId() != null) {
            if (joinChecks.containsKey(member.sessionId())) {
                fail(request, "TABLE_JOIN_CHECK_PENDING", "착석 가능 여부를 확인하고 있어요.");
            }
            JoinCheck check = new JoinCheck();
            joinChecks.put(member.sessionId(), check);
            check.timeout = heartbeatTimer.schedule(() -> completeJoin(member, request, check, null),
                    5, TimeUnit.SECONDS);
            ActiveGameLookup lookup = activeGames.get();
            long accountId = member.accountId();
            // DB 조회는 Hub 잠금 밖에서 실행하고, 완료 후 좌석·채널·대기 상태를 다시 확인한다.
            startWorkers.execute(() -> {
                Boolean active = null;
                try { active = lookup.findByUserId(accountId).isPresent(); }
                catch (RuntimeException ignored) {
                    // 조회 장애는 기존 착석 규칙을 따른다. 시작 단계의 중복 참가 검사가 그대로 남아 있다.
                }
                completeJoin(member, request, check, active);
            });
            return;
        }
        seat(member, request, room);
    }

    // 미정산 참가 확인 결과를 반영한다. 시간 초과(null)나 조회 실패는 기존 착석 규칙으로 처리한다.
    private synchronized void completeJoin(Member member, Request request, JoinCheck check, Boolean active) {
        if (stopped || members.get(member.sessionId()) != member || !joinChecks.remove(member.sessionId(), check)) {
            return;
        }
        if (check.timeout != null) { check.timeout.cancel(false); }
        try {
            // 조회 중에 바뀐 경기 복구·운반 상태도 디스패처와 같은 조건으로 다시 본다.
            if (member.accountId() != null && reconnect.isPresent()
                    && !reconnect.get().canUseLobby(member.accountId(), member.sessionId())
                    && !restoredChannelAccess(member, request)) {
                fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
            }
            if (channels.carryState(member.userId()) != null) {
                fail(request, "CARRY_ACTIVITY_CONFLICT", "들기·던지기가 끝난 뒤 다른 행동을 시작해주세요.");
            }
            TableRoom room = joinableRoom(member, request);
            if (room == null) {
                return;
            }
            if (Boolean.TRUE.equals(active)) {
                fail(request, "MEMBER_ALREADY_IN_GAME",
                        "이전 경기가 아직 진행 중이에요. 해당 경기가 종료되면 새로운 게임을 시작할 수 있어요.");
            }
            seat(member, request, room);
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        }
    }

    // 기존 착석 조건. 이미 같은 테이블에 앉아 있으면 현재 상태만 다시 보내고 null을 돌려준다(재접속 좌석 복구 포함).
    private TableRoom joinableRoom(Member member, Request request) {
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
            return null;
        }
        if (stoneRumbleTable(tableId)) {
            if (!stoneRumbleEnabled) {
                fail(request, "UNSUPPORTED_GAME", "돌탑 생존전은 현재 이용할 수 없습니다.");
            }
            var position = channels.positionOf(member.userId());
            if (position == null || !preparedPark.canEnterStoneRumble(position.x(), position.y(), position.z())) {
                fail(request, "TOO_FAR", "대석탑 정원의 돌탑 생존전 입구에서 입장해주세요.");
            }
        }
        ensureWaiting(tableId, request);
        return room;
    }

    private boolean stoneRumbleTable(String tableId) {
        return preparedPark != null && PreparedParkMap.STONE_RUMBLE_ANCHOR_ID.equals(tableAnchors.get(tableId));
    }

    private void ensureGameAllowedAtTable(String tableId, TableGame game, Request request) {
        if ((game == TableGame.STONE_RUMBLE && preparedPark != null && (!stoneRumbleEnabled || !stoneRumbleTable(tableId)))
                || (stoneRumbleTable(tableId) && game != TableGame.STONE_RUMBLE)) {
            fail(request, "UNSUPPORTED_GAME", "이 테이블에서 이용할 수 없는 게임입니다.");
        }
    }

    private void seat(Member member, Request request, TableRoom room) {
        String tableId = room.snapshot().tableId();
        if (!room.join(member.userId())) {
            fail(request, "TABLE_FULL", "빈 좌석이 없습니다.");
        }
        seating.put(member.userId(), tableId);
        channels.stopMovement(member.userId());
        clearWatch(member, null);
        clearGameWatch(member);
        publish(room, member, request.requestId());
        replyStartState(member, tableId, null);
        cancelEmote(member.userId(), "ACTIVITY_STARTED");
        endFollows(member.userId());
        recordBehavior(BehaviorEventType.TABLE_JOINED, member.accountId(),
                builder -> builder.tableId(tableId).channelId(tableChannels.get(tableId)));
    }

    /** 복구된 원래 채널의 조회와 무료 경기 참가자 본인의 조작 점유만 허용한다. 로비 권한은 주지 않는다. */
    private boolean restoredChannelAccess(Member member, Request request) {
        if (member.accountId() == null || reconnect.isEmpty()) return false;
        String freeChannel = request.type().equals("CHANNEL_JOIN")
                ? request.payload().path("channelId").asText() : channels.channelOf(member.userId());
        if ((request.type().equals("CHANNEL_JOIN")
                || Set.of("WORLD_FACILITY_CATALOG", "WORLD_FACILITY_CHECK", "WORLD_FOLLOW_CHECK",
                        "WORLD_INTERACTION_SET").contains(request.type()))
                && reconnect.get().canResumeUnreservedChannel(member.accountId(), member.sessionId(), freeChannel)) {
            return true;
        }
        String tableId = seating.get(member.userId()), gameId = seatedGames.get(member.userId());
        String channel = tableId == null ? null : tableChannels.get(tableId);
        if (channel == null || gameId == null || !reconnect.get().canControlGame(member.accountId(), member.sessionId(), gameId)) return false;
        if (request.type().equals("CHANNEL_JOIN")) return channel.equals(request.payload().get("channelId").textValue());
        return Set.of("WORLD_FACILITY_CATALOG", "WORLD_FACILITY_CHECK", "WORLD_FOLLOW_CHECK").contains(request.type())
                && channels.isInChannel(member.userId(), channel);
    }

    private void joinChannel(Member member, Request request) {
        String channelId = request.payload().get("channelId").textValue();
        // 정산 대기 좌석을 보존한 재접속자는 원래 테이블 채널로 돌아올 수 있다.
        if (seating.containsKey(member.userId()) && !channels.isInChannel(member.userId(), channelId)
                && !channelId.equals(tableChannels.get(seating.get(member.userId())))) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        long joinStarted = System.nanoTime();
        WorldChannelRegistry.Change change = channels.join(member.userId(), channelId);
        if (change.changed()) {
            emptyChannelsSince.remove(channelId);
            try { ensureSpareChannel(); }
            catch (RuntimeException exception) { log.error("예비 운영 채널 생성 실패", exception); }
        }
        if (change.changed()) {
            String previousTyping = typing.remove(member.userId());
            if (previousTyping != null) { publishTyping(previousTyping, null, null, true); }
        }
        syncWorldTableSeats(channelId);
        Long connectedAt = connectionStarted.remove(member.sessionId());
        log.debug("공원 입장 서버 준비 joinMs={} connectedToJoinMs={} map={}",
                (System.nanoTime() - joinStarted) / 1_000_000.0,
                connectedAt == null ? null : (System.nanoTime() - connectedAt) / 1_000_000.0, maps.metadata().mapVersion());
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
        publishTyping(channelId, member, null, false);
        sendParkDebris(member, channelId);
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

    private void publishTyping(String channel, Member actor, String requestId, boolean broadcast) {
        var state = typing.state(channel);
        for (Member target : members.values()) {
            if ((broadcast || target == actor) && channels.isInChannel(target.userId(), channel)) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "WORLD_CHAT_TYPING_STATE", state));
            }
        }
    }

    private void leaveChannel(Member member, Request request) {
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        var facilityLease = facilities.release(member.userId());
        if (facilityLease != null) {
            recordFacility(member.accountId(), facilityLease, "CHANNEL_LEFT");
        }
        WorldChannelRegistry.State state = channels.leave(member.userId());
        String typingChannel = typing.remove(member.userId());
        if (typingChannel != null) { publishTyping(typingChannel, null, null, true); }
        endFollows(member.userId());
        cancelEmote(member.userId(), "CHANNEL_LEFT");
        if (facilityLease != null) {
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
            syncSpectatorPresence();
            var worlds = channels.advance(Set.copyOf(seating.keySet()), follows.activeStates());
            dispatchJumpmap(channels.drainJumpmap());
            for (var ended : channels.drainSuspensionEnds()) {
                publishChannel(ended, null, null);
                publishWorld(channels.worldState(ended.channelId()), null, null);
            }
            for (var following : follows.activeStates()) {
                pruneFollows(channels.worldState(following.channelId()));
            }
            for (var state : worlds) {
                for (var avatar : state.avatars()) {
                    if (avatar.position().moving() || avatar.position().swimming()) {
                        cancelEmote(avatar.userId(), "MOVEMENT");
                    }
                }
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

    /** 점프맵 판정 신호는 레지스트리 잠금 밖에서 넘긴다. 서비스가 없으면 버린다. */
    private void dispatchJumpmap(java.util.List<WorldChannelRegistry.JumpmapDelivery> deliveries) {
        if (deliveries.isEmpty()) return;
        jumpmapSignals.accept(deliveries);
    }

    private void moveWorld(Member member, Request request) {
        if (facilities.current(member.userId()) != null) {
            fail(request, "FACILITY_BUSY", "먼저 시설 이용을 종료해주세요.");
        }
        if (seating.containsKey(member.userId())) {
            fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        }
        var payload = request.payload();
        var input = com.ssafy.ontop.world.movement.MoveInput.parse(payload);
        WorldChannelRegistry.WorldChange change = channels.input(member.userId(),
                input);
        if (change.changed()) {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
            refreshWatchRange(member);
        } else {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
        }
        if (change.changed() && (input.dx() != 0 || input.dz() != 0 || input.jump())) {
            follows.stopFollowing(member.userId()).forEach(state -> publishFollow(state, null, null));
            cancelEmote(member.userId(), "MOVEMENT");
        }
    }

    private void positionWorld(Member member, Request request) {
        if (facilities.current(member.userId()) != null) fail(request, "FACILITY_BUSY", "먼저 시설 이용을 종료해주세요.");
        if (seating.containsKey(member.userId())) fail(request, "TABLE_BUSY", "먼저 테이블에서 퇴장해주세요.");
        var before = channels.positionOf(member.userId());
        var report = com.ssafy.ontop.world.movement.ClientPositionValidator.Candidate.parse(request.payload());
        var change = channels.reportPosition(member.userId(), report);
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_STATE", change.state()));
        var after = channels.positionOf(member.userId());
        if (before != null && after != null && after.lastInputSeq() == report.seq()
                && before.lastInputSeq() < report.seq() && (report.manual() || report.jump()
                || Math.hypot(after.x() - before.x(), after.z() - before.z()) > .0001
                || Math.abs(after.y() - before.y()) > .0001)) {
            if (report.manual()) follows.stopFollowing(member.userId()).forEach(state -> publishFollow(state, null, null));
            if (after.moving() || Math.abs(after.y() - before.y()) > .01) cancelEmote(member.userId(), "MOVEMENT");
            refreshWatchRange(member);
        }
    }

    private void sendChat(Member member, Request request) {
        StatePush scope = statePushes.get(member.sessionId());
        if (!isolatedChatGame(member).isEmpty()) {
            fail(request, "GAME_CHAT_REQUIRED", "경기 중에는 경기 전용 채팅을 이용해주세요.");
        }
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
        var aiAudience = new java.util.ArrayList<String>();
        aiAudience.add(member.userId());
        for (Member target : members.values()) {
            if (target != member && isolatedChatGame(target).isEmpty() && proximity.canHear(member.userId(), target.userId())) {
                target.peer().offer(notice);
                recipients++;
                aiAudience.add(target.userId());
            }
        }
        var bridge = aiBridge;
        var position = bridge == null ? null : channels.positionOf(member.userId());
        if (bridge != null) {
            String nickname = channels.worldState(channelId).avatars().stream()
                    .filter(a -> a.userId().equals(member.userId())).map(a -> a.nickname() == null ? member.userId() : a.nickname())
                    .findFirst().orElse(member.userId());
            bridge.chat(new com.ssafy.ontop.ai.WorldAiBridge.Chat(message.messageId(), channelId,
                    member.userId(), nickname, message.text(), java.time.Instant.parse(message.sentAt()).toEpochMilli(),
                    position==null?0:position.x(), position==null?0:position.y(), position==null?0:position.z(),
                    java.util.List.copyOf(aiAudience), "", position==null));
        }
        // 채팅 본문은 남기지 않고 길이와 받은 사람 수만 남긴다.
        int heard = recipients;
        recordBehavior(BehaviorEventType.CHAT_SENT, member.accountId(), builder -> builder.channelId(channelId)
                .prop("length", message.text().codePointCount(0, message.text().length()))
                .prop("recipients", heard));
    }

    private volatile com.ssafy.ontop.ai.WorldAiBridge aiBridge;

    /** Enabled only by the explicit local AI profile. No provider call runs under the hub lock. */
    public synchronized void aiBridge(com.ssafy.ontop.ai.WorldAiBridge bridge) { this.aiBridge = bridge; }

    // Local practice leases never register fake accounts, start reservations or wallet transactions.
    private final Map<String,String> aiPracticeSeats=new HashMap<>();
    private final Map<String,String> aiPracticeGames=new HashMap<>();
    public record AiTable(String tableId,String channelId,String owner,long version,double x,double y,double z,int ownerSeat) {
        public AiTable(String tableId,String channelId,String owner,long version,double x,double y,double z){this(tableId,channelId,owner,version,x,y,z,1);}
    }
    public synchronized List<AiTable> aiWaitingOmok() {
        if(aiBridge==null) return List.of();
        var result=new ArrayList<AiTable>();
        for(var room:rooms.values()) {
            var s=room.snapshot(); var occupied=s.seats().stream().filter(p -> p.userId()!=null).toList();
            var start=starts.get(s.tableId());
            if(!"OMOK".equals(s.gameCode()) || occupied.size()!=1 || aiPracticeSeats.containsKey(s.tableId())
                    || start!=null && start.frozen()) continue;
            String owner=occupied.getFirst().userId(); var p=channels.positionOf(owner);
            if(p!=null && members.values().stream().anyMatch(m -> m.userId().equals(owner) && isMapReady(m)))
                result.add(aiTableLocation(s.tableId(),owner,s.version(),p.x(),p.y(),p.z()));
        }
        return List.copyOf(result);
    }
    public synchronized boolean aiReserveOmok(AiTable expected,String npc) {
        if(!aiWaitingOmok().contains(expected)) return false;
        var room=rooms.get(expected.tableId());
        room.selectGame(com.ssafy.ontop.table.domain.TableGame.OMOK,null,0);
        if(!room.join(npc)) return false;
        aiPracticeSeats.put(expected.tableId(),npc); publish(room,null,null); return true;
    }
    public synchronized void aiBindPracticeGame(String table,String npc,String game) {
        if(!npc.equals(aiPracticeSeats.get(table)))throw new IllegalArgumentException("NPC 좌석 예약 없음");
        aiPracticeGames.put(table,game);
    }
    public synchronized String aiPracticeChatGame(String user) {
        String table=seating.get(user);if(table==null){table=watching.get(user);if(table!=null&&!proximity.canWatch(user,table,tableChannels.get(table)))return "";}
        if(table==null||!aiPracticeSeats.containsKey(table))return "";
        String channel=tableChannels.get(table);
        return channels.isInChannel(user,channel)&&members.values().stream().anyMatch(m->m.userId().equals(user)&&isMapReady(m))?aiPracticeGames.getOrDefault(table,""):"";
    }
    private String isolatedChatGame(Member member) {
        String practice=aiPracticeChatGame(member.userId());if(!practice.isEmpty())return practice;
        String seated=seatedGames.get(member.userId());var attempt=starts.get(seating.get(member.userId()));
        if(seated!=null&&attempt!=null&&(attempt.phase().equals("PLAYING")||attempt.phase().equals("SETTLING"))
                &&seated.equals(attempt.view(0,false).gameSessionId()))return seated;
        var scope=statePushes.get(member.sessionId());
        if(scope!=null&&scope.member==member&&"PLAYING".equals(scope.status)
                &&scope.role==GameStateView.Role.SPECTATOR&&approvedSpectator(member.sessionId(),member,scope.gameId)!=null)return scope.gameId;
        return "";
    }
    public synchronized boolean aiPracticeValid(String table,String owner,String npc) {
        return aiBridge!=null && npc.equals(aiPracticeSeats.get(table)) && table.equals(seating.get(owner))
                && members.values().stream().anyMatch(m -> m.userId().equals(owner) && isMapReady(m))
                && rooms.get(table).snapshot().seats().stream().anyMatch(s -> npc.equals(s.userId()));
    }
    public synchronized void aiReleaseOmok(String table,String npc) {
        if(!npc.equals(aiPracticeSeats.get(table))) return;
        aiPracticeSeats.remove(table);aiPracticeGames.remove(table); var room=rooms.get(table);
        if(room!=null) { if(room.snapshot().seats().stream().anyMatch(s -> npc.equals(s.userId()))) room.leave(npc); publish(room,null,null); }
    }
    public synchronized AiTable aiOmokLocation(String tableId) {
        var room=rooms.get(tableId);if(room==null)return null;
        for(var seat:room.snapshot().seats()) if(seat.userId()!=null) {
            var p=channels.positionOf(seat.userId());
            if(p!=null)return aiTableLocation(tableId,seat.userId(),room.snapshot().version(),p.x(),p.y(),p.z());
        }
        return null;
    }
    private AiTable aiTableLocation(String table,String owner,long version,double x,double y,double z) {
        if(preparedPark!=null) {var p=preparedPark.proximity().tables().get(table);if(p!=null){x=p.x();z=p.z();}}
        int seat=rooms.get(table).snapshot().seats().stream().filter(s -> owner.equals(s.userId())).mapToInt(TableRoom.Seat::seatNumber).findFirst().orElse(1);
        return new AiTable(table,tableChannels.get(table),owner,version,x,y,z,seat);
    }

    public synchronized java.util.Map<String,java.util.Map<String,com.ssafy.ontop.world.movement.ParkNavigation.Point>> aiActors() {
        var worlds=new java.util.LinkedHashMap<String,java.util.Map<String,com.ssafy.ontop.world.movement.ParkNavigation.Point>>();
        for(Member member:members.values()) {
            String channel=channels.channelOf(member.userId()); var p=channels.positionOf(member.userId());
            if(channel!=null && p!=null) worlds.computeIfAbsent(channel,ignored -> new java.util.LinkedHashMap<>())
                    .put(member.userId(),new com.ssafy.ontop.world.movement.ParkNavigation.Point(p.x(),p.y(),p.z()));
        }
        return worlds;
    }
    public synchronized void publishAiNpcs(String channelId,Object payload) {
        String encoded=protocol.encode(null,"WORLD_AI_NPCS",payload);
        for(Member member:members.values()) if(channels.isInChannel(member.userId(),channelId)) member.peer().offer(encoded);
    }
    public synchronized java.util.Set<String> aiJumpmapActors() {
        return members.values().stream().map(Member::userId).filter(id -> channels.jumpmapRun(id).isPresent())
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    public synchronized void publishAi(String channelId, java.util.List<String> audience, String type, Object payload) {
        publishAi(channelId,audience,type,payload,"");
    }
    public synchronized void publishAi(String channelId, java.util.List<String> audience, String type, Object payload, String gameId) {
        String encoded = protocol.encode(null, type, payload);
        for (Member member : members.values()) {
            if (!gameId.isEmpty()) {
                StatePush scope=statePushes.get(member.sessionId());
                if (!gameId.equals(isolatedChatGame(member))) continue;
            }
            if(gameId.isEmpty()&&(type.equals("WORLD_AI_POLICE")||type.equals("WORLD_AI_COMPANION_SPEECH"))&&!isolatedChatGame(member).isEmpty())continue;
            if (audience.contains(member.userId()) && channels.isInChannel(member.userId(), channelId))
                member.peer().offer(encoded);
        }
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
        boolean reachable = preparedPark == null
                ? Math.hypot(position.x() - x, position.z() - z) <= 2.6 && Math.abs(position.y() - y) <= 0.7
                : preparedPark.feedback().contains(position.x(), position.y(), position.z());
        if (!reachable) {
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
        boolean reachable = preparedPark == null
                ? Math.hypot(position.x() - x, position.z() - z) <= 2.6 && Math.abs(position.y() - y) < 0.7
                : preparedPark.notes().contains(position.x(), position.y(), position.z());
        if (!reachable) {
            throw new com.ssafy.ontop.notes.service.NoteException(403, "NOTES_OUT_OF_RANGE",
                    "익명 메모함 가까이 같은 높이에서 작성해주세요.");
        }
    }

    /** 무료 협동 경기 입장은 최신 맵의 VR 입구·현재 인증 소켓에서만 허용한다. */
    public synchronized void requireSkewerEntry(long userId, String channelId, boolean existingRoom) {
        requireSkewerAccess(userId, channelId, !existingRoom, !existingRoom);
    }

    /** 이미 입장한 대기자는 거리만 면제하며 다른 게임·시설 이용 여부는 계속 확인한다. */
    public synchronized void requireSkewerWaitingPlayer(long userId, String channelId) {
        requireSkewerAccess(userId, channelId, true, false);
    }

    private void requireSkewerAccess(long userId, String channelId, boolean checkLobby, boolean checkEntrance) {
        String identity = Long.toString(userId);
        var position = channels.positionOf(identity);
        var connected = members.entrySet().stream()
                .filter(entry -> Long.valueOf(userId).equals(entry.getValue().accountId())).findFirst();
        if (connected.isEmpty() || !mapVerifiedSessions.contains(connected.get().getKey())
                || !channels.isInChannel(identity, channelId) || position == null) {
            throw new IllegalStateException("연결된 공원과 최신 맵을 확인해주세요.");
        }
        if (seating.containsKey(identity) || facilities.current(identity) != null || position.swimming()
                || checkLobby && reconnect.isPresent()
                        && !reconnect.get().canUseLobby(userId, connected.get().getKey())) {
            throw new IllegalStateException("진행 중인 게임·시설 이용을 먼저 종료해주세요.");
        }
        if (checkEntrance && (preparedPark == null
                || preparedPark.vrEntrance().filter(reach -> reach.contains(
                        position.x(), position.y(), position.z())).isEmpty())) {
            throw new IllegalStateException("같은 공원의 VR 체험관 입구에서 만나주세요.");
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
                        "fitnessRewardsEnabled", fitnessRewards != null && fitnessRewards.enabled(),
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
                cancelEmote(member.userId(), "ACTIVITY_STARTED");
                // 같은 요청 재전송은 위에서 점유 버전이 그대로라 반환되므로 새 이용으로 기록되지 않는다.
                recordFacility(member.accountId(), lease, null);
                endFollows(member.userId());
            }
            case "WORLD_FACILITY_RELEASE" -> {
                var lease = facilities.requireOwner(member.userId(), payload.path("leaseId").asText());
                var exit = channels.facilityExit(member.userId(), lease);
                if (exit == null) {
                    fail(request, "FACILITY_EXIT_BLOCKED", "하차 위치가 막혀 있습니다. 잠시 후 다시 시도해주세요.");
                }
                channels.releaseFacility(member.userId(), exit);
                var released = facilities.release(member.userId());
                publishFacilities(channel, member, request.requestId());
                publishWorld(channels.worldState(channel), null, null);
                // 하차 위치가 막히면 위에서 실패하므로 종료로 기록하지 않는다.
                if (released != null) {
                    recordFacility(member.accountId(), released, "RELEASED");
                }
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

    private void follow(Member member, Request request) {
        String channel = channels.channelOf(member.userId());
        if (channel == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        pruneFollows(channels.worldState(channel));
        long before = follows.state(channel).version();
        WorldFollowService.State state;
        switch (request.type()) {
            case "WORLD_FOLLOW_CHECK" -> {
                member.peer().offer(protocol.encode(request.requestId(), "WORLD_FOLLOW_STATE", follows.state(channel)));
                return;
            }
            case "WORLD_FOLLOW_START" -> {
                String targetId = request.payload().path("targetId").asText();
                if (!channels.isInChannel(targetId, channel)) {
                    fail(request, "FOLLOW_TARGET_UNAVAILABLE", "같은 채널의 연결된 사용자를 선택해주세요.");
                }
                if (!canFollow(member.userId()) || !canFollow(targetId)) {
                    fail(request, "FOLLOW_ACTIVITY_CONFLICT", "수영·시설·경기 이용을 마친 뒤 사용해주세요.");
                }
                state = follows.start(channel, member.userId(), targetId,
                        channels.positionOf(member.userId()), channels.positionOf(targetId));
                if (state.version() != before) {
                    channels.stopMovement(member.userId());
                    var world = channels.serverMovement(member.userId());
                    if (world.changed()) publishWorld(world.state(), null, null);
                }
            }
            case "WORLD_FOLLOW_STOP" -> state = follows.stop(channel, member.userId(),
                    request.payload().path("followId").asText());
            default -> throw new IllegalStateException("검증되지 않은 따라가기 명령");
        }
        if (state.version() == before) {
            member.peer().offer(protocol.encode(request.requestId(), "WORLD_FOLLOW_STATE", state));
        } else {
            if (request.type().equals("WORLD_FOLLOW_STOP")) {
                channels.stopMovement(member.userId());
            }
            publishFollow(state, member, request.requestId());
            if (request.type().equals("WORLD_FOLLOW_START")) {
                cancelEmote(member.userId(), "ACTIVITY_STARTED");
            }
        }
    }

    private boolean canFollow(String userId) {
        var position = channels.positionOf(userId);
        return position != null && !position.swimming() && !seating.containsKey(userId)
                && channels.carryState(userId) == null
                && facilities.current(userId) == null;
    }

    private void pruneFollows(WorldChannelRegistry.WorldState world) {
        var previous = follows.state(world.channelId());
        if (previous.links().isEmpty()) {
            return;
        }
        Map<String, WorldChannelRegistry.Position> positions = world.avatars().stream()
                .collect(Collectors.toMap(WorldChannelRegistry.Avatar::userId, WorldChannelRegistry.Avatar::position));
        Set<String> unavailable = positions.keySet().stream().filter(user -> !canFollow(user))
                .collect(Collectors.toSet());
        var state = follows.prune(world.channelId(), positions, unavailable);
        if (state.version() != previous.version()) {
            Set<String> retained = state.links().stream().map(WorldFollowService.Link::followerId)
                    .collect(Collectors.toSet());
            previous.links().stream().filter(link -> !retained.contains(link.followerId()))
                    .forEach(link -> channels.stopMovement(link.followerId()));
            publishFollow(state, null, null);
        }
    }

    private void endFollows(String userId) {
        var affected = follows.activeStates().stream().flatMap(state -> state.links().stream())
                .filter(link -> link.followerId().equals(userId) || link.targetId().equals(userId)).toList();
        follows.removeUser(userId).forEach(state -> publishFollow(state, null, null));
        affected.forEach(link -> channels.stopMovement(link.followerId()));
    }

    private void publishFollow(WorldFollowService.State state, Member actor, String requestId) {
        for (Member target : members.values()) {
            if (channels.isInChannel(target.userId(), state.channelId())) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "WORLD_FOLLOW_STATE", state));
            }
        }
    }

    private void sendEmote(Member member, Request request) {
        String channelId = channels.channelOf(member.userId());
        if (channelId == null) {
            fail(request, "NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        var position = channels.positionOf(member.userId());
        if (position == null) {
            fail(request, "WORLD_POSITION_REQUIRED", "광장 위치를 확인해주세요.");
        }
        if (channels.carryState(member.userId()) != null || seating.containsKey(member.userId())
                || facilities.current(member.userId()) != null
                || position.moving() || position.running() || position.swimming()
                || channels.hasMovementActivity(member.userId())) {
            fail(request, "EMOTE_ACTIVITY_CONFLICT", "이동·수영·테이블·시설 이용을 마친 뒤 사용해주세요.");
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

    private void cancelEmote(String userId, String reason) {
        WorldEmoteService.Cancellation event = emotes.cancel(userId, reason);
        if (event == null) {
            return;
        }
        String notification = protocol.encode(null, "WORLD_EMOTE_CANCELLED", event);
        for (Member target : members.values()) {
            if (channels.isInChannel(target.userId(), event.channelId())) {
                target.peer().offer(notification);
            }
        }
    }

    private void carry(Member member, Request request) {
        String userId = member.userId();
        if (request.type().equals("WORLD_CARRY_RELEASE")) {
            publishWorld(channels.releaseCarry(userId, request.payload().path("carryId").asText()),
                    member, request.requestId());
            return;
        }
        String targetId = request.payload().path("targetId").asText();
        if (request.type().equals("WORLD_CARRY_THROW")) {
            var current = channels.carryState(userId);
            if (current != null) { targetId = current.partnerId(); }
        }
        String channel = channels.channelOf(userId);
        String partnerId = targetId;
        if (channel == null || !channels.isInChannel(targetId, channel) || !members.values().stream()
                .anyMatch(target -> target.userId().equals(partnerId))) {
            fail(request, "CARRY_TARGET_UNAVAILABLE", "같은 채널의 연결된 사용자를 선택해주세요.");
        }
        if (carryBusy(userId) || carryBusy(targetId)) {
            fail(request, "CARRY_ACTIVITY_CONFLICT", "상대방과 본인의 게임·시설·다른 행동을 마친 뒤 사용해주세요.");
        }
        WorldChannelRegistry.WorldState state;
        if (request.type().equals("WORLD_CARRY_PICKUP")) {
            state = channels.pickup(userId, targetId);
        } else {
            var payload = request.payload();
            state = channels.throwCarried(userId, payload.path("carryId").asText(), payload.path("dx").asDouble(),
                    payload.path("dy").asDouble(), payload.path("dz").asDouble());
        }
        publishWorld(state, member, request.requestId());
    }

    private void interactionBusy(Member member, Request request) {
        var change = channels.interactionBusy(member.userId(), request.payload().path("busy").asBoolean(),
                request.payload().has("vrActive") ? request.payload().path("vrActive").asBoolean() : null);
        Map<String, Object> payload = new HashMap<>();
        payload.put("channelId", change.channelId());
        payload.put("busy", change.busy());
        if (request.payload().has("vrActive")) {
            payload.put("vrActive", change.vrActive());
        }
        member.peer().offer(protocol.encode(request.requestId(), "WORLD_INTERACTION_STATE",
                payload));
        if (change.released() != null) {
            publishWorld(change.released(), null, null);
        }
    }

    private boolean carryBusy(String userId) {
        return seating.containsKey(userId) || facilities.current(userId) != null || emotes.isActive(userId)
                || !channels.carryAvailable(userId)
                || follows.activeStates().stream().flatMap(state -> state.links().stream())
                        .anyMatch(link -> link.followerId().equals(userId) || link.targetId().equals(userId));
    }

    private void publishWorld(WorldChannelRegistry.WorldState state, Member actor, String requestId) {
        Set<String> recipients = state.avatars().stream().map(WorldChannelRegistry.Avatar::userId)
                .collect(Collectors.toSet());
        String notification = null;
        for (Member target : members.values()) {
            if (recipients.contains(target.userId())) {
                if (target == actor && requestId != null) {
                    target.peer().offer(protocol.encode(requestId, "WORLD_STATE", state));
                } else {
                    // 같은 방송의 공개 상태만 재사용한다. 요청 응답과 다음 버전은 별도로 직렬화한다.
                    if (notification == null) {
                        notification = protocol.encode(null, "WORLD_STATE", state);
                    }
                    target.peer().offer(notification);
                }
            }
        }
    }

    /** 공개 게시판 변경 번호만 모든 입장 채널에 전파한다. 본문·작성자 정보는 포함하지 않는다. */
    public synchronized void notesChanged(long revision) {
        if (stopped || revision <= 0) { return; }
        String message = protocol.encode(null, "NOTES_CHANGED", Map.of("revision", Long.toString(revision)));
        for (Member member : members.values()) {
            if (isMapReady(member) && channels.channelOf(member.userId()) != null) { member.peer().offer(message); }
        }
    }

    @org.springframework.transaction.event.TransactionalEventListener(
            phase = org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public synchronized void personalNotificationChanged(
            com.ssafy.ontop.notification.service.PersonalNotificationChanged event) {
        if (stopped) { return; }
        String message = protocol.encode(null, "PERSONAL_NOTIFICATION_CHANGED",
                Map.of("notificationId", event.notificationId()));
        for (Member member : members.values()) {
            if (member.userId().equals(Long.toString(event.userId()))) { member.peer().offer(message); }
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
        TableRoom room = readyRoom(member, request);
        boolean ready = request.payload().get("ready").booleanValue();
        if (!ready) {
            cancelReadyBalance(member.userId());
        }
        if (ready && readyBalances.isPresent() && !"STONE_RUMBLE".equals(room.snapshot().gameCode())) {
            if (member.accountId() == null) { fail(request, "READY_AUTH_REQUIRED", "로그인 상태를 확인해주세요."); }
            if (readyBalanceChecks.containsKey(member.sessionId())) {
                fail(request, "READY_CHECK_PENDING", "사용 가능 잔액을 확인하고 있습니다.");
            }
            ReadyBalanceCheck check = new ReadyBalanceCheck(room, request.requestId());
            readyBalanceChecks.put(member.sessionId(), check);
            check.timeout = heartbeatTimer.schedule(() -> completeReadyBalance(member, request, check, null),
                    5, TimeUnit.SECONDS);
            ReadyBalanceGateway balances = readyBalances.get();
            startWorkers.execute(() -> {
                Long available = null;
                try { available = balances.availableBalance(member.accountId()); }
                catch (RuntimeException ignored) { /* Fail closed without returning DB exception details. */ }
                completeReadyBalance(member, request, check, available);
            });
            return;
        }
        applyReady(member, request, room);
    }

    private synchronized void completeReadyBalance(Member member, Request request, ReadyBalanceCheck check, Long available) {
        if (stopped || members.get(member.sessionId()) != member
                || !readyBalanceChecks.remove(member.sessionId(), check)) return;
        check.timeout.cancel(false);
        try {
            TableRoom room = readyRoom(member, request); // Recheck seat/settings/start after the async DB read.
            if (room != check.room) { fail(request, "READY_CHECK_CANCELLED", "좌석이 변경되어 준비 확인을 취소했어요."); }
            if (available == null || available < 0) {
                fail(request, "READY_BALANCE_UNAVAILABLE", "사용 가능 잔액을 확인하지 못해 준비하지 않았어요. 잠시 후 다시 시도해주세요.");
            }
            long bet = room.snapshot().betAmountPerPlayer();
            if (available < bet) {
                if (room.setReady(member.userId(), false)) publish(room, null, null);
                fail(request, "INSUFFICIENT_BALANCE", "판돈 " + bet + "냥 / 사용 가능 " + available
                        + "냥 — " + (bet - available) + "냥 부족해 준비할 수 없어요.");
            }
            applyReady(member, request, room);
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        }
    }

    private TableRoom readyRoom(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request);
        if (request.payload().get("ready").booleanValue()
                && (room.snapshot().gameCode() == null || room.snapshot().betAmountPerPlayer() == null)) {
            fail(request, "GAME_NOT_SELECTED", "먼저 게임을 선택해주세요.");
        }
        boolean ready = request.payload().get("ready").booleanValue();
        // receive의 같은 Hub 모니터 안에서 동의 검증과 준비 변경을 원자적으로 수행한다.
        if (ready && !room.matchesReadyBet(request.payload().get("betAmountPerPlayer").longValue())) {
            fail(request, "GAME_BET_CHANGED", "참가비가 변경되었습니다. 현재 금액을 확인해주세요.");
        }
        if (ready && !room.acceptsReadyVersion(request.payload().get("expectedVersion").longValue())) {
            fail(request, "GAME_SETTINGS_CHANGED", "테이블 설정이 변경되었습니다. 현재 상태를 확인해주세요.");
        }
        return room;
    }

    private void cancelReadyBalance(String userId) {
        for (Member target : members.values()) {
            if (!target.userId().equals(userId)) continue;
            ReadyBalanceCheck check = readyBalanceChecks.remove(target.sessionId());
            if (check == null) continue;
            check.timeout.cancel(false);
            target.peer().offer(protocol.error(check.requestId, "READY_CHECK_CANCELLED", "준비 확인이 취소됐어요. 현재 좌석에서 다시 준비해주세요."));
        }
    }

    private void applyReady(Member member, Request request, TableRoom room) {
        boolean ready = request.payload().get("ready").booleanValue();
        if (room.setReady(member.userId(), ready)) {
            publish(room, member, request.requestId());
            recordBehavior(BehaviorEventType.TABLE_READY_SET, member.accountId(),
                    builder -> builder.tableId(room.snapshot().tableId()).prop("ready", ready));
            if (!room.manualStart()) { beginStartIfReady(room); }
        } else {
            replyState(member, request, room);
        }
    }

    private void selectGame(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        if (room.manualStart()) { fail(request, "TABLE_CONFIGURATION_REQUIRED", "태블릿 설정 명령을 사용해주세요."); }
        String tableId = room.snapshot().tableId();
        ensureWaiting(tableId, request);
        if (!room.isSelector(member.userId())) {
            fail(request, "NOT_GAME_SELECTOR", "먼저 착석한 참가자만 게임을 선택할 수 있습니다.");
        }
        TableGame game = TableGame.find(request.payload().get("gameCode").textValue());
        if (game == null) {
            fail(request, "UNSUPPORTED_GAME", "지원하지 않는 게임입니다.");
        }
        ensureGameAllowedAtTable(tableId, game, request);
        long occupied = room.snapshot().seats().stream().filter(seat -> seat.userId() != null).count();
        if (occupied > game.maximumPlayers()) {
            fail(request, "GAME_PLAYER_LIMIT", "참가자가 선택한 게임의 최대 인원보다 많습니다.");
        }
        Integer targetScore = request.payload().has("targetScore") ? request.payload().get("targetScore").intValue() : null;
        if (game == TableGame.DICE && targetScore == null) {
            fail(request, "GAME_OPTIONS_REQUIRED", "주사위 목표 2000/4000/6000점 중 하나를 선택해주세요.");
        }
        long amount = request.payload().get("betAmountPerPlayer").longValue();
        if (game == TableGame.STONE_RUMBLE && amount != 0) {
            fail(request, "GAME_INVALID_BET", "돌탑 생존전은 무료로 참가해요.");
        }
        try { com.ssafy.ontop.game.domain.GameAmounts.validate(amount, game.maximumPlayers()); }
        catch (IllegalArgumentException exception) {
            fail(request, "GAME_INVALID_BET", "참가비가 지원 범위를 벗어났습니다.");
        }
        if (room.selectGame(game, targetScore, amount)) {
            starts.remove(tableId);
            publish(room, member, request.requestId());
            publishStart(tableId);
            recordBehavior(BehaviorEventType.GAME_SELECTED, member.accountId(), builder -> builder.tableId(tableId)
                    .prop("gameCode", game.name()).prop("targetScore", targetScore).prop("betAmountPerPlayer", amount)
                    .prop("startMode", "AUTO"));
        } else {
            replyState(member, request, room);
        }
    }

    /**
     * 할리갈리 자연 탈락자(eliminated=true, forfeited=false)는 경기 중에도 좌석만 놓는다. 엔진 판정은 Hub 잠금 밖에서
     * 최신 공개 상태로 확인한다. 기권이 아니므로 이탈 이벤트·이탈 기록을 만들지 않고 경기 참가·예약은 그대로 둔다.
     * 대상이 아니면 false를 돌려 기존 TABLE_LEAVE 규칙을 그대로 따른다.
     */
    private boolean leaveAsEliminated(String sessionId, Member member, Request request) {
        String gameId = eliminatedLeaveGame(member);
        if (gameId == null) {
            return false;
        }
        if (!eliminatedLeaves.add(sessionId)) {
            fail(request, "TABLE_LEAVE_PENDING", "테이블 퇴장을 확인하고 있어요.");
        }
        String tableId = seating.get(member.userId());
        long accountId = member.accountId();
        GameStateGateway states = gameStates.orElseThrow();
        startWorkers.execute(() -> {
            boolean eliminated = false;
            try {
                eliminated = naturallyEliminated(states.load(accountId, gameId).orElse(null), accountId, gameId);
            } catch (RuntimeException exception) {
                // 엔진 예외 내용은 전송·기록하지 않는다. 확인하지 못하면 기존 퇴장 규칙으로 판정한다.
            }
            finishEliminatedLeave(sessionId, member, request, tableId, gameId, eliminated);
        });
        return true;
    }

    // Hub 잠금 안에서만 호출한다. 진행 중인 할리갈리 경기의 아직 좌석을 가진 참가자일 때 그 경기 ID를 돌려준다.
    private String eliminatedLeaveGame(Member member) {
        if (member.accountId() == null || gameStates.isEmpty() || committedStarts.isEmpty()) {
            return null;
        }
        String tableId = seating.get(member.userId());
        TableStartAttempt attempt = tableId == null ? null : starts.get(tableId);
        if (attempt == null || !attempt.phase().equals("PLAYING")
                || !TableGame.HALLI_GALLI.name().equals(attempt.command().gameCode())) {
            return null;
        }
        String gameId = publicGameId(tableId);
        if (gameId == null || !gameId.equals(seatedGames.get(member.userId()))
                || inactiveGameParticipants.getOrDefault(gameId, Set.of()).contains(member.userId())) {
            return null;
        }
        return gameId;
    }

    // 엔진 공개 상태(HalliGalliEngine.publicState)에서 본인의 자연 탈락만 인정한다. 기권자는 기존 이탈 경로가 좌석을 정리한다.
    private static boolean naturallyEliminated(GameStateView view, long accountId, String gameId) {
        if (view == null || view.userId() != accountId || !gameId.equals(view.gameId())
                || view.role() != GameStateView.Role.PLAYER) {
            return false;
        }
        var state = view.publicState();
        if (!TableGame.HALLI_GALLI.name().equals(state.path("gameCode").asText())
                || !"PLAYING".equals(state.path("status").asText())) {
            return false;
        }
        String own = Long.toString(accountId);
        for (var player : state.path("players")) {
            if (own.equals(player.path("userId").asText())) {
                var eliminated = player.path("eliminated");
                var forfeited = player.path("forfeited");
                return eliminated.isBoolean() && eliminated.booleanValue()
                        && forfeited.isBoolean() && !forfeited.booleanValue();
            }
        }
        return false;
    }

    private synchronized void finishEliminatedLeave(String sessionId, Member member, Request request, String tableId,
            String gameId, boolean eliminated) {
        if (stopped || members.get(sessionId) != member) {
            return;
        }
        eliminatedLeaves.remove(sessionId);
        try {
            // 조회 중 좌석·경기가 바뀌었거나 아직 활성 참가자면 기존 퇴장 규칙(복구 확인·대기 상태 확인)으로 판정한다.
            if (!eliminated || !tableId.equals(seating.get(member.userId())) || !gameId.equals(eliminatedLeaveGame(member))) {
                if (member.accountId() != null && reconnect.isPresent()
                        && !reconnect.get().canUseLobby(member.accountId(), sessionId)
                        && !restoredChannelAccess(member, request)) {
                    fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
                }
                leave(member, request);
                return;
            }
            // 재접속 때도 이 경기를 되살리지 않도록 참가 종료 목록에 먼저 넣는다(connect의 rememberDeparture).
            inactiveGameParticipants.computeIfAbsent(gameId, ignored -> new HashSet<>()).add(member.userId());
            releaseDepartedSeat(tableId, gameId, member.userId(), sessionId, request.requestId(), "ELIMINATED_LEAVE");
            // 복구 슬롯을 다시 읽어 RESTORED를 LOBBY로 바꾼다. 이후 공원 이동·관전·미니게임을 기존 규칙대로 허용한다.
            reconnect.ifPresent(service -> service.tableLeft(member.accountId(), sessionId));
            syncGameActivities();
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        }
    }

    private void leave(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        ensureWaiting(room.snapshot().tableId(), request, true);
        // TABLE_LEAVE itself releases a practice seat, even when the companion HTTP endpoint is unavailable.
        String npc = aiPracticeSeats.get(room.snapshot().tableId());
        if (npc != null) aiReleaseOmok(room.snapshot().tableId(), npc);
        cancelReadyBalance(member.userId());
        String tableId = seating.remove(member.userId());
        waitingReconnects.remove(member.userId());
        room.leave(member.userId());
        seatedGames.remove(member.userId());
        statePushes.remove(member.sessionId());
        member.delivery().left(request.requestId(), tableId);
        if (member.accountId() != null) {
            reconnect.ifPresent(service -> service.tableLeft(member.accountId(), member.sessionId()));
        }
        replyStartState(member, null, null);
        publish(room, null, null);
        recordTableLeft(member.accountId(), tableId, "LEAVE");
    }

    // 좌석이 실제로 정리된 뒤에만 호출한다. byDisconnect는 기존 분석 쿼리 호환을 위해 reason과 함께 남긴다.
    private void recordTableLeft(Long accountId, String tableId, String reason) {
        boolean byDisconnect = reason.equals("DISCONNECT") || reason.equals("RECONNECT_EXPIRED");
        recordBehavior(BehaviorEventType.TABLE_LEFT, accountId, builder -> builder.tableId(tableId)
                .channelId(tableChannels.get(tableId)).prop("byDisconnect", byDisconnect).prop("reason", reason));
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
        if (room.manualStart()) { replyHostWait(member, room, null); }
    }

    private java.time.Instant tableNow() { return java.time.Instant.ofEpochMilli(worldClock.sample().serverNow()); }

    private void configureTable(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        String tableId = room.snapshot().tableId();
        ensureWaiting(tableId, request);
        if (!room.isSelector(member.userId())) { fail(request, "NOT_GAME_SELECTOR", "방장만 설정할 수 있습니다."); }
        if (room.snapshot().version() != request.payload().path("expectedVersion").asLong()) {
            fail(request, "GAME_SETTINGS_CHANGED", "최신 테이블 상태를 확인해주세요.");
        }
        TableGame game = TableGame.find(request.payload().path("gameCode").asText());
        if (game == null) { fail(request, "UNSUPPORTED_GAME", "지원하지 않는 게임입니다."); }
        ensureGameAllowedAtTable(tableId, game, request);
        Integer target = request.payload().has("targetScore") ? request.payload().path("targetScore").asInt() : null;
        if (game == TableGame.DICE && target == null) { fail(request, "GAME_OPTIONS_REQUIRED", "목표 점수를 선택해주세요."); }
        try {
            long amount = request.payload().path("betAmountPerPlayer").asLong();
            if (game == TableGame.STONE_RUMBLE && amount != 0) {
                fail(request, "GAME_INVALID_BET", "돌탑 생존전은 무료로 참가해요.");
            }
            int players = request.payload().path("selectedPlayers").asInt();
            if (room.configure(game, target, amount, players)) {
                starts.remove(tableId);
                publish(room, member, request.requestId());
                publishStart(tableId);
                recordBehavior(BehaviorEventType.GAME_SELECTED, member.accountId(), builder -> builder.tableId(tableId)
                        .prop("gameCode", game.name()).prop("targetScore", target).prop("betAmountPerPlayer", amount)
                        .prop("startMode", "MANUAL").prop("selectedPlayers", players));
            } else { replyState(member, request, room); }
        } catch (IllegalArgumentException invalid) { fail(request, "GAME_CONFIGURATION_INVALID", "정원·목표·판돈을 확인해주세요."); }
    }

    private void startTable(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        String tableId = room.snapshot().tableId();
        String actionId = request.payload().path("actionId").asText();
        long expected = request.payload().path("expectedVersion").asLong();
        ManualStartReceipt prior = manualStartReceipts.get(tableId);
        if (prior != null && prior.actionId().equals(actionId)) {
            if (!prior.userId().equals(member.userId()) || prior.expectedVersion() != expected) {
                fail(request, "START_ACTION_CONFLICT", "같은 요청 ID의 내용이 다릅니다.");
            }
            if (starts.get(tableId) != prior.attempt()) { fail(request, "START_ACTION_EXPIRED", "이전 시작 요청입니다."); }
            replyStartState(member, tableId, request.requestId());
            return;
        }
        ensureWaiting(tableId, request);
        if (checkHostTimeout(room)) { fail(request, "HOST_START_TIMEOUT", "방장 시작 제한 시간이 만료됐습니다."); }
        if (!room.manualStart()) { fail(request, "TABLE_CONFIGURATION_REQUIRED", "먼저 태블릿 설정을 확정해주세요."); }
        if (!room.isSelector(member.userId())) { fail(request, "NOT_GAME_SELECTOR", "방장만 시작할 수 있습니다."); }
        if (room.snapshot().version() != expected) { fail(request, "GAME_SETTINGS_CHANGED", "최신 테이블 상태를 확인해주세요."); }
        if (!room.snapshot().allReady()) { fail(request, "TABLE_NOT_READY", "선택 정원 전원이 준비해야 합니다."); }
        if (!startRehearsal && committedStarts.isEmpty()) { fail(request, "START_NOT_CONFIGURED", "경기 시작 연결이 필요합니다."); }
        room.cancelWait("START_APPROVED");
        beginStartIfReady(room);
        manualStartReceipts.put(tableId, new ManualStartReceipt(member.userId(), actionId, expected, starts.get(tableId)));
        publishHostWait(room);
        replyStartState(member, tableId, request.requestId());
    }

    private void replyHostWait(Member member, TableRoom room, String requestId) {
        member.peer().offer(protocol.encode(requestId, "TABLE_HOST_WAIT_STATE", room.hostWait(tableNow())));
    }

    private void publishHostWait(TableRoom room) {
        if (!room.manualStart()) { return; }
        String tableId = room.snapshot().tableId();
        String message = protocol.encode(null, "TABLE_HOST_WAIT_STATE", room.hostWait(tableNow()));
        for (Member target : members.values()) {
            if (isMapReady(target) && (tableId.equals(seating.get(target.userId()))
                    || tableId.equals(watching.get(target.userId())) && canWatchTable(target, tableId))) {
                target.peer().offer(message);
            }
        }
    }

    /** 준비·시작·만료는 같은 Hub 잠금에서 확정하고 오래된 예약 작업은 보관하지 않는다. */
    private synchronized void checkHostWaits() {
        if (stopped) { return; }
        try { expireWaitingReconnects(); rooms.values().forEach(this::checkHostTimeout); }
        catch (RuntimeException failure) { log.error("방장 시작 대기 확인 실패", failure); }
    }

    private void expireWaitingReconnects() {
        var expired = waitingReconnects.entrySet().stream()
                .filter(entry -> !tableNow().isBefore(entry.getValue().expiresAt())).map(Map.Entry::getKey).toList();
        for (String userId : expired) {
            WaitingReconnect lease = waitingReconnects.remove(userId);
            String tableId = seating.get(userId);
            if (lease == null || !lease.tableId().equals(tableId)) { continue; }
            TableStartAttempt start = starts.get(tableId);
            if (start != null && start.frozen()) { continue; }
            cancelReadyBalance(userId);
            seating.remove(userId);
            TableRoom room = rooms.get(tableId);
            room.leave(userId);
            publish(room, null, null);
            recordTableLeft(accountIdOf(userId), tableId, "RECONNECT_EXPIRED");
        }
    }

    private boolean checkHostTimeout(TableRoom room) {
        String tableId = room.snapshot().tableId();
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt != null && attempt.frozen()) { return false; }
        TableRoom.HostTimeout event = room.expireWait(tableNow());
        if (event == null) { return false; }
        cancelReadyBalance(event.previousHostUserId());
        seating.remove(event.previousHostUserId(), tableId);
        waitingReconnects.remove(event.previousHostUserId());
        Member oldHost = members.values().stream().filter(m -> m.userId().equals(event.previousHostUserId())).findFirst().orElse(null);
        if (oldHost != null) { oldHost.peer().offer(protocol.encode(null, "TABLE_LEFT", Map.of("tableId", tableId, "reason", event.reason()))); }
        publish(room, null, null);
        recordTableLeft(accountIdOf(event.previousHostUserId()), tableId, event.reason());
        String notice = protocol.encode(null, "TABLE_HOST_TIMEOUT", event);
        for (Member target : members.values()) {
            if (isMapReady(target) && (target == oldHost || tableId.equals(seating.get(target.userId()))
                    || tableId.equals(watching.get(target.userId())) && canWatchTable(target, tableId))) {
                target.peer().offer(notice);
            }
        }
        return true;
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
        if (room.manualStart()) { replyHostWait(member, room, null); }
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
        refreshDeliveryScopes();
        boolean worldChanged = syncWorldTableSeats(tableChannels.get(room.snapshot().tableId()));
        TableStartAttempt start = starts.get(room.snapshot().tableId());
        room.refreshWait(tableNow(), start == null || !start.frozen());
        TableRoom.Snapshot snapshot = publicSnapshot(room);
        for (Member target : members.values()) {
            if (!isMapReady(target)) {
                continue;
            }
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
        publishHostWait(room);
        if (worldChanged) { publishWorld(channels.worldState(tableChannels.get(snapshot.tableId())), null, null); }
    }

    /** 선택 게임과 실제 좌석만 공개하며 준비·판돈·경기 비공개 정보는 포함하지 않는다. */
    private boolean syncWorldTableSeats(String channelId) {
        if (channelId == null) { return false; }
        long previous = channels.worldState(channelId).version();
        Map<String, WorldChannelRegistry.TableSeat> seats = new HashMap<>();
        var publicTables = new ArrayList<WorldChannelRegistry.PublicTable>();
        for (var entry : rooms.entrySet()) {
            if (!channelId.equals(tableChannels.get(entry.getKey()))) { continue; }
            publicTables.add(new WorldChannelRegistry.PublicTable(entry.getKey(), tableAnchors.get(entry.getKey()),
                    chairCount(entry.getValue().snapshot()), entry.getValue().snapshot().gameCode()));
            for (var seat : entry.getValue().snapshot().seats()) {
                if (seat.userId() != null && entry.getKey().equals(seating.get(seat.userId()))) {
                    seats.put(seat.userId(), new WorldChannelRegistry.TableSeat(entry.getKey(), seat.seatNumber()));
                }
            }
        }
        channels.tableSeats(channelId, seats);
        publicTables.sort(java.util.Comparator.comparing(WorldChannelRegistry.PublicTable::tableId));
        channels.tables(channelId, publicTables);
        return channels.worldState(channelId).version() != previous;
    }

    private static int chairCount(TableRoom.Snapshot table) {
        int occupied = table.seats().stream().filter(seat -> seat.userId() != null)
                .mapToInt(TableRoom.Seat::seatNumber).max().orElse(0);
        return Math.max(Math.max(2, occupied), table.selectedPlayers() == null ? 2 : table.selectedPlayers());
    }

    private void syncGameActivities() {
        Map<String, String> current = new HashMap<>();
        if (committedStarts.isPresent()) {
            starts.forEach((table, attempt) -> {
                String game = publicGameId(table);
                if (game == null) { return; }
                Set<String> inactive = inactiveGameParticipants.getOrDefault(game, Set.of());
                for (Participant participant : attempt.command().participants()) {
                    if (!inactive.contains(participant.userId())) { current.put(participant.userId(), game); }
                }
            });
        }
        for (var state : channels.boardGames(current)) { publishWorld(state, null, null); }
    }

    /** Use the existing approved subscription; pending loads, players and finished games do not count. */
    private void syncSpectatorPresence() {
        Map<String, WorldChannelRegistry.GameWatch> current = new HashMap<>();
        statePushes.forEach((session, push) -> {
            Member member = members.get(session);
            if (member != null && "PLAYING".equals(push.status)
                    && approvedSpectator(session, member, push.gameId) != null) {
                current.put(member.userId(), new WorldChannelRegistry.GameWatch(push.gameId, push.tableId));
            }
        });
        for (var world : channels.gameWatches(current)) { publishWorld(world, null, null); }
    }

    @EventListener
    public synchronized void gameParticipantActivityEnded(com.ssafy.ontop.game.result.GameParticipantLeft event) {
        if (stopped) { return; }
        TableStartAttempt attempt = starts.get(event.tableId());
        if (attempt == null || attempt.command().participants().stream()
                    .noneMatch(player -> player.userId().equals(Long.toString(event.userId())))) { return; }
        if (attempt.starting()) {
            attempt.rememberDeparture(event.gameId(), Long.toString(event.userId()));
            return;
        }
        if (!event.gameId().equals(publicGameId(event.tableId()))
                && !event.gameId().equals(seatedGames.get(Long.toString(event.userId())))) { return; }
        inactiveGameParticipants.computeIfAbsent(event.gameId(), ignored -> new HashSet<>())
                .add(Long.toString(event.userId()));
        releaseDepartedSeat(event.tableId(), event.gameId(), Long.toString(event.userId()));
        syncGameActivities();
    }

    private void releaseDepartedSeat(String tableId, String gameId, String userId) {
        releaseDepartedSeat(tableId, gameId, userId, null, null, "GAME_DEPARTURE");
    }

    // requestSessionId 연결에만 TABLE_LEFT에 requestId를 붙인다. 캐릭터 월드 좌표는 바꾸지 않고 좌석만 놓는다.
    private void releaseDepartedSeat(String tableId, String gameId, String userId, String requestSessionId,
            String requestId, String reason) {
        // 참가 종료가 확정된 좌석만 해제한다. 최초 참가자와 판돈 예약은 기존 정산 경로에 남긴다.
        if (!gameId.equals(seatedGames.get(userId)) || !tableId.equals(seating.get(userId))) { return; }
        cancelReadyBalance(userId);
        seating.remove(userId);
        seatedGames.remove(userId);
        waitingReconnects.remove(userId);
        TableRoom room = rooms.get(tableId);
        room.leave(userId);
        for (Member target : members.values()) {
            if (!target.userId().equals(userId)) { continue; }
            statePushes.remove(target.sessionId());
            target.delivery().rememberDeparture(gameId);
            target.delivery().left(target.sessionId().equals(requestSessionId) ? requestId : null, tableId);
            replyStartState(target, null, null);
        }
        publish(room, null, null);
        recordTableLeft(accountIdOf(userId), tableId, reason);
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
        ensureWaiting(tableId, request, false);
    }

    private void ensureWaiting(String tableId, Request request, boolean leaving) {
        if(!leaving && aiPracticeSeats.containsKey(tableId)) fail(request,"NPC_PRACTICE_ACTIVE","NPC 연습 창에서 대결을 끝낸 뒤 이용해주세요.");
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt != null && attempt.frozen()) {
            fail(request, "TABLE_BUSY", "시작 연동 확인 중이거나 검증이 완료된 테이블입니다.");
        }
    }

    private void beginStartIfReady(TableRoom room) {
        TableRoom.Snapshot snapshot = room.snapshot();
        if ((!startRehearsal && committedStarts.isEmpty()) || !snapshot.allReady()) {
            if (snapshot.allReady() && !startRehearsal && committedStarts.isEmpty()) {
                log.warn("경기 시작 연결 비활성 table={} game={}", snapshot.tableId(), snapshot.gameCode());
                // 직접 생성하는 착석 전용 PoC의 메시지 계약은 유지한다.
                if (startDiagnosticsEnabled) {
                    String notice = protocol.error(null, "START_NOT_CONFIGURED",
                            "경기 시작 기능이 비활성 상태입니다. 서버의 시작·게임 설정을 확인해주세요.");
                    for (Member target : members.values()) {
                        if (target.accountId() != null && isMapReady(target)
                                && snapshot.tableId().equals(seating.get(target.userId()))) {
                            target.peer().offer(notice);
                        }
                    }
                }
            }
            return;
        }
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), snapshot.tableId(), snapshot.version(),
                snapshot.gameCode(), snapshot.seats().stream()
                        .filter(seat -> seat.userId() != null)
                        .map(seat -> new Participant(seat.userId(), seat.seatNumber())).toList(), snapshot.targetScore(),
                snapshot.betAmountPerPlayer());
        TableStartAttempt attempt = new TableStartAttempt(command);
        starts.put(snapshot.tableId(), attempt);
        if (committedStarts.isPresent()) {
            for (Participant player : command.participants()) {
                seatedGames.remove(player.userId());
                for (Member target : members.values()) {
                    if (target.userId().equals(player.userId())) { target.delivery().starting(); }
                }
            }
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
        if (!startRehearsal && committedStarts.isEmpty()) {
            fail(request, "START_NOT_CONFIGURED", "경기 시작 연결이 비활성 상태입니다.");
        }
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
        if (committedStarts.isPresent() && result.isReservationCommitted(attempt.command())) {
            Set<String> early = attempt.takeDepartures(result.gameSessionId());
            if (!early.isEmpty()) { inactiveGameParticipants.put(result.gameSessionId(), new HashSet<>(early)); }
            for (Participant player : attempt.command().participants()) {
                if (tableId.equals(seating.get(player.userId()))) {
                    seatedGames.put(player.userId(), result.gameSessionId());
                }
            }
            refreshDeliveryScopes();
            for (String userId : early) {
                releaseDepartedSeat(tableId, result.gameSessionId(), userId);
            }
        }
        if (committedStarts.isPresent() && attempt.frozen() && !attempt.starting()) {
            recordGameStarted(tableId, attempt, result);
            if (publicGameId(tableId) != null) {
                TableRoom room = rooms.get(tableId);
                room.publicStateChanged();
                publish(room, null, null);
            }
        }
        if (!attempt.frozen()) {
            for (Member target : members.values()) {
                if (tableId.equals(seating.get(target.userId()))) { target.delivery().startFailed(); }
            }
            Set<String> connected = connectedUsers();
            rooms.get(tableId).returnToWaiting(connected);
            seating.entrySet().removeIf(entry -> entry.getValue().equals(tableId)
                    && !connected.contains(entry.getKey()));
            publish(rooms.get(tableId), null, null);
        }
        syncGameActivities();
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
        return members.values().stream().filter(this::isMapReady).map(Member::userId).collect(Collectors.toSet());
    }

    private void refreshDeliveryScopes() {
        seatedGames.keySet().removeIf(user -> !seating.containsKey(user));
        for (Member member : members.values()) { member.delivery().current(seatedGames.get(member.userId())); }
    }

    private void publishStart(String tableId) {
        startRevisions.merge(tableId, 1L, Long::sum);
        for (Member target : members.values()) {
            if (isMapReady(target) && tableId.equals(seating.get(target.userId()))) {
                replyStartState(target, tableId, null);
            }
        }
    }

    /** 대기 중인 확정 라운드의 불변 스냅샷만 제공한다. DB 호출은 Hub 잠금 밖에서 수행한다. */
    public synchronized Map<String, String> pendingResultRounds() {
        Map<String, String> snapshot = new HashMap<>();
        starts.forEach((tableId, attempt) -> {
            if (attempt.phase().equals("PLAYING") || attempt.phase().equals("SETTLING")) {
                String gameId = attempt.view(0, false).gameSessionId();
                if (gameId != null) { snapshot.put(tableId, gameId); }
            }
        });
        return Map.copyOf(snapshot);
    }

    /** 엔진 또는 DB의 종결을 테이블에 반영한다. 과거 경기 알림은 무시한다. */
    public synchronized void roundEnded(String tableId, String gameId) {
        if (stopped || committedStarts.isEmpty()) { return; }
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt != null && attempt.starting()) {
            // 엔진 생성과 Hub 성공 반영 사이의 종료를 보존한다. 나중에 확정 경기 ID와 대조한다.
            attempt.rememberEnd(gameId);
            return;
        }
        if (attempt == null || !gameId.equals(attempt.view(0, false).gameSessionId()) || !attempt.endRound()) { return; }
        inactiveGameParticipants.remove(gameId);
        syncGameActivities();
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
                    || result.betAmountPerPlayer() != attempt.command().betAmountPerPlayer()) { continue; }
            Set<String> expected = attempt.command().participants().stream().map(Participant::userId)
                    .collect(Collectors.toSet());
            Set<String> actual = result.participants().stream().map(GameResultView.Participant::userId)
                    .collect(Collectors.toSet());
            if (!expected.equals(actual) || !expected.contains(Long.toString(result.userId()))) { continue; }
            // 경기 전체 SETTLED를 확인한다. 알림이 먼저 와도 엔진 종료 전에는 다음 판을 열지 않는다.
            settledHostResults.put(entry.getKey(), result);
            attempt.markSettled(result.gameSessionId());
            releaseSettledRound(entry.getKey(), attempt);
        }
    }

    /** Runs only after the minigame transaction commits, so a rolled-back start or end is never shown. */
    @org.springframework.transaction.event.TransactionalEventListener(
            phase = org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public synchronized void minigameActivityChanged(
            com.ssafy.ontop.minigame.service.MinigameActivityChanged event) {
        if (stopped) { return; }
        try {
            Duration remaining = event.activeUntil() == null ? Duration.ZERO
                    : Duration.between(tableNow(), event.activeUntil());
            var state = channels.minigameActivity(Long.toString(event.userId()), event.sessionId(), remaining);
            if (state != null) { publishWorld(state, null, null); }
        } catch (RuntimeException exception) {
            // A committed game or reward must not become an HTTP failure because a peer disconnected.
            org.slf4j.LoggerFactory.getLogger(TableHub.class).warn("미니게임 이용 상태 방송 실패", exception);
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
        GameResultView result = settledHostResults.remove(tableId);
        if (room.manualStart()) {
            Set<String> preferred = result == null || result.status() == GameResultView.Status.INVALID ? Set.of()
                    : result.participants().stream().filter(player -> "WIN".equals(player.result()) || "DRAW".equals(player.result()))
                            .map(GameResultView.Participant::userId).collect(Collectors.toSet());
            room.chooseHost(preferred);
        }
        seating.entrySet().removeIf(entry -> entry.getValue().equals(tableId) && !connected.contains(entry.getKey()));
        publish(room, null, null);
        publishStart(tableId);
        // 정산 전 조회 장애로 남은 판정만 재확인한다. 정상 FINISHED·LOBBY에는 새 PENDING을 만들지 않는다.
        attempt.command().participants().forEach(player -> reconnect.ifPresent(service ->
                service.roundSettled(Long.parseLong(player.userId()))));
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
            if (push != null && push.gameId.equals(view.gameId()) && push.role == view.role()) {
                rememberEventScope(push, view);
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
        tickOneCardPranks();
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

    private Object parkDebrisState(String channelId) {
        var state = parkDebris.state(channelId);
        return Map.of("channelId", channelId, "mapVersion", maps.metadata().mapVersion(),
                "version", state.version(), "items", state.items());
    }

    private void sendParkDebris(Member member, String channelId) {
        if (isMapReady(member)) {
            member.peer().offer(protocol.encode(null, "WORLD_PARK_DEBRIS_STATE", parkDebrisState(channelId)));
        }
    }

    /** 모든 채널의 접속자에게 동일한 DB 확정 기계 상태를 보낸다. 본인 재고는 방송하지 않는다. */
    public synchronized void publishGacha(com.ssafy.ontop.gacha.GachaDtos.Event event) {
        String message = protocol.encode(null, "GACHA_STATE", event);
        for (Member target : members.values()) {
            if (isMapReady(target)) target.peer().offer(message);
        }
    }

    private void publishParkDebris(String channelId) {
        String message = protocol.encode(null, "WORLD_PARK_DEBRIS_STATE", parkDebrisState(channelId));
        for (Member target : members.values()) {
            if (isMapReady(target) && channelId.equals(channels.channelOf(target.userId()))) {
                target.peer().offer(message);
            }
        }
    }

    private synchronized void expireParkDebris() {
        if (stopped) {
            return;
        }
        try {
            for (String channelId : parkDebris.expire(tableNow())) {
                publishParkDebris(channelId);
            }
        } catch (RuntimeException exception) {
            log.error("공원 잔해 자동 정리 실패", exception);
        }
    }

    /** 서버 AI 청소 연결점이며 클라이언트에 잔해 삭제 권한을 주지 않는다. */
    public synchronized boolean cleanParkDebris(String channelId, String itemId, String part) {
        if (stopped || !parkDebris.clean(channelId, itemId, part)) {
            return false;
        }
        publishParkDebris(channelId);
        return true;
    }

    @EventListener
    public synchronized void gameDefeatConfirmed(GameDefeatConfirmed event) {
        if (stopped) { return; }
        String channelId = tableChannels.get(event.tableId());
        TableStartAttempt attempt = starts.get(event.tableId());
        if (channelId == null || attempt == null
                || !event.gameId().equals(attempt.view(0, false).gameSessionId())
                || !event.gameCode().equals(attempt.command().gameCode())) { return; }
        Set<String> players = attempt.command().participants().stream().map(GameStartCommand.Participant::userId)
                .collect(Collectors.toSet());
        if (!players.contains(Long.toString(event.userId()))) { return; }
        ReactionRound round = reactionRounds.get(event.tableId());
        if (round == null || !round.gameId().equals(event.gameId())) {
            round = new ReactionRound(event.gameId(), new HashSet<>());
            reactionRounds.put(event.tableId(), round);
        }
        // 한 테이블의 현재 경기, 참가자별 한 건만 보존한다. 새 경기의 사건이 오면 교체한다.
        if (!round.users().add(event.userId())) { return; }
        var position = channels.positionOf(Long.toString(event.userId()));
        // 오목은 참가 확정 좌석으로 상대 방향을 정해 관전자도 같은 비행 경로를 본다.
        double throwYaw = position == null ? 0 : position.yaw();
        if ("OMOK".equals(event.gameCode()) && players.size() == 2) {
            var participants = attempt.command().participants();
            int fromSeat = participants.stream()
                    .filter(player -> player.userId().equals(Long.toString(event.userId())))
                    .findFirst().orElseThrow().seatNumber();
            int toSeat = participants.stream()
                    .filter(player -> !player.userId().equals(Long.toString(event.userId())))
                    .findFirst().orElseThrow().seatNumber();
            throwYaw = OmokForfeitDirection.towardOpponent(fromSeat, toSeat);
        }
        if (parkDebris.add(channelId, tableAnchors.get(event.tableId()), event, players.size(), throwYaw)) {
            publishParkDebris(channelId);
        }
        String notification = protocol.encode(null, "WORLD_GAME_REACTION",
                WorldGameReaction.from(event, channelId, players.size()));
        for (Member target : members.values()) {
            if (isMapReady(target) && channelId.equals(channels.channelOf(target.userId()))
                    && (players.contains(target.userId()) || canWatchTable(target, event.tableId()))) {
                target.peer().offer(notification);
            }
        }
    }

    @EventListener
    public synchronized void gameStateChanged(GameStateChanged change) {
        if (stopped || gameStates.isEmpty()) {
            return;
        }
        tickOneCardPranks();
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
        push.publicState = view.publicState().deepCopy();
            push.deliveredVersion = view.version();
            // 관전 채팅·핑 판정용. 엔진을 다시 호출하지 않도록 전달한 공개 상태의 일부만 기억한다.
            rememberEventScope(push, view);
            push.member.peer().offer(protocol.encode(push.initialRequestId, "GAME_STATE", view));
            push.initialRequestId = null;
        }
        syncSpectatorPresence();
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
        tickOneCardPranks();
    }

    private void sendOneCardPrank(String sessionId, Member member, Request request) {
        if (!pranksEnabled || prankEngine.isEmpty()) {
            fail(request, "ONECARD_DEFENSE_NOT_CONFIGURED", "원카드 장난 연결이 준비되지 않았습니다.");
        }
        if (member.accountId() == null || reconnect.isEmpty()) {
            fail(request, "ONECARD_PRANK_ACCESS_DENIED", "인증된 경기 당사자만 요청할 수 있습니다.");
        }
        var payload = request.payload();
        String game = payload.path("gameId").asText();
        boolean reach = request.type().equals("ONECARD_PRANK_REACH_SEND");
        boolean legacy = request.type().equals("ONECARD_HAND_FLIP_SEND");
        if (legacy && prankDefenseEnabled) {
            fail(request, "ONECARD_DEFENSE_REQUIRED", "손 뻗기 요청으로 방어 시간을 먼저 확인해주세요.");
        }
        if ((reach || request.type().equals("ONECARD_PRANK_HIT_SEND")) && !prankDefenseEnabled) {
            fail(request, "ONECARD_DEFENSE_NOT_CONFIGURED", "뿅망치 방어가 활성화되지 않았습니다.");
        }
        StatePush scope = reach || legacy ? approvedSpectator(sessionId, member, game)
                : approvedPlayerChat(sessionId, member, game);
        if (scope == null || !"ONE_CARD".equals(scope.gameCode)) {
            fail(request, "ONECARD_PRANK_ACCESS_DENIED", "승인된 원카드 경기에서만 요청할 수 있습니다.");
        }
        prankEngine.orElseThrow().withPrankState(game, (state, now) -> {
            onecardPranks.advance(game, state, now, (actor, target) -> prankAuthorized(game, actor, target))
                    .forEach(notice -> publishOneCardPrank(notice, null));
            String event = payload.path("eventId").asText();
            OneCardPranks.Reply reply;
            if (reach || legacy) {
                long target;
                try { target = Long.parseLong(payload.path("targetUserId").asText()); }
                catch (NumberFormatException exception) { throw new RequestException(request.requestId(), "INVALID_PAYLOAD", "회원 ID를 확인해주세요."); }
                if (!prankAuthorized(game, member.accountId(), target)) {
                    fail(request, "ONECARD_PRANK_ACCESS_DENIED", "현재 연결된 참가자에게만 요청할 수 있습니다.");
                }
                reply = onecardPranks.reach(state, member.accountId(), event, target,
                        payload.path("turnCount").asLong(), now, legacy,
                        payload.has("cardIndex") ? payload.path("cardIndex").intValue() : null,
                        payload.has("handVersion") ? payload.path("handVersion").longValue() : null);
            } else if (request.type().equals("ONECARD_PRANK_HIT_SEND")) {
                reply = onecardPranks.hit(state, member.accountId(), event, payload.path("attemptId").asText(), now);
            } else {
                reply = onecardPranks.restore(state, member.accountId(), event, payload.path("effectId").asText(), now);
            }
            member.peer().offer(protocol.encode(request.requestId(), reply.acknowledgement().type(), reply.acknowledgement().payload()));
            reply.notices().forEach(notice -> publishOneCardPrank(notice,
                    notice == reply.acknowledgement() ? member : null));
            return null;
        });
    }

    private boolean prankAuthorized(String game, long actor, long target) {
        boolean player = false;
        boolean viewer = actor == 0;
        for (Member member : members.values()) {
            if (!isMapReady(member) || member.accountId() == null) { continue; }
            if (member.accountId() == target && approvedPlayerChat(member.sessionId(), member, game) != null) { player = true; }
            if (member.accountId() == actor && approvedSpectator(member.sessionId(), member, game) != null) { viewer = true; }
        }
        return player && viewer;
    }

    private synchronized void tickOneCardPranks() {
        if (stopped || !pranksEnabled || prankEngine.isEmpty()) { return; }
        for (String game : onecardPranks.games()) {
            try {
                prankEngine.get().withPrankState(game, (state, now) -> {
                    onecardPranks.advance(game, state, now, (actor, target) -> prankAuthorized(game, actor, target))
                            .forEach(notice -> publishOneCardPrank(notice, null));
                    return null;
                });
            } catch (RuntimeException exception) {
                org.slf4j.LoggerFactory.getLogger(TableHub.class).warn("원카드 장난 정리 재시도 exceptionType={}", exception.getClass().getName());
            }
        }
    }

    private void publishOneCardPrank(OneCardPranks.Notice notice, Member skip) {
        String game = notice.payload().get("gameId").toString();
        boolean privateReach = notice.type().startsWith("ONECARD_PRANK_");
        String targetId = notice.payload().get("targetUserId").toString();
        String actorId = String.valueOf(notice.payload().get("actorUserId"));
        String encoded = protocol.encode(null, notice.type(), notice.payload());
        for (Member target : members.values()) {
            if (target == skip || target.accountId() == null || !isMapReady(target)) { continue; }
            StatePush push = statePushes.get(target.sessionId());
            boolean player = push != null && push.role == GameStateView.Role.PLAYER && push.gameId.equals(game)
                    && push.players.contains(target.userId()) && java.util.Objects.equals(push.tableId, seating.get(target.userId()));
            boolean viewer = approvedSpectator(target.sessionId(), target, game) != null;
            if ((player || viewer) && (!privateReach || target.userId().equals(actorId) || target.userId().equals(targetId))) {
                target.peer().offer(encoded);
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

    // GAME_WATCH 첫 상태를 받은 뒤에도 같은 경기·채널·20m·로비 자격을 유지하는 관전자만 인정한다.
    private StatePush approvedSpectator(String sessionId, Member member, String gameId) {
        StatePush push = statePushes.get(sessionId);
        return push != null && push.member == member && push.role == GameStateView.Role.SPECTATOR
                && push.gameId.equals(gameId) && push.initialRequestId == null && push.tableId != null
                && canSpectate(sessionId, member, push.tableId) ? push : null;
    }

    private void rememberEventScope(StatePush push, GameStateView view) {
        push.tableId = view.tableId();
        var publicState = view.publicState();
        push.gameCode = publicState.path("gameCode").textValue();
        push.status = publicState.path("status").textValue();
        if (publicState.path("players").isArray()) {
            var players = new HashSet<String>();
            publicState.path("players").forEach(player -> players.add(player.isTextual() ? player.asText() : player.path("userId").asText()));
            push.players = Set.copyOf(players);
        } else {
            push.players = Set.copyOf(java.util.List.of(publicState.path("blackUserId").asText(),
                    publicState.path("whiteUserId").asText()));
        }
    }

    private StatePush approvedPlayerChat(String sessionId, Member member, String gameId) {
        if (!reconnect.orElseThrow().canControlGame(member.accountId(), sessionId, gameId)) { return null; }
        String tableId = seating.get(member.userId());
        if (tableId == null) { return null; }
        StatePush push = statePushes.get(sessionId);
        if (push != null && push.member == member && push.role == GameStateView.Role.PLAYER
                && push.gameId.equals(gameId) && push.players.contains(member.userId())
                && tableId.equals(push.tableId)) { return push; }
        // RESTORED already grants this connection control before the first GAME_STATE push/query.
        // Use the committed start under the Hub lock; never call the engine here or require a manual refresh.
        TableStartAttempt attempt = starts.get(tableId);
        if (attempt == null || !"PLAYING".equals(attempt.phase())
                || !gameId.equals(seatedGames.get(member.userId()))
                || !gameId.equals(attempt.view(0, false).gameSessionId())) { return null; }
        Set<String> players = attempt.command().participants().stream().map(Participant::userId).collect(Collectors.toSet());
        if (!players.contains(member.userId())) { return null; }
        StatePush chatScope = new StatePush(member, gameId);
        chatScope.tableId = tableId;
        chatScope.gameCode = attempt.command().gameCode();
        chatScope.status = "PLAYING";
        chatScope.players = Set.copyOf(players);
        return chatScope;
    }

    /**
     * 현재 플레이어의 채팅·승인 관전자의 채팅/핑을 같은 경기 안에 전달한다. 핑 권한은 관전 전용이다.
     * 엔진을 호출하지 않으며 판·버전·타이머·결과는 바꾸지 않는다. 다른 수신자에게는 비필수 이벤트로만 보낸다.
     * 주사위 장부 핑은 오목 핑과 같은 간격·TTL·버전 규칙을 쓰고 대상만 점수 칸 또는 주사위다.
     */
    private void sendAlkkagiSpectator(String sessionId, Member member, Request request) {
        if (member.accountId() == null || reconnect.isEmpty()) fail(request, "GAME_SPECTATOR_AUTH_REQUIRED", "인증된 관전자만 이용할 수 있습니다.");
        String gameId = request.payload().path("gameId").asText();
        StatePush push = approvedSpectator(sessionId, member, gameId);
        if (push == null || reconnect.get().canControlGame(member.accountId(), sessionId, gameId))
            fail(request, "GAME_SPECTATOR_ACCESS_DENIED", "관전 승인된 경기에서만 이용할 수 있습니다.");
        if (!"ALKKAGI".equals(push.gameCode) || !"PLAYING".equals(push.status))
            fail(request, "GAME_SPECTATOR_GAME_NOT_PLAYING", "진행 중인 알까기 경기에서만 이용할 수 있습니다.");
        if (push.requestedVersion > push.deliveredVersion) fail(request, "ALKKAGI_SPECTATOR_STALE_VERSION", "최신 판을 확인해주세요.");
        long now = worldClock.sample().serverNow();
        AlkkagiSpectatorPolicy.Emission emission;
        try { emission = alkkagiSpectators.accept(member.userId(), request.payload(), push.publicState, now); }
        catch (IllegalArgumentException rejected) { throw new RequestException(request.requestId(), rejected.getMessage(), "관전 표시 요청을 확인해주세요."); }
        member.peer().offer(protocol.encode(request.requestId(), "ALKKAGI_SPECTATOR_EVENT", emission.event()));
        if (!emission.fresh()) return;
        String notice = protocol.encode(null, "ALKKAGI_SPECTATOR_EVENT", emission.event());
        Duration ttl = Duration.ofMillis((long) emission.event().get("expiresAt") - now);
        for (var entry : members.entrySet()) {
            Member target = entry.getValue();
            if (target == member || target.accountId() == null) continue;
            boolean player = push.players.contains(target.userId()) && reconnect.get().canControlGame(target.accountId(), entry.getKey(), gameId);
            if (player || approvedSpectator(entry.getKey(), target, gameId) != null) target.peer().offerTransient(notice, ttl);
        }
    }

    private void sendPracticeChat(Member member,Request request,String game) {
        if(member.accountId()==null||!game.equals(isolatedChatGame(member)))fail(request,"GAME_SPECTATOR_ACCESS_DENIED","이 연습판의 참가자·관전자만 채팅할 수 있습니다.");
        String text=new ChatText(request.payload().path("text").asText()).value(),event=request.payload().path("eventId").asText();
        long now=worldClock.sample().serverNow();SpectatorEventPolicy.Stamp stamp;
        try {
            stamp=spectatorEvents.previous(member.accountId(),event,SpectatorEventPolicy.Kind.CHAT,game,text,now);
            if(stamp!=null){member.peer().offer(protocol.encode(request.requestId(),"GAME_SPECTATOR_CHAT_MESSAGE",new GameSpectatorChatMessage(game,event,member.userId(),text,stamp,now)));return;}
            stamp=spectatorEvents.accept(member.accountId(),event,SpectatorEventPolicy.Kind.CHAT,game,text,now);
        }catch(SpectatorEventPolicy.Rejected rejected){throw new RequestException(request.requestId(),rejected.code(),rejected.getMessage());}
        catch(IllegalArgumentException invalid){fail(request,"INVALID_PAYLOAD","채팅 요청을 확인해주세요.");return;}
        var message=new GameSpectatorChatMessage(game,event,member.userId(),text,stamp,now);
        member.peer().offer(protocol.encode(request.requestId(),"GAME_SPECTATOR_CHAT_MESSAGE",message));
        var audience=new java.util.ArrayList<String>();audience.add(member.userId());
        for(var target:members.values())if(target!=member&&game.equals(isolatedChatGame(target))){target.peer().offer(protocol.encode(null,"GAME_SPECTATOR_CHAT_MESSAGE",message));audience.add(target.userId());}
        var bridge=aiBridge;
        if(bridge!=null) {
            String channel=channels.channelOf(member.userId());var position=channels.positionOf(member.userId());
            if(channel!=null) {
                String nickname=channels.worldState(channel).avatars().stream().filter(a -> a.userId().equals(member.userId()))
                        .map(a -> a.nickname()==null?member.userId():a.nickname()).findFirst().orElse(member.userId());
                bridge.chat(new com.ssafy.ontop.ai.WorldAiBridge.Chat(game+":"+member.userId()+":"+event,
                        channel,member.userId(),nickname,text,now,position==null?0:position.x(),position==null?0:position.y(),
                        position==null?0:position.z(),List.copyOf(audience),game,position==null));
            }
        }
    }
    private void sendSpectatorEvent(String sessionId, Member member, Request request) {
        if(request.type().equals("GAME_SPECTATOR_CHAT_SEND")&&aiPracticeGames.containsValue(request.payload().path("gameId").asText())){sendPracticeChat(member,request,request.payload().path("gameId").asText());return;}

        boolean ledgerPing = request.type().equals("DICE_LEDGER_SPECTATOR_PING_SEND");
        boolean ping = ledgerPing || request.type().equals("OMOK_SPECTATOR_PING_SEND");
        var payload = request.payload();
        if (member.accountId() == null) {
            fail(request, "GAME_SPECTATOR_AUTH_REQUIRED", "인증된 회원만 관전 채팅·핑을 보낼 수 있습니다.");
        }
        if (gameStates.isEmpty() || reconnect.isEmpty()) {
            fail(request, "GAME_SPECTATOR_NOT_CONFIGURED", "경기 관전 연결이 준비되지 않았습니다.");
        }
        String gameId = payload.get("gameId").textValue();
        StatePush push = approvedSpectator(sessionId, member, gameId);
        if (push == null && !ping) { push = approvedPlayerChat(sessionId, member, gameId); }
        if (push == null || ping && reconnect.get().canControlGame(member.accountId(), sessionId, gameId)) {
            fail(request, "GAME_SPECTATOR_ACCESS_DENIED", "관전이 승인된 경기에서만 보낼 수 있습니다.");
        }
        if (ping && !(ledgerPing ? "DICE_LEDGER" : "OMOK").equals(push.gameCode)
                || !Set.of("OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE", "DICE_LEDGER", "ALKKAGI",
                        "HALLI_GALLI", "STONE_RUMBLE").contains(push.gameCode)) {
            fail(request, "GAME_SPECTATOR_UNSUPPORTED_GAME", "지원하는 경기 채팅 또는 오목·주사위 장부 추천을 이용해주세요.");
        }
        if (!"PLAYING".equals(push.status)) {
            fail(request, "GAME_SPECTATOR_GAME_NOT_PLAYING", "진행 중인 경기에서만 보낼 수 있습니다.");
        }
        String eventId = payload.get("eventId").textValue();
        var kind = ping ? SpectatorEventPolicy.Kind.PING : SpectatorEventPolicy.Kind.CHAT;
        String text = ping ? null : new ChatText(payload.get("text").textValue()).value();
        long basedOnVersion = ping ? payload.get("basedOnVersion").longValue() : 0;
        int x = ping && !ledgerPing ? payload.get("x").intValue() : 0;
        int y = ping && !ledgerPing ? payload.get("y").intValue() : 0;
        String category = ledgerPing && payload.has("category") ? payload.get("category").textValue() : null;
        Integer dieId = ledgerPing && payload.has("dieId") ? payload.get("dieId").intValue() : null;
        String content = ledgerPing ? basedOnVersion + ":" + (category != null ? category : "die" + dieId)
                : ping ? basedOnVersion + ":" + x + ":" + y : text;
        String type = ledgerPing ? "DICE_LEDGER_SPECTATOR_PING" : ping ? "OMOK_SPECTATOR_PING" : "GAME_SPECTATOR_CHAT_MESSAGE";
        long now = worldClock.sample().serverNow();
        java.util.function.Function<SpectatorEventPolicy.Stamp, Object> eventOf = issued -> ledgerPing
                ? new DiceLedgerSpectatorPing(gameId, eventId, member.userId(), basedOnVersion, category, dieId, issued, now)
                : ping ? new OmokSpectatorPing(gameId, eventId, member.userId(), basedOnVersion, x, y, issued, now)
                : new GameSpectatorChatMessage(gameId, eventId, member.userId(), text, issued, now);
        SpectatorEventPolicy.Stamp stamp;
        try {
            stamp = spectatorEvents.previous(member.accountId(), eventId, kind, gameId, content, now);
            if (stamp != null) {
                // 같은 요청의 재전송은 원래 시각 그대로 요청자에게만 다시 확인해 준다. 다시 방송하지 않는다.
                member.peer().offer(protocol.encode(request.requestId(), type, eventOf.apply(stamp)));
                return;
            }
            // Hub 잠금이 경기 상태 변경 알림과의 경계다. 더 새 버전 알림을 받았으면 아직 전달 전이어도 거절한다.
            if (ping && (basedOnVersion != push.deliveredVersion || push.requestedVersion > push.deliveredVersion)) {
                fail(request, ledgerPing ? "DICE_LEDGER_SPECTATOR_PING_STALE_VERSION" : "OMOK_SPECTATOR_PING_STALE_VERSION",
                        "최신 판 상태에서 다시 추천해주세요.");
            }
            stamp = spectatorEvents.accept(member.accountId(), eventId, kind, gameId, content, now);
        } catch (SpectatorEventPolicy.Rejected rejected) {
            throw new RequestException(request.requestId(), rejected.code(), rejected.getMessage());
        }
        Object event = eventOf.apply(stamp);
        var aiAudience = new java.util.ArrayList<String>();
        aiAudience.add(member.userId());
        // 요청자 확인은 일반 응답이다. 다른 수신자 전달은 큐가 붐비거나 만료되면 버려질 수 있다.
        member.peer().offer(protocol.encode(request.requestId(), type, event));
        String notice = protocol.encode(null, type, event);
        Duration ttl = Duration.ofMillis(stamp.expiresAt() - now);
        for (var entry : members.entrySet()) {
            Member target = entry.getValue();
            if (target == member || target.accountId() == null) {
                continue;
            }
            boolean player = push.players.contains(target.userId())
                    && reconnect.get().canControlGame(target.accountId(), entry.getKey(), gameId);
            if (player || approvedSpectator(entry.getKey(), target, gameId) != null) {
                target.peer().offerTransient(notice, ttl);
                aiAudience.add(target.userId());
            }
        }
        var bridge=aiBridge;
        if (!ping && bridge!=null) {
            String channel=channels.channelOf(member.userId());
            var position=channels.positionOf(member.userId());
            if(channel!=null) {
                String nickname=channels.worldState(channel).avatars().stream().filter(a -> a.userId().equals(member.userId()))
                        .map(a -> a.nickname()==null?member.userId():a.nickname()).findFirst().orElse(member.userId());
                bridge.chat(new com.ssafy.ontop.ai.WorldAiBridge.Chat(gameId+":"+member.userId()+":"+eventId,
                        channel,member.userId(),nickname,text,now,position==null?0:position.x(),position==null?0:position.y(),
                        position==null?0:position.z(),java.util.List.copyOf(aiAudience),gameId,position==null));
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
        String blocked = gameActionBlockReason(sessionId, member, gameId);
        if (blocked != null) {
            fail(request, blocked, blocked.equals("GAME_ACTION_GAME_FINISHED")
                    ? "이미 끝난 경기입니다." : "현재 경기 복구 상태를 먼저 확인해주세요.");
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
                error = gameActionBlockReason(sessionId, member, gameId);
                if (error == null) {
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

    private void sendGameForfeit(String sessionId, Member member, Request request) {
        if (member.accountId() == null) {
            fail(request, "GAME_FORFEIT_AUTH_REQUIRED", "인증된 사용자만 기권할 수 있습니다.");
        }
        if (gameActions.isEmpty()) {
            fail(request, "GAME_FORFEIT_NOT_CONFIGURED", "경기 입력 연결이 준비되지 않았습니다.");
        }
        String gameId = request.payload().path("gameId").asText();
        if (!canForfeitGame(sessionId, member, gameId)) {
            fail(request, "GAME_RECOVERY_REQUIRED", "현재 경기 복구 상태를 먼저 확인해주세요.");
        }
        if (!actionRequests.add(sessionId)) {
            fail(request, "GAME_ACTION_PENDING", "이전 경기 입력이 처리 중입니다.");
        }
        var command = new GameForfeitCommand(member.accountId(), gameId,
                request.payload().path("actionId").asText());
        startWorkers.execute(() -> {
            GameForfeitResult result = null;
            String error = null;
            try {
                if (!canForfeitGame(sessionId, member, gameId)) {
                    error = "GAME_RECOVERY_REQUIRED";
                } else {
                    result = gameActions.orElseThrow().forfeit(command);
                    if (result == null || result.userId() != command.userId() || !gameId.equals(result.gameId())
                            || !command.actionId().equals(result.actionId()) || result.version() < 0) {
                        error = "GAME_FORFEIT_INVALID";
                    }
                }
            } catch (GameActionGateway.Rejected rejected) {
                error = "GAME_FORFEIT_" + rejected.reason().name();
            } catch (RuntimeException exception) {
                error = "GAME_FORFEIT_UNAVAILABLE";
            }
            finishGameForfeit(sessionId, member, request.requestId(), result, error);
        });
    }

    private synchronized boolean canForfeitGame(String sessionId, Member member, String gameId) {
        return !stopped && members.get(sessionId) == member && reconnect.isPresent()
                && reconnect.get().canForfeitGame(member.accountId(), sessionId, gameId);
    }

    private synchronized void finishGameForfeit(String sessionId, Member member, String requestId,
            GameForfeitResult result, String error) {
        if (stopped || members.get(sessionId) != member) { return; }
        actionRequests.remove(sessionId);
        if (error != null) {
            member.peer().offer(protocol.error(requestId, error, "기권을 처리할 수 없습니다."));
        } else {
            member.peer().offer(protocol.encode(requestId, "GAME_FORFEIT_RESULT", Map.of(
                    "gameId", result.gameId(), "actionId", result.actionId(), "version", result.version(),
                    "duplicate", result.duplicate())));
            reconnect.orElseThrow().forfeitResolved(member.accountId(), sessionId);
        }
    }

    private synchronized boolean canSendGameAction(String sessionId, Member member, String gameId) {
        return !stopped && members.get(sessionId) == member && reconnect.isPresent()
                && reconnect.get().canControlGame(member.accountId(), sessionId, gameId);
    }

    private synchronized String gameActionBlockReason(String sessionId, Member member, String gameId) {
        if (canSendGameAction(sessionId, member, gameId)) { return null; }
        // 종료 방송과 교차한 돌탑 실시간 입력에는 이미 확정된 종료 상태를 돌려준다.
        TableStartAttempt attempt = starts.get(seating.get(member.userId()));
        if (!stopped && members.get(sessionId) == member && attempt != null && attempt.ended(gameId)
                && "STONE_RUMBLE".equals(attempt.command().gameCode())
                && attempt.command().participants().stream().anyMatch(p -> p.userId().equals(member.userId()))) {
            return "GAME_ACTION_GAME_FINISHED";
        }
        return "GAME_RECOVERY_REQUIRED";
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

    private record ReactionRound(String gameId, Set<Long> users) { }

    private record Member(String userId, TablePeer peer, Long accountId, String sessionId, GameDeliveryScope delivery) {
    }

    private record PendingMapConnection(String loginSessionId, boolean reservedStart) {
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
        // 마지막으로 전달한 공개 상태의 게임 종류·진행 상태·참가자 userId.
        private String gameCode;
        private String status;
        private Set<String> players = Set.of();
        private com.fasterxml.jackson.databind.JsonNode publicState;

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
