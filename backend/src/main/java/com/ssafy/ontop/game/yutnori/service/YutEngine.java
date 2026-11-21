package com.ssafy.ontop.game.yutnori.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.game.yutnori.domain.YutChat;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiPredicate;
import java.util.function.Consumer;
import java.util.random.RandomGenerator;

/** 무료 윷놀이. 대기는 REST, 시작 이후 입력·재접속은 공통 GameEngine 경로를 사용한다. */
public final class YutEngine implements GameEngine {
    private final ObjectMapper mapper;
    private final Clock clock;
    private final RandomGenerator random;
    private final GameEngineRouter router;
    private final Consumer<Object> events;
    private final Consumer<Long> recovery;
    private final BiPredicate<Long, String> connected;
    private final Map<String, YutMatch> games = new LinkedHashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final Map<Long, String> recoveryLatest = new HashMap<>();
    private final Map<String, Creation> creations = new HashMap<>();
    private final Map<String, Map<String, Receipt>> receipts = new HashMap<>();
    private final Map<String, GameForfeitResult> forfeits = new HashMap<>();
    private final Map<Long, String> watching = new HashMap<>();
    private final Map<Long, Long> feedbackAt = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final Map<String, YutFinished> terminal = new HashMap<>();
    private final List<Object> outbox = new ArrayList<>();
    private final List<Long> recoveryOutbox = new ArrayList<>();

    public YutEngine(ObjectMapper mapper, Clock clock, RandomGenerator random, GameEngineRouter router,
            Consumer<Object> events, Consumer<Long> recovery, BiPredicate<Long, String> connected) {
        this.mapper = mapper;
        this.clock = clock;
        this.random = random;
        this.router = router;
        this.events = events;
        this.recovery = recovery;
        this.connected = connected;
    }

    public synchronized ObjectNode create(long user, String channel, String key, String name, String nickname,
            YutMatch.Rules rules) {
        return create(user, channel, key, name, nickname, rules, 2, 4);
    }

    public synchronized ObjectNode create(long user, String channel, String key, String name, String nickname,
            YutMatch.Rules rules, int teamCount, int pieceCount) {
        require(teamCount >= 2 && teamCount <= 4 && pieceCount >= 1 && pieceCount <= 4,
                "팀은 2~4팀, 팀별 말은 1~4개로 선택해주세요.");
        require(user > 0 && channel != null && channel.matches("[A-Za-z0-9_-]{1,64}")
                && key != null && key.matches("[A-Za-z0-9_-]{1,64}") && name != null
                && !name.isBlank() && name.length() <= 24, "방 정보를 확인해주세요.");
        String identity = user + ":" + key;
        Creation previous = creations.get(identity);
        if (previous != null) {
            require(previous.channel().equals(channel) && previous.name().equals(name)
                    && previous.rules().equals(rules) && previous.teamCount() == teamCount
                    && previous.pieceCount() == pieceCount, "같은 방 생성 요청의 내용이 달라졌어요.");
            return member(user, previous.gameId());
        }
        require(current(user) == null && connected.test(user, channel) && games.size() < 256,
                "기존 방을 나가거나 공원 연결을 확인해주세요.");
        YutMatch match = new YutMatch("yut-" + UUID.randomUUID(), channel, name.trim(), user, nickname, rules,
                teamCount, pieceCount, clock.millis());
        games.put(match.id, match);
        latest.put(user, match.id);
        watching.remove(user);
        creations.put(identity, new Creation(match.id, channel, name, rules, teamCount, pieceCount));
        return snapshot(match, user);
    }

    public synchronized ObjectNode join(long user, String channel, String id, String nickname) {
        YutMatch match = game(id);
        require(match.channel.equals(channel) && connected.test(user, channel), "같은 공원의 방에 참가해주세요.");
        YutMatch existing = current(user);
        require(existing == null || existing == match, "기존 방을 먼저 나가주세요.");
        match.join(user, nickname);
        match.touched = clock.millis();
        latest.put(user, id);
        watching.remove(user);
        changed(match);
        return snapshot(match, user);
    }

    public synchronized ObjectNode rooms(long user, String channel) {
        ObjectNode result = mapper.createObjectNode();
        var list = result.putArray("rooms");
        for (YutMatch match : games.values()) {
            if (match.channel.equals(channel) && !match.phase.equals("FINISHED")) {
                list.addObject().put("gameId", match.id).put("name", match.name)
                        .put("hostNickname", match.players.get(match.host).nickname)
                        .put("players", match.players.size()).put("phase", match.phase)
                        .put("teamCount", match.teamCount).put("pieceCount", match.pieceCount);
            }
        }
        YutMatch mine = current(user);
        if (mine == null) {
            mine = games.get(watching.get(user));
        }
        if (mine != null && mine.channel.equals(channel)) {
            result.set("mine", snapshot(mine, user));
        } else {
            result.putNull("mine");
        }
        return result;
    }

    public synchronized ObjectNode member(long user, String id) {
        return snapshot(requireMember(user, id), user);
    }

    public synchronized boolean owns(long user, String channel) {
        YutMatch match = current(user);
        return match != null && match.channel.equals(channel);
    }

    public synchronized List<Long> waitingPlayers(long user, String id) {
        YutMatch match = requireMember(user, id);
        require(user == match.host && match.phase.equals("WAITING"), "방장만 시작할 수 있어요.");
        return List.copyOf(match.players.keySet());
    }

    public synchronized ObjectNode lobby(long user, String id, com.fasterxml.jackson.databind.JsonNode input) {
        YutMatch match = requireMember(user, id);
        require(match.phase.equals("WAITING"), "이미 시작한 경기예요.");
        match.act(user, input, random, clock.millis());
        return snapshot(match, user);
    }

    public ObjectNode start(long user, String id) {
        List<Long> members;
        ObjectNode result;
        synchronized (this) {
            YutMatch match = requireMember(user, id);
            require(match.host == user && match.phase.equals("WAITING"), "방장만 시작할 수 있어요.");
            members = List.copyOf(match.players.keySet());
            require(members.size() >= 2 && match.players.values().stream().allMatch(player -> player.ready)
                    && match.players.values().stream().map(player -> player.team).distinct().count() == match.teamCount
                    && members.stream().allMatch(player -> connected.test(player, match.channel)),
                    "선택한 모든 팀이 연결하고 준비해주세요.");
            // 무료 경기이므로 판돈 예약을 만들지 않으며 공유 라우터의 점유 검사는 그대로 사용한다.
            router.register(this, id, "folk:" + id, members);
            match.registered = true;
            match.start(random, clock.millis());
            members.forEach(member -> recoveryLatest.put(member, id));
            result = snapshot(match, user);
        }
        members.forEach(recovery);
        events.accept(new GameStateChanged(id, result.path("version").asLong()));
        return result;
    }

    public synchronized void leave(long user, String id) {
        if (id.equals(watching.get(user))) {
            watching.remove(user);
            return;
        }
        YutMatch match = requireMember(user, id);
        require(!match.phase.equals("PLAYING") || match.eliminatedTeams.contains(match.players.get(user).team),
                "진행 중인 경기는 기권 후 나가주세요.");
        latest.remove(user, id);
        if (match.phase.equals("WAITING")) {
            if (match.host == user) {
                match.finish(-1, "YUT_CANCELLED");
            } else {
                match.players.remove(user);
                match.players.values().forEach(player -> player.ready = false);
            }
            match.version++;
        }
    }

    public synchronized ObjectNode watch(long user, String channel, String id) {
        YutMatch match = game(id);
        require(match.channel.equals(channel) && match.phase.equals("PLAYING") && current(user) == null
                && connected.test(user, channel), "같은 공원의 진행 중인 경기를 선택해주세요.");
        watching.put(user, id);
        return snapshot(match, user);
    }

    public synchronized void feedback(long user, String id, String text) {
        YutMatch match = game(id);
        require(match.players.containsKey(user) || id.equals(watching.get(user)), "같은 경기에서만 대화할 수 있어요.");
        require(connected.test(user, match.channel) && text != null && !text.isBlank() && text.length() <= 100
                && clock.millis() - feedbackAt.getOrDefault(user, 0L) >= 1000, "잠시 후 100자 안으로 보내주세요.");
        feedbackAt.put(user, clock.millis());
        String name = match.players.containsKey(user) ? match.players.get(user).nickname : "관전자";
        match.note(name + ": " + text.strip());
        match.version++;
        changed(match);
    }

    public synchronized void chat(long user, String id, String scope, String text) {
        YutMatch match = game(id);
        boolean participant = id.equals(latest.get(user)) && match.players.containsKey(user);
        boolean spectator = id.equals(watching.get(user));
        require((participant || spectator) && connected.test(user, match.channel), "현재 참가·관전 중인 경기에서만 대화할 수 있어요.");
        require("ALL".equals(scope) || "TEAM".equals(scope), "전체 또는 팀 채팅을 선택해주세요.");
        require(!"TEAM".equals(scope) || participant && !match.phase.equals("WAITING"),
                "팀 채팅은 경기 시작 후 같은 팀 참가자만 사용할 수 있어요.");
        require(text != null && !text.isBlank() && text.length() <= 100
                && clock.millis() - feedbackAt.getOrDefault(user, 0L) >= 1000, "잠시 후 100자 안으로 보내주세요.");
        feedbackAt.put(user, clock.millis());
        var player = participant ? match.players.get(user) : null;
        match.chat.append(user, player == null ? "관전자" : player.nickname, YutChat.Scope.valueOf(scope),
                player == null ? -1 : player.team, text.strip(), clock.millis());
        match.version++;
        changed(match);
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result;
        synchronized (this) {
            YutMatch match = requireMember(command.userId(), command.gameId());
            String key = command.userId() + ":" + command.actionId();
            var ledger = receipts.computeIfAbsent(match.id, ignored -> new HashMap<>());
            Receipt previous = ledger.get(key);
            if (previous != null) {
                if (!previous.command().equals(command)) {
                    throw new Rejected(Rejection.ACTION_ID_CONFLICT);
                }
                return previous.result();
            }
            if (!match.registered || !connected.test(command.userId(), match.channel)) {
                throw new Rejected(Rejection.ACCESS_DENIED);
            }
            if (!match.phase.equals("PLAYING")) {
                throw new Rejected(Rejection.GAME_FINISHED);
            }
            if (command.expectedVersion() != match.version) {
                throw new Rejected(Rejection.STALE_VERSION);
            }
            if (command.userId() != match.turnUser) {
                throw new Rejected(Rejection.NOT_YOUR_TURN);
            }
            // 같은 팀원도 차례인 사람의 입력을 대신 보낼 수 없다.
            match.act(command.userId(), command.input(), random, clock.millis());
            result = new GameActionResult(command.userId(), match.id, command.actionId(), match.version);
            ledger.put(key, new Receipt(command, result));
            if (match.phase.equals("FINISHED")) {
                complete(match);
            }
        }
        events.accept(new GameStateChanged(command.gameId(), result.version()));
        return result;
    }

    @Override
    public synchronized GameForfeitResult forfeit(GameForfeitCommand command) {
        YutMatch match = requireMember(command.userId(), command.gameId());
        String key = match.id + ":" + command.userId() + ":" + command.actionId();
        GameForfeitResult previous = forfeits.get(key);
        if (previous != null) {
            return new GameForfeitResult(previous.userId(), previous.gameId(), previous.actionId(), previous.version(), true);
        }
        require(match.registered, "시작하지 않은 방은 나가기를 선택해주세요.");
        if (!match.phase.equals("FINISHED")) {
            eliminate(match, match.players.get(command.userId()).team, "YUT_FORFEIT");
        }
        var result = new GameForfeitResult(command.userId(), match.id, command.actionId(), match.version, false);
        forfeits.put(key, result);
        return result;
    }

    @Override
    public synchronized Optional<GameStateView> load(long user, String id) {
        YutMatch match = games.get(id);
        if (match == null || !match.players.containsKey(user) && !id.equals(watching.get(user))) {
            return Optional.empty();
        }
        return Optional.of(new GameStateView(user, id, match.version,
                match.players.containsKey(user) ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                publicState(match), privateState(match, user), "folk:" + id));
    }

    @Override
    public synchronized Optional<GameRecoverySnapshot> load(long user) {
        YutMatch match = games.get(recoveryLatest.get(user));
        if (match == null || !match.registered) {
            return Optional.empty();
        }
        ObjectNode state = snapshot(match, user);
        return Optional.of(new GameRecoverySnapshot(user, match.id, match.players.size(), match.version,
                match.phase.equals("FINISHED") ? GameRecoverySnapshot.Phase.FINISHED
                        : match.eliminatedTeams.contains(match.players.get(user).team)
                                ? GameRecoverySnapshot.Phase.ELIMINATED : GameRecoverySnapshot.Phase.PLAYING,
                state));
    }

    @Override
    public synchronized boolean isUnreservedSession(GameRecoverySnapshot snapshot) {
        YutMatch match = games.get(snapshot.gameId());
        return match != null && match.registered && match.players.containsKey(snapshot.userId());
    }

    @Override
    public synchronized void graceExpired(GraceExpiration command) {
        YutMatch match = games.get(command.gameId());
        if (match != null && match.phase.equals("PLAYING") && match.players.containsKey(command.userId())) {
            eliminate(match, match.players.get(command.userId()).team, "YUT_DISCONNECT_TIMEOUT");
        }
    }

    public synchronized List<ObjectNode> tick() {
        long now = clock.millis();
        List<ObjectNode> finishedSnapshots = new ArrayList<>();
        for (YutMatch match : List.copyOf(games.values())) {
            if (match.phase.equals("PLAYING") && now >= match.deadline) {
                eliminate(match, match.team, "YUT_TURN_TIMEOUT");
            }
            if (match.phase.equals("WAITING") && now - match.touched > 600_000) {
                match.finish(-1, "YUT_CANCELLED");
                match.version++;
            }
            if (match.registered && match.phase.equals("FINISHED")) {
                finishedSnapshots.add(snapshot(match, match.host));
            }
            if (match.phase.equals("FINISHED") && now - match.touched > 1_800_000
                    && (!match.registered || router.forgetFinished(this, match.id))) {
                games.remove(match.id);
                latest.values().removeIf(match.id::equals);
                recoveryLatest.values().removeIf(match.id::equals);
                watching.values().removeIf(match.id::equals);
                creations.values().removeIf(value -> value.gameId().equals(match.id));
                receipts.remove(match.id);
                terminal.remove(match.id);
                forfeits.keySet().removeIf(key -> key.startsWith(match.id + ":"));
            }
        }
        return finishedSnapshots;
    }

    private void eliminate(YutMatch match, int team, String reason) {
        if (match.eliminatedTeams.contains(team)) {
            return;
        }
        match.eliminate(team, reason, clock.millis());
        for (long member : match.teamPlayers(team)) {
            router.releasePlayer(this, match.id, member);
            recoveryOutbox.add(member);
        }
        if (match.phase.equals("FINISHED")) {
            complete(match);
        }
        changed(match);
    }

    private void complete(YutMatch match) {
        router.finished(this, match.id);
        if (!terminal.containsKey(match.id)) {
            var event = new YutFinished(lifecycle.finished(match.id, "folk:" + match.id, "YUTNORI", match.version,
                    List.copyOf(match.players.keySet()), match.winner < 0 ? List.of() : match.teamPlayers(match.winner),
                    match.reason, clock.instant()));
            terminal.put(match.id, event);
            outbox.add(event);
            recoveryOutbox.addAll(match.players.keySet());
        }
    }

    private ObjectNode snapshot(YutMatch match, long user) {
        var node = mapper.createObjectNode().put("gameId", match.id).put("version", match.version)
                .put("registered", match.registered).put("role", match.players.containsKey(user) ? "PLAYER" : "SPECTATOR");
        node.set("publicState", publicState(match));
        node.set("privateState", privateState(match, user));
        return node;
    }

    private ObjectNode privateState(YutMatch match, long user) {
        var state = mapper.createObjectNode();
        var player = match.players.get(user);
        if (player != null && match.id.equals(latest.get(user))) {
            state.set("teamChat", mapper.valueToTree(match.chat.team(player.team)));
        }
        return state;
    }

    private ObjectNode publicState(YutMatch match) {
        var state = mapper.createObjectNode().put("gameCode", "YUTNORI").put("phase", match.phase)
                .put("channelId", match.channel).put("roomName", match.name).put("host", Long.toString(match.host))
                .put("turnUser", Long.toString(match.turnUser)).put("team", match.team).put("credits", match.credits)
                .put("deadline", match.deadline).put("winner", match.winner).put("reason", match.reason)
                .put("message", match.message).put("entryFee", 0)
                .put("teamCount", match.teamCount).put("pieceCount", match.pieceCount);
        state.set("eliminatedTeams", mapper.valueToTree(match.eliminatedTeams));
        state.set("rules", mapper.valueToTree(match.rules));
        state.set("rolls", mapper.valueToTree(match.rolls));
        state.set("lastThrow", mapper.valueToTree(match.lastThrow));
        state.set("moves", mapper.valueToTree(match.legalMoves()));
        state.set("opening", mapper.valueToTree(match.opening));
        state.set("openingTeams", mapper.valueToTree(match.openingTeams));
        state.set("openingFinalists", mapper.valueToTree(match.openingFinalists));
        state.put("openingRound", match.openingRound);
        state.set("log", mapper.valueToTree(match.log));
        state.set("chat", mapper.valueToTree(match.chat.everyone()));
        state.set("pieces", mapper.valueToTree(match.pieces.stream()
                .map(tokens -> tokens.stream().map(YutMatch::position).toList()).toList()));
        var players = state.putArray("players");
        match.players.values().forEach(player -> players.addObject().put("userId", Long.toString(player.userId))
                .put("nickname", player.nickname).put("team", player.team).put("ready", player.ready)
                .put("connected", connected.test(player.userId, match.channel)));
        return state;
    }

    private YutMatch current(long user) {
        return games.get(latest.get(user));
    }

    private YutMatch game(String id) {
        YutMatch match = games.get(id);
        require(match != null, "방이 닫혔어요. 목록을 새로고침해주세요.");
        return match;
    }

    private YutMatch requireMember(long user, String id) {
        YutMatch match = game(id);
        if (!match.players.containsKey(user)) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        return match;
    }

    private void changed(YutMatch match) {
        outbox.add(new GameStateChanged(match.id, match.version));
    }

    /** TableHub는 자신의 잠금 안에서 엔진을 조회하므로 엔진 잠금 안에서 이벤트를 발행하지 않는다. */
    public void dispatch() {
        List<Object> notices;
        List<Long> recoveries;
        synchronized (this) {
            notices = List.copyOf(outbox);
            recoveries = List.copyOf(recoveryOutbox);
            outbox.clear();
            recoveryOutbox.clear();
        }
        recoveries.forEach(recovery);
        notices.forEach(events);
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }

    private record Creation(String gameId, String channel, String name, YutMatch.Rules rules,
            int teamCount, int pieceCount) { }
    private record Receipt(GameActionCommand command, GameActionResult result) { }
}
