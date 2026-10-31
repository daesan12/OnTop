package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiMatch;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiItemRules;
import com.ssafy.ontop.game.alkkagi.service.AlkkagiSocialRoom;
import com.ssafy.ontop.game.alkkagi.service.AlkkagiInputs;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiSettings;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

/** 테스트 클래스패스 전용. 회원 인증·실제 판돈·공원 연결을 대체하지 않는다. */
public final class AlkkagiDemoApplication {
    public static void main(String[] args) {
        new SpringApplication(DemoConfig.class).run("--server.address=127.0.0.1", "--server.port=19183",
                "--spring.profiles.active=alkkagi-physics-demo", "--spring.flyway.enabled=false",
                "--spring.main.banner-mode=off");
    }

    @Configuration(proxyBeanMethods = false)
    @Profile("alkkagi-physics-demo")
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            SecurityAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class,
            ManagementWebSecurityAutoConfiguration.class})
    @EnableWebSocket
    public static class DemoConfig {
        @Bean(destroyMethod = "close")
        DemoSocket alkkagiSocket(ObjectMapper mapper) { return new DemoSocket(mapper); }

        @Bean
        WebSocketConfigurer alkkagiRoutes(DemoSocket socket) {
            return registry -> registry.addHandler(socket, "/dev/alkkagi-ws")
                    .setAllowedOrigins("http://localhost:5206", "http://127.0.0.1:5206");
        }
    }

    public static final class DemoSocket extends TextWebSocketHandler implements AutoCloseable {
        private final ObjectMapper mapper;
        private final java.time.Clock clock;
        private final Map<String, Client> clients = new ConcurrentHashMap<>();
        private final ScheduledExecutorService physics = Executors.newSingleThreadScheduledExecutor();
        private final ScheduledExecutorService sender = Executors.newSingleThreadScheduledExecutor();
        private final AtomicReference<Outbound> latest = new AtomicReference<>();
        private final AtomicBoolean sendScheduled = new AtomicBoolean();
        private final ArrayBlockingQueue<Runnable> commands = new ArrayBlockingQueue<>(64);
        private AlkkagiMatch match;
        private AlkkagiSettings tuning = AlkkagiSettings.provisional();
        private AlkkagiItemRules itemRules = AlkkagiItemRules.localPreview();
        private long sequence;
        private int frames;
        private AlkkagiSocialRoom social;
        private String socialGameId;
        private final long[] absentSince = {-1, -1};
        private long visitorNumber;

        public DemoSocket(ObjectMapper mapper) { this(mapper, java.time.Clock.systemUTC()); }

        public DemoSocket(ObjectMapper mapper, java.time.Clock clock) {
            this.mapper = mapper; this.clock = clock;
            // 생성부터 변경·조회까지 dyn4j 접근은 오직 이 스레드에서만 수행한다.
            physics.execute(() -> match = new AlkkagiMatch(tuning, itemRules));
            physics.scheduleAtFixedRate(this::step, 0, 8_333_333, TimeUnit.NANOSECONDS);
        }

        private void step() {
            try {
                for (int i = 0; i < 8; i++) {
                    Runnable command = commands.poll();
                    if (command == null) { break; }
                    command.run();
                }
                long currentTime = clock.millis();
                if (!match.snapshot(currentTime).gameId().equals(socialGameId)) {
                    socialGameId = match.snapshot(currentTime).gameId(); social = new AlkkagiSocialRoom(socialGameId);
                    java.util.Arrays.fill(absentSince, -1);
                }
                match.advance(currentTime);
                var current = match.snapshot(currentTime);
                if (!current.stage().equals("WAITING") && !current.stage().equals("FINISHED")) {
                    for (int actor = 0; actor < 2; actor++) {
                        int id = actor;
                        if (clients.values().stream().anyMatch(c -> c.actor == id)) absentSince[id] = -1;
                        else if (absentSince[id] < 0) absentSince[id] = currentTime;
                        else if (currentTime - absentSince[id] >= 30_000) {
                            try { match.depart(id, "DISCONNECT_TIMEOUT", currentTime); }
                            catch (IllegalArgumentException finished) { if (!finished.getMessage().equals("GAME_FINISHED")) throw finished; }
                            break;
                        }
                    }
                }
                if (++frames % 6 == 0) {
                    long now = clock.millis();
                    long seq = ++sequence;
                    social.retainSessions(clients.keySet());
                    com.fasterxml.jackson.databind.node.ObjectNode publicState = mapper.valueToTree(match.snapshot(now));
                    publicState.set("social", mapper.valueToTree(social.snapshot(match.snapshot(now), now)));
                    publicState.set("connections", mapper.valueToTree(Map.of(
                            "red", clients.values().stream().anyMatch(c -> c.actor == 0),
                            "green", clients.values().stream().anyMatch(c -> c.actor == 1),
                            "viewers", clients.values().stream().filter(c -> c.actor == -1).count())));
                    publicState.set("reconnectDeadlines", mapper.valueToTree(java.util.Arrays.asList(
                            absentSince[0] < 0 ? null : absentSince[0] + 30_000,
                            absentSince[1] < 0 ? null : absentSince[1] + 30_000)));
                    latest.set(new Outbound(mapper.writeValueAsString(Map.of("type", "STATE", "seq", seq,
                            "state", publicState)), Map.of(
                            0, mapper.writeValueAsString(Map.of("type", "PRIVATE_STATE", "seq", seq, "state", match.privateView(0))),
                            1, mapper.writeValueAsString(Map.of("type", "PRIVATE_STATE", "seq", seq, "state", match.privateView(1))))));
                    scheduleSend();
                }
            } catch (Exception exception) {
                // 스케줄러 예외가 이후 tick 전체를 취소하지 않도록 실패를 명시적으로 전달한다.
                latest.set(new Outbound("{\"type\":\"ERROR\",\"code\":\"SIMULATION_FAILURE\"}", Map.of()));
                scheduleSend();
                org.slf4j.LoggerFactory.getLogger(DemoSocket.class).error("알까기 로컬 tick 실패", exception);
            }
        }

        @Override
        public synchronized void afterConnectionEstablished(WebSocketSession session) throws Exception {
            String role = UriComponentsBuilder.fromUri(session.getUri()).build().getQueryParams().getFirst("role");
            int actor = "red".equals(role) ? 0 : "green".equals(role) ? 1 : "viewer".equals(role) ? -1 : -2;
            if (actor == -2 || clients.size() >= 12) {
                session.close(new CloseStatus(1008, actor == -2 ? "INVALID_ROLE" : "LOCAL_CONNECTION_LIMIT"));
                return;
            }
            session.setTextMessageSizeLimit(2048);
            clients.put(session.getId(), new Client(actor,
                    new ConcurrentWebSocketSessionDecorator(session, 1000, 32768),
                    actor == 0 ? "홍팀" : actor == 1 ? "청팀" : "관전자 " + ++visitorNumber));
        }

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            Client client = clients.get(session.getId());
            if (client == null) { return; }
            // 로컬 역할 지정은 인증이 아니다. 요청 body로 actor를 변경할 수는 없다.
            JsonNode input;
            try {
                input = mapper.readTree(message.getPayload());
            } catch (IOException exception) {
                client.offer("{\"type\":\"ERROR\",\"code\":\"INVALID_JSON\"}");
                return;
            }
            if (input == null || !input.isObject() || !commands.offer(() -> command(client, input))) {
                client.offer("{\"type\":\"ERROR\",\"code\":\"REQUEST_LIMIT\"}");
            }
        }

        private void command(Client client, JsonNode input) {
            try {
                String type = input.path("type").asText();
                if (java.util.Set.of("CHAT", "CURSOR", "ADVICE").contains(type)) {
                    if (social == null) throw new IllegalArgumentException("NOT_READY");
                    social.apply(client.socket.getId(), client.label, client.actor, input,
                            match.snapshot(clock.millis()), clock.millis());
                    if (!type.equals("CURSOR")) client.offer(mapper.writeValueAsString(Map.of("type", "SOCIAL_ACCEPTED", "kind", type)));
                    return;
                }
                if (client.actor < 0) { throw new IllegalArgumentException("PLAYER_REQUIRED"); }
                if (type.equals("START")) {
                    if (client.actor != 0) { throw new IllegalArgumentException("RED_START_ONLY"); }
                    match.start(clock.millis());
                } else if (type.equals("FORFEIT")) {
                    if (!input.path("gameId").asText().equals(match.snapshot(0).gameId())) throw new IllegalArgumentException("STALE_GAME");
                    long accepted = match.forfeit(client.actor, input.path("actionId").asText(), clock.millis());
                    client.offer(mapper.writeValueAsString(Map.of("type", "FORFEIT_ACCEPTED", "version", accepted, "gameId", match.snapshot(0).gameId())));
                } else if (type.equals("RESET")) {
                    if (client.actor != 0) { throw new IllegalArgumentException("RED_RESET_ONLY"); }
                    match = new AlkkagiMatch(tuning, itemRules);
                } else if (type.equals("TUNE") || type.equals("TUNE_RESET")) {
                    if (client.actor != 0) { throw new IllegalArgumentException("RED_TUNING_ONLY"); }
                    var current = match.snapshot(clock.millis());
                    if (!input.path("gameId").asText().equals(current.gameId())
                            || !input.path("expectedVersion").isIntegralNumber()
                            || !input.path("expectedVersion").canConvertToLong()
                            || input.path("expectedVersion").asLong() != current.version()) {
                        throw new IllegalArgumentException("STALE_TUNING");
                    }
                    AlkkagiSettings next = type.equals("TUNE_RESET") ? AlkkagiSettings.provisional()
                            : readTuning(input);
                    // 미리보기 값으로 현재 발사를 바꾸지 않고, 명시적으로 새 판을 만든다.
                    AlkkagiMatch replacement = new AlkkagiMatch(next, itemRules);
                    tuning = next;
                    match = replacement;
                    client.offer("{\"type\":\"TUNING_APPLIED\"}");
                } else if (type.equals("TUNE_ITEMS")) {
                    if (client.actor != 0) throw new IllegalArgumentException("RED_TUNING_ONLY");
                    var current = match.snapshot(clock.millis());
                    if (!input.path("gameId").asText().equals(current.gameId())
                            || !input.path("expectedVersion").isIntegralNumber() || !input.path("expectedVersion").canConvertToLong()
                            || input.path("expectedVersion").asLong(-1) != current.version())
                        throw new IllegalArgumentException("STALE_TUNING");
                    var r = input.path("rules");
                    var fields = java.util.List.of("wallLength", "wallThickness", "wallMargin", "relocateDistance", "powerMultiplier",
                            "growScale", "shrinkScale", "defendMassMultiplier", "effectOpponentTurns");
                    if (!r.isObject() || r.size() != fields.size() || fields.stream().anyMatch(f -> !r.path(f).isNumber())
                            || !r.path("effectOpponentTurns").isIntegralNumber() || !r.path("effectOpponentTurns").canConvertToInt())
                        throw new IllegalArgumentException("INVALID_ITEM_RULES");
                    var next = new AlkkagiItemRules(r.path("wallLength").asDouble(), r.path("wallThickness").asDouble(),
                            r.path("wallMargin").asDouble(), r.path("relocateDistance").asDouble(), r.path("powerMultiplier").asDouble(),
                            r.path("growScale").asDouble(), r.path("shrinkScale").asDouble(), r.path("defendMassMultiplier").asDouble(),
                            r.path("effectOpponentTurns").asInt());
                    match = new AlkkagiMatch(tuning, next); itemRules = next;
                    client.offer("{\"type\":\"TUNING_APPLIED\"}");
                } else if (type.equals("TEST_CARDS")) {
                    if (client.actor != 0) throw new IllegalArgumentException("RED_PRACTICE_ONLY");
                    var current = match.snapshot(clock.millis());
                    if (!input.path("gameId").asText().equals(current.gameId())
                            || !input.path("expectedVersion").isIntegralNumber()
                            || !input.path("expectedVersion").canConvertToLong()
                            || input.path("expectedVersion").asLong(-1) != current.version())
                        throw new IllegalArgumentException("STALE_VERSION");
                    if (!current.stage().equals("WAITING") || !match.privateView(0).cards().isEmpty()
                            || !match.privateView(1).cards().isEmpty())
                        throw new IllegalArgumentException("PRACTICE_WAITING_ONLY");
                    var types = new java.util.ArrayList<String>();
                    if (input.has("cards")) {
                        if (!input.path("cards").isArray() || input.path("cards").size() < 1 || input.path("cards").size() > 2)
                            throw new IllegalArgumentException("INVALID_PRACTICE_CARDS");
                        var allowed = java.util.Set.of("WALL", "RELOCATE", "POWER_UP", "GROW", "SHRINK", "EXTRA_SHOT", "SWAP", "DEFEND");
                        for (var card : input.path("cards")) {
                            if (!card.isTextual() || !allowed.contains(card.asText())) throw new IllegalArgumentException("INVALID_CARD_TYPE");
                            types.add(card.asText());
                        }
                    } else { types.add("SWAP"); types.add("EXTRA_SHOT"); }
                    for (int actor = 0; actor < 2; actor++) for (var cardType : types) match.receiveCard(actor, cardType);
                } else if (type.equals("ITEM_USE") || type.equals("SHOT") || type.equals("CARD_CHOOSE")) {
                    if (!input.path("gameId").asText().equals(match.snapshot(0).gameId())) throw new IllegalArgumentException("STALE_GAME");
                    if (!input.path("expectedVersion").isIntegralNumber() || !input.path("expectedVersion").canConvertToLong()
                            || input.path("expectedVersion").asLong() < 0 || !input.path("actionId").isTextual())
                        throw new IllegalArgumentException("INVALID_ACTION");
                    var action = ((com.fasterxml.jackson.databind.node.ObjectNode) input).deepCopy();
                    action.remove(java.util.List.of("gameId", "actionId", "expectedVersion"));
                    long accepted = AlkkagiInputs.apply(match, client.actor, input.path("actionId").asText(),
                            input.path("expectedVersion").asLong(), action, clock.millis());
                    client.offer(mapper.writeValueAsString(Map.of("type", type.equals("SHOT") ? "SHOT_ACCEPTED" : type.equals("CARD_CHOOSE") ? "CARD_CHOSEN" : "ITEM_ACCEPTED",
                            "version", accepted, "gameId", match.snapshot(0).gameId(), "actionId", input.path("actionId").asText())));
                } else {
                    throw new IllegalArgumentException("UNKNOWN_TYPE");
                }
            } catch (IllegalArgumentException exception) {
                try {
                    client.offer(mapper.writeValueAsString(Map.of("type", "ERROR", "code", exception.getMessage())));
                } catch (IOException encoding) {
                    throw new IllegalStateException(encoding);
                }
            } catch (IOException exception) {
                throw new IllegalStateException(exception);
            }
        }

        private AlkkagiSettings readTuning(JsonNode input) {
            double impulse = input.path("maximumImpulse").asDouble(Double.NaN);
            double deceleration = input.path("deceleration").asDouble(Double.NaN);
            double restitution = input.path("restitution").asDouble(Double.NaN);
            if (!input.path("maximumImpulse").isNumber() || !input.path("deceleration").isNumber()
                    || !input.path("restitution").isNumber() || !Double.isFinite(impulse)
                    || !Double.isFinite(deceleration) || !Double.isFinite(restitution)
                    || impulse < 0.5 || impulse > 30 || deceleration < 0.1 || deceleration > 60
                    || restitution < 0 || restitution > 1) {
                throw new IllegalArgumentException("INVALID_TUNING");
            }
            AlkkagiSettings base = AlkkagiSettings.provisional();
            return new AlkkagiSettings(base.halfWidth(), base.halfHeight(), base.stepSeconds(), deceleration,
                    restitution, impulse, base.stopSpeed(), base.settleSteps(), base.maximumSimulationSteps(),
                    base.turnMillis(), base.matchMillis());
        }

        private void scheduleSend() {
            // 발행 주기는 physics의6스텝이다. 별도 송신 타이머와 위상이 어긋나지 않게 한다.
            // 느린 수신자가 있어도 큐는 활성 작업+예약 작업 한 개로 제한하고 최신 상태만 보낸다.
            if (sender.isShutdown() || !sendScheduled.compareAndSet(false, true)) return;
            try {
                sender.execute(() -> {
                    try { send(); }
                    finally {
                        sendScheduled.set(false);
                        if (latest.get() != null) scheduleSend();
                    }
                });
            } catch (java.util.concurrent.RejectedExecutionException closing) {
                sendScheduled.set(false);
            }
        }

        private void send() {
            Outbound snapshot = latest.getAndSet(null);
            for (Client client : clients.values()) {
                try {
                    for (int i = 0; i < 8; i++) {
                        String response = client.replies.poll();
                        if (response == null) { break; }
                        client.socket.sendMessage(new TextMessage(response));
                    }
                    if (snapshot != null) {
                        client.socket.sendMessage(new TextMessage(snapshot.publicJson()));
                        String privateJson = snapshot.ownerJson().get(client.actor);
                        if (privateJson != null) client.socket.sendMessage(new TextMessage(privateJson));
                    }
                } catch (Exception exception) {
                    clients.remove(client.socket.getId());
                    try { client.socket.close(CloseStatus.SESSION_NOT_RELIABLE); }
                    catch (IOException closeFailure) {
                        org.slf4j.LoggerFactory.getLogger(DemoSocket.class).debug("로컬 소켓 종료 실패", closeFailure);
                    }
                }
            }
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            clients.remove(session.getId());
        }

        @Override
        public void close() {
            physics.shutdownNow();
            sender.shutdownNow();
        }

        private record Outbound(String publicJson, Map<Integer, String> ownerJson) { }

        private static final class Client {
            private final int actor;
            private final WebSocketSession socket;
            private final String label;
            private final ArrayBlockingQueue<String> replies = new ArrayBlockingQueue<>(32);
            private Client(int actor, WebSocketSession socket, String label) { this.actor = actor; this.socket = socket; this.label = label; }
            private void offer(String reply) {
                if (!replies.offer(reply)) { replies.poll(); replies.offer(reply); }
            }
        }
    }
}
