package com.ssafy.ontop.behavior.domain;

/** 저장하지 못하고 버린 이유. 지표 태그 값으로 쓰이므로 이름을 바꾸지 않는다. */
public enum DropReason {
    /** 큐가 가득 참 */
    QUEUE_FULL,
    /** 큐가 80% 이상 차서 위치 좌표를 받지 않음 */
    POSITION_SHED,
    /** 재시도 후에도 DB 저장 실패 */
    WRITE_FAILED,
    /** 종료 중이거나 종료 제한 시간 안에 저장하지 못함 */
    SHUTDOWN,
    /** 기록을 만드는 중 오류 (잘못된 값 등) */
    INVALID
}
