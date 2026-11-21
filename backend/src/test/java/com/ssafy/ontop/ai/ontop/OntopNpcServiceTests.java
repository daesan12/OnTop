package com.ssafy.ontop.ai.ontop;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.winter.SnowballService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OntopNpcServiceTests {
    private static final class Fixture implements OntopNpcService.Host, OntopNpcService.Navigation {
        final Map<String, Map<String, Position>> players = new HashMap<>(Map.of(
                "a", new HashMap<>(Map.of("first", new Position(0, -5, .8, 49, 0),
                        "second", new Position(0, -6, .8, 49, 0))),
                "b", new HashMap<>(Map.of("other", new Position(0, -5, .8, 49, 0)))));
        final Map<String, OntopNpcService.View> views = new HashMap<>();
        final List<OntopNpcService.Reply> replies = new ArrayList<>();
        final SnowballService snowballs = new SnowballService();
        final List<SnowballService.Event> shots = new ArrayList<>();
        final OntopNpcService service;

        Fixture() {
            this(OntopIntent.offline());
        }

        Fixture(OntopIntent.Chooser chooser) {
            service = new OntopNpcService(this, chooser, this, snowballs);
        }

        void talk(String user, String text, long now) {
            service.talk("a", user, user + now, "/온탑 " + text, now);
            service.tick(now, .1);
        }

        void start() {
            talk("first", "눈싸움하자", 1_000);
            talk("first", "시작", 3_000);
        }

        @Override public Point home() { return new Point(-5, .8, 44); }
        @Override public List<Point> path(Point from, Point to) { return List.of(from, to); }
        @Override public Map<String, Map<String, Position>> players() { return players; }
        @Override public boolean available(String user) { return true; }
        @Override public boolean canGather(String channel, Position p) { return Math.hypot(p.x() + 5, p.z() - 44) <= 2.4; }
        @Override public double distance(String channel, Position position, double yaw) { return 16; }
        @Override public void state(String channel, OntopNpcService.View view) { views.put(channel, view); }
        @Override public void reply(String user, String id, OntopNpcService.Reply reply) { replies.add(reply); }
        @Override public void winter(String channel) { }
        @Override public void windup(String channel, SnowballService.Windup motion) { }
        @Override public void shot(String channel, SnowballService.Event event) { shots.add(event); }
    }

    @Test
    void 초대와_수락을_거친_한명만_상대가_되고_다른_채널은_독립적이다() {
        var fixture = new Fixture();
        fixture.start();
        fixture.talk("second", "눈싸움하자", 5_000);

        assertThat(fixture.views.get("a").opponentId()).isEqualTo("first");
        assertThat(fixture.views.get("b").opponentId()).isEmpty();
        assertThat(fixture.views.get("a").id()).isNotEqualTo(fixture.views.get("b").id());
        assertThat(fixture.replies.getLast().speech()).contains("다른 친구");
        assertThat(fixture.replies.getLast().userId()).isEqualTo("second");
    }

    @Test
    void 초대가_없거나_만료됐거나_너무_멀면_수락을_판단해도_시작하지_않는다() {
        var fixture = new Fixture((text, invited, playing) -> CompletableFuture.completedFuture(
                new OntopIntent.Decision(text.contains("눈싸움") ? OntopIntent.INVITE : OntopIntent.ACCEPT, "JEV")));
        fixture.talk("first", "시작", 1_000);
        assertThat(fixture.views.get("a").opponentId()).isEmpty();
        fixture.talk("first", "눈싸움하자", 3_000);
        fixture.talk("first", "시작", 34_000);
        assertThat(fixture.views.get("a").opponentId()).isEmpty();
        fixture.talk("first", "눈싸움하자", 36_000);
        fixture.players.get("a").put("first", new Position(0, 60, .8, 60, 0));
        fixture.talk("first", "시작", 38_000);
        assertThat(fixture.views.get("a").opponentId()).isEmpty();
    }

    @Test
    void 대결중에는_상대_NPC만_맞힐_수_있고_구경꾼은_대결자를_맞히지_못한다() {
        var fixture = new Fixture();
        fixture.start();
        var original = List.of(new SnowballService.Target("first", fixture.players.get("a").get("first")),
                new SnowballService.Target("second", fixture.players.get("a").get("second")));

        assertThat(fixture.service.targets("a", "first", original)).extracting(SnowballService.Target::userId)
                .containsExactly(fixture.views.get("a").id());
        assertThat(fixture.service.targets("a", "second", original)).extracting(SnowballService.Target::userId)
                .doesNotContain("first");
        assertThat(fixture.service.targets("b", "other", original)).isEqualTo(original);
    }

    @Test
    void 중단과_이탈은_예약된_공격을_취소하고_낡은_모델_수락은_다시_시작시키지_못한다() {
        var fixture = new Fixture();
        fixture.start();
        fixture.service.tick(4_600, .1);
        fixture.service.tick(5_900, .1);
        fixture.talk("first", "그만", 6_000);
        fixture.service.tick(7_000, .1);
        assertThat(fixture.views.get("a").opponentId()).isEmpty();
        assertThat(fixture.shots).isEmpty();

        var pending = new CompletableFuture<OntopIntent.Decision>();
        var delayed = new Fixture((text, invited, playing) -> pending);
        delayed.talk("first", "같이 놀래", 1_000);
        delayed.talk("first", "종료", 2_000);
        pending.complete(new OntopIntent.Decision(OntopIntent.ACCEPT, "JEV"));
        delayed.service.tick(3_000, .1);
        assertThat(delayed.views.get("a").opponentId()).isEmpty();
        assertThat(delayed.replies.getLast().closed()).isTrue();

        var leaving = new Fixture();
        leaving.start();
        leaving.players.get("a").remove("first");
        leaving.service.tick(5_000, .1);
        assertThat(leaving.views.get("a").result()).isEqualTo("LEFT");
    }

    @Test
    void 같은_수락_요청을_재전송해도_경기_시간을_초기화하지_않고_90초에_종료한다() {
        var fixture = new Fixture();
        fixture.start();
        fixture.service.talk("a", "first", "first3000", "/온탑 시작", 10_000);
        fixture.service.tick(10_000, .1);
        assertThat(fixture.views.get("a").endsAt()).isEqualTo(93_000);
        fixture.service.tick(93_001, .1);
        assertThat(fixture.views.get("a").result()).isEqualTo("TIMEOUT");
        assertThat(fixture.views.get("a").opponentId()).isEmpty();
    }

    @Test
    void 세번_명중하면_기존_동결_규칙으로_사용자의_승리를_확정한다() throws Exception {
        var fixture = new Fixture();
        fixture.start();
        var user = fixture.players.get("a").get("first");
        var targets = fixture.service.targets("a", "first", List.of());
        String npc = targets.getFirst().userId();
        for (int i = 0; i < 3; i++) {
            if (i > 0) {
                Thread.sleep(930);
            }
            fixture.snowballs.pickup("a", "first", System.nanoTime());
            var event = fixture.snowballs.create("hit" + i, "a", "first", user, Math.PI, targets,
                    yaw -> 16, System.nanoTime(), java.time.Instant.now());
            assertThat(event.hitUserId()).isEqualTo(npc);
        }
        fixture.service.tick(4_000, .1);
        assertThat(fixture.views.get("a").result()).isEqualTo("PLAYER_WON");
        assertThat(fixture.snowballs.frozen(npc, System.nanoTime())).isTrue();
    }

    @Test
    void 눈을_모은_뒤_준비_동작을_거쳐_동의한_상대에게만_발사한다() {
        var fixture = new Fixture();
        fixture.start();
        fixture.service.tick(4_600, .1);
        assertThat(fixture.views.get("a").action()).isEqualTo("GATHER");
        fixture.service.tick(5_900, .1);
        assertThat(fixture.views.get("a").action()).isEqualTo("WINDUP");
        assertThat(fixture.shots).isEmpty();
        fixture.service.tick(6_201, .1);
        assertThat(fixture.shots).hasSize(1);
        assertThat(fixture.shots.getFirst().hitUserId()).isEqualTo("first");
    }

    @Test
    void 종료후_새로_모은_일반_눈덩이는_NPC의_뒤늦은_정리가_지우지_않는다() {
        var fixture = new Fixture();
        fixture.start();
        fixture.talk("first", "그만", 4_000);
        fixture.snowballs.pickup("a", "first", System.nanoTime());
        fixture.service.tick(10_000, .1);
        assertThat(fixture.snowballs.state("a").players()).anySatisfy(player -> {
            assertThat(player.userId()).isEqualTo("first");
            assertThat(player.snowballs()).isEqualTo(1);
        });
    }
}
