package com.ssafy.ontop.auth.service;

/** User 탈퇴 트랜잭션 안에서 호출한다. 실제 연결 종료는 커밋 이후에만 수행한다. */
public interface MemberConnectionTermination {
    void memberDeactivated(long userId);
}
