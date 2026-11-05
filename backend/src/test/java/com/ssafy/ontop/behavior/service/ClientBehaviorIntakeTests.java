package com.ssafy.ontop.behavior.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.BehaviorSource;
import com.ssafy.ontop.behavior.domain.LoginSessionKey;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClientBehaviorIntakeTests {

    private static final Instant NOW = Instant.parse("2026-11-05T03:00:10Z");
    private static final String SESSION = "db73b5f3-1c75-49f9-9dbc-e9e578296e57";
    private static final String PERF = """
            {"type":"PERF_REPORT","ageMs":%d,"props":{"windowSec":60,"frames":3500,"slowFrames":12,"fps":58.347,
            "p95Ms":21.06,"p99Ms":40.2,"drawCalls":420,"triangles":180000,"dpr":1.256,"renderMode":"continuous",
            "quality":"low","device":"desktop","gpu":"nvidia"}}""";
    private static final String STEP = """
            {"type":"ONBOARDING_STEP","ageMs":0,"props":{"flow":"welcome_tour","action":"%s",%s"replay":false,
            "doneCount":1}}""";

    private final ObjectMapper mapper = new ObjectMapper();
    private final CapturingLog log = new CapturingLog();
    private final ClientBehaviorIntake intake = new ClientBehaviorIntake(log, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void 성능_보고를_CLIENT_출처와_로그인_세션_키로_기록한다() throws Exception {
        var result = intake.accept(101, SESSION, events(PERF.formatted(1500)));

        assertThat(result).isEqualTo(new ClientBehaviorIntake.Result(1, 0));
        BehaviorEvent event = log.events.getFirst();
        assertThat(event.type()).isEqualTo(BehaviorEventType.PERF_REPORT);
        assertThat(event.source()).isEqualTo(BehaviorSource.CLIENT);
        assertThat(event.userId()).isEqualTo(101L);
        assertThat(event.loginSessionId()).isEqualTo(LoginSessionKey.of(SESSION));
        assertThat(event.occurredAt()).isEqualTo(NOW.minusMillis(1500));
        assertThat(event.props()).containsEntry("fps", 58.3).containsEntry("p95Ms", 21.1)
                .containsEntry("dpr", 1.26).containsEntry("frames", 3500L).containsEntry("gpu", "nvidia");
    }

    @Test
    void 체험_투어_단계를_기록하고_단계_완료에는_단계가_있어야_한다() throws Exception {
        var result = intake.accept(101, SESSION, events(STEP.formatted("step_done", "\"step\":\"walk\","),
                STEP.formatted("collapse", ""), STEP.formatted("step_done", "")));

        assertThat(result).isEqualTo(new ClientBehaviorIntake.Result(2, 1));
        assertThat(log.events).extracting(e -> e.props().get("action")).containsExactly("step_done", "collapse");
        assertThat(log.events.getFirst().props()).containsEntry("step", "walk").containsEntry("replay", false);
    }

    @Test
    void 허용하지_않은_이벤트_속성_값은_그_이벤트만_버린다() throws Exception {
        var result = intake.accept(101, SESSION, events(
                "{\"type\":\"CHAT_SENT\",\"ageMs\":0,\"props\":{}}",
                PERF.formatted(0).replace("\"gpu\":\"nvidia\"", "\"gpu\":\"NVIDIA GeForce RTX 4090\""),
                PERF.formatted(0).replace("\"quality\":\"low\"", "\"quality\":\"low\",\"userAgent\":\"x\""),
                PERF.formatted(0).replace("\"slowFrames\":12", "\"slowFrames\":9999"),
                PERF.formatted(0).replace("\"fps\":58.347", "\"fps\":\"58\""),
                PERF.formatted(0).replace(",\"device\":\"desktop\"", ""),
                "{\"type\":\"PERF_REPORT\",\"ageMs\":0,\"props\":{},\"extra\":1}",
                "[]",
                PERF.formatted(0)));

        assertThat(result).isEqualTo(new ClientBehaviorIntake.Result(1, 8));
        assertThat(log.events).hasSize(1);
    }

    @Test
    void 너무_오래되었거나_미래인_이벤트는_버린다() throws Exception {
        var result = intake.accept(101, SESSION, events(PERF.formatted(ClientBehaviorIntake.MAX_AGE_MS + 1),
                PERF.formatted(-1), PERF.formatted(ClientBehaviorIntake.MAX_AGE_MS)));

        assertThat(result).isEqualTo(new ClientBehaviorIntake.Result(1, 2));
    }

    @Test
    void 회원별로_1분에_정해진_건수까지만_받는다() throws Exception {
        String one = STEP.formatted("collapse", "");
        for (int i = 0; i < ClientBehaviorIntake.PER_MINUTE_LIMIT; i++) {
            assertThat(intake.accept(101, SESSION, events(one)).accepted()).isEqualTo(1);
        }

        assertThat(intake.accept(101, SESSION, events(one))).isEqualTo(new ClientBehaviorIntake.Result(0, 1));
        assertThat(intake.accept(102, SESSION, events(one)).accepted()).isEqualTo(1);
    }

    @Test
    void 다음_분에는_건수를_다시_센다() throws Exception {
        var clock = new MutableClock(NOW);
        var limited = new ClientBehaviorIntake(log, clock);
        String one = STEP.formatted("collapse", "");
        for (int i = 0; i < ClientBehaviorIntake.PER_MINUTE_LIMIT; i++) {
            limited.accept(101, SESSION, events(one));
        }
        assertThat(limited.accept(101, SESSION, events(one)).accepted()).isZero();

        clock.now = NOW.plusSeconds(60);

        assertThat(limited.accept(101, SESSION, events(one)).accepted()).isEqualTo(1);
    }

    private JsonNode events(String... items) throws Exception {
        return mapper.readTree("[" + String.join(",", items) + "]");
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new ArrayList<>();

        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
