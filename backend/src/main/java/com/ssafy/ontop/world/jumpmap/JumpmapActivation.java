package com.ssafy.ontop.world.jumpmap;

import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.Callable;

/**
 * 프로세스 시작 시 한 번 정한 점프맵 코스 활성 여부. 서버 충돌체 추가와 이후 REST status의
 * enabled는 이 결정만 함께 사용한다. 비활성이어도 기존 공원 이동은 그대로 동작한다.
 */
public final class JumpmapActivation {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(JumpmapActivation.class);

    public enum State { DISABLED, INVALID_COURSE, MAP_MISMATCH, ACTIVE }

    private final State state;
    private final JumpCourse course;

    private JumpmapActivation(State state, JumpCourse course) {
        this.state = state;
        this.course = course;
    }

    public static JumpmapActivation disabled() {
        return new JumpmapActivation(State.DISABLED, null);
    }

    /** 플래그가 꺼져 있으면 코스 파일도 읽지 않는다. 코스 오류는 서버 시작을 막지 않고 점프맵만 끈다. */
    public static JumpmapActivation decide(boolean enabled, String mapVersion, Callable<JumpCourse> loader) {
        if (!enabled) {
            return disabled();
        }
        JumpCourse course;
        try {
            course = Objects.requireNonNull(loader.call());
        } catch (Exception exception) {
            log.error("점프맵 코스 검증 실패로 비활성화 reason={}", exception.getMessage());
            return new JumpmapActivation(State.INVALID_COURSE, null);
        }
        if (!course.mapVersion().equals(mapVersion)) {
            log.warn("점프맵 코스와 공원 맵 버전이 달라 비활성화 courseMap={} worldMap={} courseVersion={}",
                    course.mapVersion(), mapVersion, course.courseVersion());
            return new JumpmapActivation(State.MAP_MISMATCH, null);
        }
        log.info("점프맵 코스 충돌체 활성화 courseVersion={} rulesVersion={} sha256={} colliders={}",
                course.courseVersion(), course.rulesVersion(), course.sha256(), course.colliders().size());
        return new JumpmapActivation(State.ACTIVE, course);
    }

    public State state() { return state; }

    public boolean active() { return state == State.ACTIVE; }

    /** ACTIVE일 때만 값이 있다. 검증에 실패한 코스는 노출하지 않는다. */
    public Optional<JumpCourse> course() { return Optional.ofNullable(course); }
}
