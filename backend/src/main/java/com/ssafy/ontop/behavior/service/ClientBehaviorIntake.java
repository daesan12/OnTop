package com.ssafy.ontop.behavior.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.BehaviorSource;
import com.ssafy.ontop.behavior.domain.LoginSessionKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 클라이언트가 보낸 행동 로그를 허용 목록대로 걸러 source=CLIENT로 기록한다. docs/behavior-log.md 3장 "클라이언트".
 * 정해 둔 이벤트·속성·값 범위를 하나라도 벗어난 이벤트는 통째로 버린다. 버린 건수만 돌려주고 원인 값은 남기지 않는다.
 * 발생 시각은 클라이언트 시계 대신 "몇 ms 전에 일어났는지(ageMs)"를 받아 서버 시각에서 뺀다.
 */
@Component
public class ClientBehaviorIntake {

    public static final int MAX_BATCH = 20;
    /**
     * 회원 한 명이 1분에 남길 수 있는 건수. 성능 보고 1건/분과 투어 단계 몇 건이 넉넉히 들어간다.
     * 서버 시각 기준 고정 1분 창이며 운영은 앱 인스턴스 하나(compose.prod.yaml의 app, 공원 상태도 메모리에 있다)를 전제로 한다.
     * 창이 바뀐 뒤 첫 요청에서 지난 창의 기록을 통째로 비우므로 맵에는 많아야 한 창 동안 보낸 회원만 남는다.
     * 창 경계 앞뒤로 최대 두 배까지 받을 수 있지만 분석용 표본의 남용 방지 목적에는 충분하다.
     * 인스턴스를 늘리면 인스턴스마다 따로 세므로 공용 저장소(예: Redis) 기반 제한으로 바꿔야 한다.
     */
    static final int PER_MINUTE_LIMIT = 30;
    static final long MAX_AGE_MS = Duration.ofMinutes(15).toMillis();

    private static final Set<String> EVENT_FIELDS = Set.of("type", "ageMs", "props");
    private static final Map<String, Spec> SPECS = Map.of(
            "PERF_REPORT", new Spec(BehaviorEventType.PERF_REPORT, Map.ofEntries(
                    Map.entry("windowSec", integer(1, 600)),
                    Map.entry("frames", integer(0, 100_000)),
                    Map.entry("slowFrames", integer(0, 100_000)),
                    Map.entry("fps", decimal(0, 1000, 1)),
                    Map.entry("p95Ms", decimal(0, 60_000, 1)),
                    Map.entry("p99Ms", decimal(0, 60_000, 1)),
                    Map.entry("drawCalls", integer(0, 1_000_000)),
                    Map.entry("triangles", integer(0, 100_000_000)),
                    Map.entry("dpr", decimal(0, 8, 2)),
                    Map.entry("renderMode", oneOf("continuous", "on-demand", "paused")),
                    Map.entry("quality", oneOf("low", "medium", "high")),
                    Map.entry("device", oneOf("desktop", "mobile")),
                    Map.entry("gpu", oneOf("apple", "intel", "nvidia", "amd", "adreno", "mali", "powervr",
                            "software", "other", "unknown"))),
                    Set.of("windowSec", "frames", "slowFrames", "fps", "p95Ms", "device", "gpu")),
            "ONBOARDING_STEP", new Spec(BehaviorEventType.ONBOARDING_STEP, Map.of(
                    "flow", oneOf("welcome_tour"),
                    "action", oneOf("start", "step_done", "collapse", "resume", "abandon", "finish"),
                    "step", oneOf("flight", "walk", "greet", "map", "minigame", "table"),
                    "replay", Rule.BOOLEAN,
                    "doneCount", integer(0, 5),
                    "elapsedSec", integer(0, 86_400)),
                    Set.of("flow", "action", "replay", "doneCount")));

    private final BehaviorLog log;
    private final Clock clock;
    private final Map<Long, Integer> counts = new HashMap<>();
    private long countMinute = Long.MIN_VALUE;

    @Autowired
    public ClientBehaviorIntake(BehaviorLog log) {
        this(log, Clock.systemUTC());
    }

    ClientBehaviorIntake(BehaviorLog log, Clock clock) {
        this.log = log;
        this.clock = clock;
    }

    /**
     * events는 컨트롤러가 1~MAX_BATCH개 배열임을 확인한 값이다.
     * 기록 실패는 BehaviorLog가 삼키므로 이 메서드는 받은 요청을 실패시키지 않는다.
     */
    public Result accept(long userId, String sessionId, JsonNode events) {
        Instant now = clock.instant();
        String loginKey = LoginSessionKey.of(sessionId);
        int accepted = 0;
        int dropped = 0;
        for (JsonNode node : events) {
            BehaviorEvent event = parse(node, userId, loginKey, now);
            if (event == null || !reserve(userId, now)) {
                dropped++;
                continue;
            }
            log.record(() -> event);
            accepted++;
        }
        return new Result(accepted, dropped);
    }

    private BehaviorEvent parse(JsonNode node, long userId, String loginKey, Instant now) {
        if (node == null || !node.isObject() || !onlyFields(node, EVENT_FIELDS)) {
            return null;
        }
        JsonNode type = node.get("type");
        JsonNode age = node.get("ageMs");
        JsonNode props = node.get("props");
        Spec spec = type != null && type.isTextual() ? SPECS.get(type.textValue()) : null;
        if (spec == null || age == null || !age.canConvertToExactIntegral() || props == null || !props.isObject()) {
            return null;
        }
        long ageMs = age.asLong();
        if (ageMs < 0 || ageMs > MAX_AGE_MS) {
            return null;
        }
        Map<String, Object> values = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> field : props.properties()) {
            Rule rule = spec.props().get(field.getKey());
            Object value = rule == null ? null : rule.normalize(field.getValue());
            if (value == null) {
                return null;
            }
            values.put(field.getKey(), value);
        }
        if (!values.keySet().containsAll(spec.required()) || !consistent(spec.type(), values)) {
            return null;
        }
        BehaviorEvent.Builder builder = BehaviorEvent.builder(spec.type(), now.minusMillis(ageMs))
                .source(BehaviorSource.CLIENT).userId(userId).loginSessionId(loginKey);
        values.forEach(builder::prop);
        return builder.build();
    }

    /** 단계 완료는 어느 단계인지 있어야 하고, 느린 프레임은 전체 프레임보다 많을 수 없다. */
    private static boolean consistent(BehaviorEventType type, Map<String, Object> values) {
        if (type == BehaviorEventType.ONBOARDING_STEP) {
            return !"step_done".equals(values.get("action")) || values.containsKey("step");
        }
        return (long) values.get("slowFrames") <= (long) values.get("frames");
    }

    private synchronized boolean reserve(long userId, Instant now) {
        long minute = now.getEpochSecond() / 60;
        if (minute != countMinute) {
            countMinute = minute;
            counts.clear();
        }
        int used = counts.getOrDefault(userId, 0);
        if (used >= PER_MINUTE_LIMIT) {
            return false;
        }
        counts.put(userId, used + 1);
        return true;
    }

    private static boolean onlyFields(JsonNode node, Set<String> allowed) {
        return node.properties().stream().allMatch(field -> allowed.contains(field.getKey()));
    }

    private static Rule integer(long min, long max) {
        return value -> {
            if (!value.canConvertToExactIntegral()) {
                return null;
            }
            long number = value.asLong();
            return number < min || number > max ? null : number;
        };
    }

    /** 실수는 정해 둔 소수 자리로 반올림해 저장한다. */
    private static Rule decimal(double min, double max, int scale) {
        double unit = Math.pow(10, scale);
        return value -> {
            if (!value.isNumber()) {
                return null;
            }
            double number = value.asDouble();
            if (!Double.isFinite(number) || number < min || number > max) {
                return null;
            }
            return Math.round(number * unit) / unit;
        };
    }

    private static Rule oneOf(String... allowed) {
        Set<String> values = Set.of(allowed);
        return value -> value.isTextual() && values.contains(value.textValue()) ? value.textValue() : null;
    }

    public record Result(int accepted, int dropped) {
    }

    private record Spec(BehaviorEventType type, Map<String, Rule> props, Set<String> required) {
    }

    @FunctionalInterface
    private interface Rule {
        Rule BOOLEAN = value -> value.isBoolean() ? value.booleanValue() : null;

        /** 허용하지 않는 값이면 null. */
        Object normalize(JsonNode value);
    }
}
