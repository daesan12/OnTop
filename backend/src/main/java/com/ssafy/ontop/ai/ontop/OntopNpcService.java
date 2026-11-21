package com.ssafy.ontop.ai.ontop;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.winter.SnowballService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/** 모든 상태 접근은 TableHub 잠금 안에서 실행한다. 외부 모델 작업은 future로만 전달한다. */
public final class OntopNpcService {
    public interface Navigation {
        Point home();
        List<Point> path(Point from, Point to);
    }

    public interface Host {
        Map<String, Map<String, Position>> players();
        boolean available(String user);
        default boolean canAttack(String user) {
            return true;
        }
        boolean canGather(String channel, Position position);
        double distance(String channel, Position position, double yaw);
        void state(String channel, View view);
        void reply(String user, String requestId, Reply reply);
        void winter(String channel);
        void windup(String channel, SnowballService.Windup motion);
        void shot(String channel, SnowballService.Event event);
    }

    public record View(String channelId, long version, String id, String name, double x, double y, double z,
                       double yaw, String action, String opponentId, String result, long endsAt,
                       String speech, long speechUntil) {
    }

    public record Reply(String channelId, String userId, String id, String text, String speech, String source,
                        boolean closed, boolean pending, boolean invited) {
    }

    private static final long INVITE_MS = 30_000;
    private final Navigation navigation;
    private final OntopIntent.Chooser chooser;
    private final Host host;
    private final SnowballService snowballs;
    private final Map<String, Actor> actors = new HashMap<>();
    private final Map<String, Conversation> conversations = new HashMap<>();

    public OntopNpcService(Navigation navigation, OntopIntent.Chooser chooser, Host host, SnowballService snowballs) {
        this.navigation = navigation;
        this.chooser = chooser;
        this.host = host;
        this.snowballs = snowballs;
    }

    public static boolean command(String text) {
        return text.equals("/온탑") || text.matches("/온탑\\s[\\s\\S]*");
    }

    public void talk(String channel, String user, String requestId, String command, long now) {
        String text = command.substring(3).trim();
        var previous = conversations.get(user);
        if (previous != null && !previous.channel.equals(channel)) {
            conversations.remove(user);
        }
        if (!conversations.containsKey(user) && conversations.size() >= 256) {
            host.reply(user, requestId, new Reply(channel, user, requestId, text,
                    "지금은 대화가 많아. 잠시 후 다시 불러줘!", "LOCAL_RULES", false, false, false));
            return;
        }
        var conversation = conversations.computeIfAbsent(user, ignored -> new Conversation(channel));
        var cached = conversation.replies.get(requestId);
        if (cached != null) {
            host.reply(user, requestId, cached);
            return;
        }
        conversation.touched = now;
        var actor = actor(channel);
        var immediate = OntopIntent.local(text, conversation.invitedUntil > now);
        if (immediate == OntopIntent.STOP || immediate == OntopIntent.CLOSE || immediate == OntopIntent.ACCEPT
                || text.isEmpty()) {
            conversation.pending = null;
            apply(actor, user, requestId, text, conversation,
                    new OntopIntent.Decision(text.isEmpty() ? OntopIntent.GREET : immediate, "LOCAL_RULES"), now);
            return;
        }
        if (conversation.pending != null || now - conversation.lastRequest < 1_000) {
            respond(conversation, user, requestId, text, "한 문장씩 이야기해 줘. 잠깐만!", "LOCAL_RULES", false, false);
            return;
        }
        conversation.lastRequest = now;
        conversation.pending = new Pending(requestId, text, now,
                chooser.choose(text, conversation.invitedUntil > now, user.equals(actor.opponent)));
        respond(conversation, user, requestId, text, "잠깐, 생각하고 있어!", "PENDING", false, true);
    }

    public void tick(long now, double seconds) {
        var worlds = host.players();
        for (var entry : new ArrayList<>(conversations.entrySet())) {
            String user = entry.getKey();
            var conversation = entry.getValue();
            if (!worlds.getOrDefault(conversation.channel, Map.of()).containsKey(user)
                    || now - conversation.touched > 600_000) {
                conversations.remove(user);
                continue;
            }
            var pending = conversation.pending;
            if (pending != null && (pending.future.isDone() || now - pending.at >= 4_000)) {
                var decision = pending.future.isDone() && !pending.future.isCompletedExceptionally()
                        ? pending.future.join() : new OntopIntent.Decision(
                                OntopIntent.local(pending.text, conversation.invitedUntil > now), "LOCAL_FALLBACK");
                conversation.pending = null;
                apply(actor(conversation.channel), user, pending.id, pending.text, conversation, decision, now);
            }
        }
        for (String channel : worlds.keySet()) {
            var actor = actor(channel);
            advance(actor, worlds.get(channel), now, Math.min(.25, Math.max(0, seconds)));
            host.state(channel, view(actor, now));
        }
        actors.entrySet().removeIf(entry -> {
            if (worlds.containsKey(entry.getKey())) {
                return false;
            }
            snowballs.disconnected(entry.getValue().id);
            return true;
        });
    }

    private void apply(Actor actor, String user, String id, String text, Conversation conversation,
            OntopIntent.Decision decision, long now) {
        String speech;
        boolean closed = decision.intent() == OntopIntent.CLOSE;
        switch (decision.intent()) {
            case CLOSE, STOP -> {
                conversation.invitedUntil = 0;
                if (user.equals(actor.opponent)) {
                    finish(actor, "STOPPED", "좋아, 여기까지! 다음에 또 놀자.", now);
                }
                speech = closed ? "다음에 또 불러줘! 주변 채팅으로 돌아갈게." : "알겠어! 눈싸움은 그만할게.";
            }
            case INVITE -> {
                if (!actor.opponent.isEmpty()) {
                    speech = user.equals(actor.opponent) ? "우리 이미 눈싸움 중이야! 끝내려면 ‘그만’이라고 해줘."
                            : "지금 다른 친구랑 눈싸움 중이야. 끝난 뒤 다시 불러줘!";
                } else if (now < actor.restUntil) {
                    speech = "잠깐 숨 돌리는 중이야. 조금 뒤에 다시 하자!";
                } else {
                    conversation.invitedUntil = now + INVITE_MS;
                    speech = "좋아! 광장 서쪽 눈더미(-5, 44) 근처로 와서 ‘시작’이라고 해줘. 먼저 상대를 얼리면 승리!";
                }
            }
            case ACCEPT -> {
                speech = start(actor, user, conversation, now);
            }
            case RULES -> speech = "광장 서쪽 눈더미 근처에서 ‘눈싸움하자’ → ‘시작’! Q로 눈을 모으고, "
                    + "캐릭터가 바라보는 방향으로 Q를 눌러 던져. 세 번 맞으면 5초간 얼고 A·D로 탈출해. "
                    + "먼저 상대를 얼리면 승리, 제한은 90초야. ‘그만’으로 중단할 수 있어.";
            case STATUS -> speech = actor.opponent.isEmpty() ? "난 광장 서쪽 눈더미 근처에 있어. 눈싸움 한 판 어때?"
                    : "지금 눈싸움 중이야. 끝나면 다시 같이 놀자!";
            case THANKS -> speech = "나도 즐거웠어! 다음에도 불러줘.";
            case TAUNT -> speech = "공원에서 손에 꼽지! 몇 명인지는 묻지 말고. 눈싸움으로 확인할래?";
            case GREET -> speech = "안녕! 난 온탑이야. 공원에서 같이 놀 친구를 찾고 있어. ‘눈싸움하자’고 말해 봐!";
            default -> speech = "그렇구나! 나는 아직 인사, 눈싸움, 규칙 안내를 할 수 있어. "
                    + "‘눈싸움하자’, ‘규칙 알려줘’, ‘지금 뭐해?’라고 이야기해 줘.";
        }
        respond(conversation, user, id, text, speech, decision.source(), closed, false);
        if (closed) {
            conversations.remove(user);
        }
    }

    private String start(Actor actor, String user, Conversation conversation, long now) {
        if (conversation.invitedUntil <= now) {
            return "먼저 ‘눈싸움하자’고 말해줘. 초대는 30초 동안 유효해!";
        }
        if (!actor.opponent.isEmpty() || now < actor.restUntil) {
            return "지금은 다른 판을 진행하거나 쉬는 중이야. 조금 뒤에 다시 하자!";
        }
        var position = host.players().getOrDefault(actor.channel, Map.of()).get(user);
        if (!host.available(user) || position == null || snowballs.frozen(user, System.nanoTime())) {
            return "다른 활동을 마치고 공원 땅 위에서 다시 시작해 줘!";
        }
        if (point(position).distance(actor.home) > 14 || navigation.path(actor.position, point(position)).isEmpty()) {
            return "광장 서쪽 눈더미(-5, 44) 가까이에서 ‘시작’이라고 해줘. 걸어서 만날 수 있는 곳에서 놀자!";
        }
        conversation.invitedUntil = 0;
        snowballs.disconnected(user);
        snowballs.disconnected(actor.id);
        actor.opponent = user;
        actor.endsAt = now + 90_000;
        actor.nextAction = now + 1_500;
        actor.result = "";
        actor.action = "READY";
        actor.path = List.of();
        actor.windup = null;
        say(actor, "준비! 눈을 뭉쳐서 던져 봐!", now);
        host.winter(actor.channel);
        return "좋아, 시작! Q로 눈을 모으고 나를 향해 던져 봐. 먼저 상대를 얼리면 승리야!";
    }

    private void advance(Actor actor, Map<String, Position> players, long now, double seconds) {
        if (!actor.opponent.isEmpty()) {
            var target = players.get(actor.opponent);
            if (target == null || !host.available(actor.opponent) || point(target).distance(actor.home) > 22) {
                finish(actor, "LEFT", "친구가 멀어졌네. 눈싸움은 여기까지!", now);
            } else if (snowballs.frozen(actor.id, System.nanoTime())) {
                finish(actor, "PLAYER_WON", "으앗, 얼었다! 네가 이겼어. 다음엔 내가 이긴다!", now);
            } else if (snowballs.frozen(actor.opponent, System.nanoTime())) {
                finish(actor, "ONTOP_WON", "이번엔 내가 이겼다! 얼음은 A·D를 번갈아 눌러 깨 봐!", now);
            } else if (now >= actor.endsAt) {
                finish(actor, "TIMEOUT", "시간 끝! 이번 판은 무승부야. 수고했어!", now);
            } else {
                play(actor, target, now, seconds);
                return;
            }
        }
        if (snowballs.frozen(actor.id, System.nanoTime()) || now < actor.restUntil) {
            actor.action = snowballs.frozen(actor.id, System.nanoTime()) ? "FROZEN" : "RESULT";
            return;
        }
        actor.action = "IDLE";
        if (!actor.result.isEmpty()) {
            snowballs.disconnected(actor.id);
            actor.result = "";
            host.winter(actor.channel);
        }
        if (actor.position.distance(actor.home) > .2) {
            move(actor, actor.home, seconds, now);
        }
    }

    private void play(Actor actor, Position target, long now, double seconds) {
        if (!host.canAttack(actor.opponent)) {
            actor.windup = null;
            actor.action = "WAITING";
            actor.nextAction = now + 1_000;
            return;
        }
        if (actor.windup != null) {
            actor.action = "WINDUP";
            if (now >= actor.fireAt) {
                var event = snowballs.create(actor.windup.motionId(), actor.channel, actor.id, position(actor),
                        actor.windup.yaw(), List.of(new SnowballService.Target(actor.opponent, target)),
                        yaw -> host.distance(actor.channel, position(actor), yaw), System.nanoTime(), Instant.ofEpochMilli(now));
                actor.windup = null;
                actor.action = "THROW";
                actor.nextAction = now + 1_400;
                host.shot(actor.channel, event);
                host.winter(actor.channel);
                if (!event.hitUserId().isEmpty()) {
                    say(actor, "맞혔다! 방심하면 안 되지!", now);
                }
            }
            return;
        }
        if (now < actor.nextAction) {
            return;
        }
        boolean holding = snowballs.state(actor.channel).players().stream()
                .anyMatch(player -> player.userId().equals(actor.id) && player.snowballs() == 1);
        if (!holding) {
            if (host.canGather(actor.channel, position(actor))) {
                snowballs.pickup(actor.channel, actor.id, System.nanoTime());
                actor.action = "GATHER";
                actor.nextAction = now + 1_200;
                host.winter(actor.channel);
            } else {
                move(actor, actor.home, seconds, now);
            }
            return;
        }
        double distance = point(target).distance(actor.position);
        if (distance > 12 || distance < 3) {
            double dx = target.x() - actor.home.x(), dz = target.z() - actor.home.z();
            double length = Math.max(1, Math.hypot(dx, dz));
            var goal = new Point(actor.home.x() + dx / length * 3, actor.home.y(), actor.home.z() + dz / length * 3);
            move(actor, goal, seconds, now);
            if (distance > 15) {
                return;
            }
        }
        actor.yaw = Math.atan2(target.x() - actor.position.x(), target.z() - actor.position.z());
        // 확정된 현재 위치만 보고 조준한다. 미래 위치·클라이언트 비공개 입력은 읽지 않는다.
        double error = Math.sin(++actor.shots * 2.4) * .075;
        actor.windup = snowballs.prepare(UUID.randomUUID().toString(), actor.channel, actor.id,
                Math.atan2(Math.sin(actor.yaw + error), Math.cos(actor.yaw + error)), System.nanoTime(), Instant.ofEpochMilli(now));
        actor.yaw = actor.windup.yaw();
        actor.action = "WINDUP";
        actor.fireAt = now + SnowballService.WINDUP_MILLIS;
        host.windup(actor.channel, actor.windup);
    }

    private void move(Actor actor, Point destination, double seconds, long now) {
        if (now >= actor.repathAt || actor.path.isEmpty()) {
            actor.path = navigation.path(actor.position, destination);
            actor.repathAt = now + 1_000;
        }
        double remaining = 2.5 * seconds;
        while (!actor.path.isEmpty() && remaining > 0) {
            Point next = actor.path.getFirst();
            double distance = next.distance(actor.position);
            if (distance <= remaining) {
                actor.position = next;
                remaining -= distance;
                actor.path = actor.path.subList(1, actor.path.size());
            } else {
                double fraction = remaining / distance;
                actor.yaw = Math.atan2(next.x() - actor.position.x(), next.z() - actor.position.z());
                actor.position = new Point(actor.position.x() + (next.x() - actor.position.x()) * fraction,
                        actor.position.y() + (next.y() - actor.position.y()) * fraction,
                        actor.position.z() + (next.z() - actor.position.z()) * fraction);
                remaining = 0;
            }
        }
        actor.action = "WALK";
    }

    private void finish(Actor actor, String result, String speech, long now) {
        // 종료 뒤 새로 시작한 일반 눈싸움 상태를 지연 정리에서 지우지 않는다.
        if (!actor.opponent.isEmpty() && !snowballs.frozen(actor.opponent, System.nanoTime())) {
            snowballs.disconnected(actor.opponent);
        }
        actor.opponent = "";
        actor.windup = null;
        actor.path = List.of();
        actor.result = result;
        actor.endsAt = 0;
        actor.restUntil = now + 5_500;
        say(actor, speech, now);
        host.winter(actor.channel);
    }

    private static void say(Actor actor, String speech, long now) {
        actor.speech = speech;
        actor.speechUntil = now + 5_000;
    }

    public List<SnowballService.Target> targets(String channel, String user, List<SnowballService.Target> original) {
        var actor = actors.get(channel);
        if (actor == null || actor.opponent.isEmpty()) {
            return original;
        }
        if (actor.opponent.equals(user)) {
            return List.of(new SnowballService.Target(actor.id, position(actor)));
        }
        return original.stream().filter(target -> !target.userId().equals(actor.opponent)).toList();
    }

    public void leave(String user, long now) {
        conversations.remove(user);
        for (var actor : actors.values()) {
            if (user.equals(actor.opponent)) {
                finish(actor, "LEFT", "다음에 다시 만나!", now);
            }
        }
    }

    private void respond(Conversation conversation, String user, String id, String text, String speech,
            String source, boolean closed, boolean pending) {
        var reply = new Reply(conversation.channel, user, id, text, speech, source, closed, pending,
                conversation.invitedUntil > 0);
        conversation.replies.put(id, reply);
        while (conversation.replies.size() > 16) {
            conversation.replies.remove(conversation.replies.keySet().iterator().next());
        }
        host.reply(user, id, reply);
    }

    private Actor actor(String channel) {
        return actors.computeIfAbsent(channel, key -> new Actor(key, navigation.home()));
    }

    private View view(Actor actor, long now) {
        return new View(actor.channel, ++actor.version, actor.id, "온탑", actor.position.x(), actor.position.y() - .8,
                actor.position.z(), actor.yaw, actor.action, actor.opponent, actor.result, actor.endsAt,
                now < actor.speechUntil ? actor.speech : "", actor.speechUntil);
    }

    private static Point point(Position position) {
        return new Point(position.x(), position.y(), position.z());
    }

    private static Position position(Actor actor) {
        return new Position(0, actor.position.x(), actor.position.y(), actor.position.z(), actor.yaw);
    }

    private static final class Actor {
        final String channel;
        final String id;
        final Point home;
        Point position;
        List<Point> path = List.of();
        long version, endsAt, nextAction, restUntil, repathAt, fireAt, speechUntil;
        int shots;
        double yaw;
        String opponent = "", result = "", speech = "", action = "IDLE";
        SnowballService.Windup windup;

        Actor(String channel, Point home) {
            this.channel = channel;
            this.id = "npc-ontop-" + UUID.nameUUIDFromBytes(channel.getBytes(StandardCharsets.UTF_8));
            this.home = home;
            this.position = home;
        }
    }

    private static final class Conversation {
        final String channel;
        final LinkedHashMap<String, Reply> replies = new LinkedHashMap<>();
        long touched, invitedUntil, lastRequest = Long.MIN_VALUE / 2;
        Pending pending;

        Conversation(String channel) {
            this.channel = channel;
        }
    }

    private record Pending(String id, String text, long at, CompletableFuture<OntopIntent.Decision> future) {
    }
}
