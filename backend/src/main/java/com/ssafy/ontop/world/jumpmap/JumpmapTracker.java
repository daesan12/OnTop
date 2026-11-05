package com.ssafy.ontop.world.jumpmap;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/**
 * 사용자별 착지 감지와 판 진행. 서버가 확인한 지지면·수영·순간 이동 횟수만 입력으로 받는다(BE 명세 5장).
 * 월드 레지스트리 잠금 안에서 호출되므로 저장·지급·전송은 하지 않고 신호만 돌려준다.
 */
public final class JumpmapTracker {
    /** 발 높이가 그 자리 지형보다 이 값 미만이면 광장·길·코트 같은 지면으로 본다(팔각정 바닥 0.72m는 구조물). */
    public static final double GROUND_LEVEL = .5;
    public static final long STEP_REPEAT_MS = 150;

    public enum Surface { NONE, COURSE, GROUND, STRUCTURE }

    /**
     * @param collider 지지 충돌체 식별자(코스는 block 문자열). 같은 충돌체 위에 계속 서 있으면 착지가 아니다.
     * @param following 서버가 입력을 대신 만드는 따라가기 중이면 판을 시작하지 않는다.
     */
    public record Sample(Surface surface, String collider, int block, Integer gate, boolean swimming,
            double feet, long relocations, boolean following) {
        public static Sample of(Surface surface, String collider, boolean swimming, double feet, long relocations) {
            return new Sample(surface, collider, -1, null, swimming, feet, relocations, false);
        }
    }

    public sealed interface Signal { String userId(); String channelId(); }
    /** 코스 발판 착지. 판과 상관없이 주변 사람에게 알린다(11장). */
    public record Step(String userId, String channelId, int block) implements Signal {}
    public record Started(String userId, String channelId, String runId, long startedAtMs) implements Signal {}
    public record Progress(String userId, String channelId, String runId, JumpRun.Outcome outcome, RunView run)
            implements Signal {}

    /** 진행 중 판의 공개 상태(activeRun). runCoins는 정산 결과라 여기서 모른다. */
    public record RunView(String runId, long elapsedMs, int gatesPassed, boolean finalReached, double maxHeight,
            boolean suspicious, List<String> reasons, List<Integer> landings) {}

    private static final class UserState {
        String channelId;
        JumpRun run;
        String support = "";
        boolean swimming;
        long relocations;
        boolean primed;
        final Map<Integer, Long> steps = new HashMap<>();
    }

    private final JumpCourse course;
    private final Supplier<String> runIds;
    private final Map<String, UserState> users = new HashMap<>();

    public JumpmapTracker(JumpCourse course) {
        this(course, () -> UUID.randomUUID().toString());
    }

    JumpmapTracker(JumpCourse course, Supplier<String> runIds) {
        this.course = course;
        this.runIds = runIds;
    }

    /** 회원(숫자 ID)만 판을 시작한다. local 개발 사용자는 지갑이 없어 착지 알림만 받는다. */
    public static boolean member(String userId) {
        return !userId.isEmpty() && userId.chars().allMatch(Character::isDigit);
    }

    public List<Signal> observe(String userId, String channelId, Sample sample, long nowMs) {
        return observe(userId, channelId, sample, nowMs, () -> true);
    }

    /**
     * 배출·점검 전부터 진행 중인 판은 끝까지 처리하되, 새 판만 시작하지 않는다.
     * 착지 알림은 공원 연출이므로 시작 허용 여부와 무관하게 유지한다.
     */
    public List<Signal> observe(String userId, String channelId, Sample sample, long nowMs,
            BooleanSupplier newActivityAllowed) {
        UserState state = users.computeIfAbsent(userId, ignored -> new UserState());
        var signals = new ArrayList<Signal>();
        if (state.run != null && !channelId.equals(state.channelId)) {
            progress(userId, state, state.run.end(JumpRun.EndReason.LEFT, nowMs), nowMs, signals);
        }
        state.channelId = channelId;
        if (!state.primed) {
            // 입장·재결합 직후 첫 표본은 기준만 잡는다. 이미 서 있던 발판을 착지로 세지 않는다.
            state.primed = true;
            state.relocations = sample.relocations();
            state.support = key(sample);
            state.swimming = sample.swimming();
            return signals;
        }
        JumpRun run = state.run;
        if (run != null && sample.relocations() != state.relocations) {
            progress(userId, state, run.end(JumpRun.EndReason.RESET, nowMs), nowMs, signals);
        }
        state.relocations = sample.relocations();
        if (state.run != null) {
            state.run.height(sample.feet());
            progress(userId, state, state.run.tick(nowMs), nowMs, signals);
        }
        boolean entered = sample.swimming() && !state.swimming;
        state.swimming = sample.swimming();
        if (entered && state.run != null) {
            progress(userId, state, state.run.lake(nowMs), nowMs, signals);
        }
        String key = key(sample);
        boolean landed = sample.surface() != Surface.NONE && !key.equals(state.support);
        state.support = key;
        if (!landed || sample.swimming()) {
            return signals;
        }
        switch (sample.surface()) {
            case COURSE -> {
                Long previous = state.steps.get(sample.block());
                if (previous == null || nowMs - previous >= STEP_REPEAT_MS) {
                    state.steps.put(sample.block(), nowMs);
                    signals.add(new Step(userId, channelId, sample.block()));
                }
                if (state.run != null) {
                    progress(userId, state, state.run.land(sample.block(), sample.gate(), nowMs), nowMs, signals);
                } else if (sample.block() == JumpRun.START_BLOCK && !sample.following() && member(userId)
                        && newActivityAllowed.getAsBoolean()) {
                    state.run = new JumpRun(runIds.get(), nowMs,
                            course.stages().stream().map(JumpCourse.Stage::reward).toList(), sample.feet());
                    signals.add(new Started(userId, channelId, state.run.runId(), nowMs));
                }
            }
            case GROUND -> {
                if (state.run != null) progress(userId, state, state.run.terrain(nowMs), nowMs, signals);
            }
            default -> { }
        }
        return signals;
    }

    /** 30분 TIMEOUT은 착지가 없어도 지나야 하므로 매 틱 확인한다. */
    public List<Signal> tick(String userId, long nowMs) {
        UserState state = users.get(userId);
        var signals = new ArrayList<Signal>();
        if (state != null && state.run != null) progress(userId, state, state.run.tick(nowMs), nowMs, signals);
        return signals;
    }

    /** 채널 퇴장(LEFT), 재접속 유예 만료(DISCONNECT) 등 이동 밖의 종료. 다음 입장은 기준 표본부터 다시 잡는다. */
    public List<Signal> leave(String userId, JumpRun.EndReason reason, long nowMs) {
        UserState state = users.remove(userId);
        var signals = new ArrayList<Signal>();
        if (state != null && state.run != null) progress(userId, state, state.run.end(reason, nowMs), nowMs, signals);
        return signals;
    }

    /** 재결합처럼 몸체가 유지된 채 연결만 바뀐 경우. 판은 그대로 두고 다음 표본을 기준으로 다시 잡는다. */
    public void rebase(String userId) {
        UserState state = users.get(userId);
        if (state != null) state.primed = false;
    }

    public Optional<RunView> active(String userId, long nowMs) {
        UserState state = users.get(userId);
        return state == null || state.run == null ? Optional.empty() : Optional.of(view(state.run, nowMs));
    }

    private void progress(String userId, UserState state, List<JumpRun.Outcome> outcomes, long nowMs, List<Signal> signals) {
        JumpRun run = state.run;
        for (var outcome : outcomes) {
            signals.add(new Progress(userId, state.channelId, run.runId(), outcome, view(run, nowMs)));
        }
        if (!run.active()) state.run = null;
    }

    private static RunView view(JumpRun run, long nowMs) {
        return new RunView(run.runId(), run.elapsedMs(nowMs), run.gatesPassed(), run.finalReached(), run.maxHeight(),
                run.suspicious(), run.reasons(), run.landings());
    }

    private static String key(Sample sample) {
        return sample.surface() == Surface.NONE ? "" : sample.surface() + ":" + sample.collider();
    }
}
